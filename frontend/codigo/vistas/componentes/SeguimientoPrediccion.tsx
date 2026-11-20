import { InterpretacionAutomatica } from "./InterpretacionAutomatica";
import { useEffect, useState } from "react";
import { Play, Pause, SkipForward, RotateCcw, RefreshCw, Download } from "lucide-react";
import type { EChartsOption } from "echarts";
import { evaluacionDelPronostico, type ForecastResult } from "../../modelos/prediccion";
import { useControladorSeguimiento } from "../../controladores/controlador_seguimiento";
import { chartBase } from "../../configuracion/tema_graficos";
import { downloadCsv } from "../../utilidades/exportar_csv";
import { GraficoSolar } from "./GraficoSolar";

const numero = (n: number | null, decimales = 2) => n === null ? "—" : n.toLocaleString("es-EC", { maximumFractionDigits: decimales });
export function SeguimientoPrediccion({ escenario, fecha, cambiarFecha, recalcular, diaInicial, registrarFecha }: {
  escenario: ForecastResult;
  fecha: string;
  cambiarFecha: (fecha: string) => void;
  recalcular: () => void;
  diaInicial?: string;
  registrarFecha: (fecha: string) => void;
}) {
  const s = useControladorSeguimiento(escenario, diaInicial);
  const diaMostrado = s.plan?.date;
  useEffect(() => {
    if (diaMostrado) registrarFecha(diaMostrado);
  }, [diaMostrado, registrarFecha]);
  const evaluacion = s.plan ? evaluacionDelPronostico(s.plan) : undefined;
  const [unidad, setUnidad] = useState<"power" | "energy">("power");
  const factor = unidad === "power" ? .012 : 1;
  const etiqueta = unidad === "power" ? "kW medios / 5 min" : "Wh / 5 min";
  const nombreCurva = "Pronóstico de 24 h";
  const comparacion = s.comparacion;
  const puntos = comparacion?.puntos ?? [];
  const recibidos = puntos.filter((p) => p.actual_wh !== null);
  const ultima = recibidos.at(-1);
  const ejeTemporal: EChartsOption["xAxis"] = { type: "time" as const, min: puntos[0]?.timestamp, max: puntos.at(-1)?.timestamp, axisLabel: { hideOverlap: true, fontSize: 10, formatter: (valor: number) => new Date(valor).toLocaleTimeString("es-EC", { timeZone: "America/Guayaquil", hour: "2-digit", minute: "2-digit", hour12: false }) }, axisPointer: { label: { formatter: (p) => new Date(p.value instanceof Date ? p.value.getTime() : p.value).toLocaleString("es-EC", { timeZone: "America/Guayaquil", hour12: false }) } } };
  const comun: EChartsOption = { ...chartBase, useUTC: true, grid: { left: 65, right: 20, top: 60, bottom: 70 }, xAxis: ejeTemporal, dataZoom: [{ type: "inside" }, { type: "slider", bottom: 5, height: 18 }] };
  const tooltip = (unidadSerie: string): EChartsOption["tooltip"] => ({
    trigger: "axis", confine: true, renderMode: "richText",
    formatter: (parametros) => {
      const series = Array.isArray(parametros) ? parametros : [parametros];
      const valorInicial = series[0]?.value;
      const momento = Array.isArray(valorInicial) ? Number(valorInicial[0]) : NaN;
      const cabecera = Number.isFinite(momento) ? new Date(momento).toLocaleString("es-EC", { timeZone: "America/Guayaquil", hour12: false }) : "";
      return [cabecera, ...series.map((serie) => {
        const valor = Array.isArray(serie.value) ? serie.value[1] : null;
        return `${typeof serie.marker === "string" ? serie.marker : ""}${serie.seriesName}: ${valor == null ? "Pendiente" : numero(Number(valor))} ${unidadSerie}`;
      })].join("\n");
    },
  });
  const maximoCompartido = Math.max(1, ...puntos.map((p) => Math.max(p.prediction_wh, p.actual_wh ?? 0) * factor)) * 1.1;
  const ejeVertical = { ...chartBase.yAxis, name: etiqueta, min: 0, max: Math.ceil(maximoCompartido) };
  const curva: EChartsOption = { ...comun, tooltip: tooltip(unidad === "power" ? "kW medios" : "Wh"), color: ["#004270"], yAxis: ejeVertical, series: [
    { name: nombreCurva, type: "line", showSymbol: false, smooth: false, data: puntos.map((p) => [Date.parse(p.timestamp), p.prediction_wh * factor]), lineStyle: { width: 2, type: "dashed" } },
  ] };
  const historico: EChartsOption = { ...comun, tooltip: tooltip(unidad === "power" ? "kW medios" : "Wh"), color: ["#004270", "#c88500"], yAxis: ejeVertical, series: [
    { name: nombreCurva, type: "line", showSymbol: false, smooth: false,
      data: puntos.map((p) => [Date.parse(p.timestamp), p.prediction_wh * factor]),
      lineStyle: { width: 2, type: "dashed" } },
    { name: s.modo === "real" ? "Mediciones de Supabase" : "Producción medida", z: 3, type: "line", showSymbol: recibidos.length < 2, symbolSize: 7, smooth: false, connectNulls: false, data: puntos.map((p) => [Date.parse(p.timestamp), p.actual_wh === null ? null : p.actual_wh * factor]), lineStyle: { width: 2.5 } },
  ] };
  const picoPrevisto = puntos.reduce<(typeof puntos)[number] | null>((max, p) => !max || p.prediction_wh > max.prediction_wh ? p : max, null);
  const picoMedido = recibidos.reduce<(typeof puntos)[number] | null>((max, p) => !max || (p.actual_wh ?? 0) > (max.actual_wh ?? 0) ? p : max, null);
  const baseInterpretacion = {
    tipo_curva: "Pronóstico calculado con antecedentes",
    fecha: s.plan?.date, zona_horaria: "America/Guayaquil",
    metodo: s.plan?.method_label,
    fuente_meteorologica: s.plan?.weather_source,
    respaldo_historico: s.plan?.fallback,
    version_del_informe: s.plan?.report.created_at,
    modo: s.modo === "real" ? "Lecturas almacenadas en Supabase; zona horaria legada pendiente de verificar" : "Reproducción histórica sincronizada; no son datos en vivo",
    unidades: "Energía Wh por intervalo de 5 minutos bajo supuesto legado pendiente de validación. Potencia media derivada en kW = Wh * 0.012.",
  };
  return <div className="seguimiento-prediccion">
    <section className="panel controles-seguimiento">
      <div className="panel-heading"><div><h2>Seguimiento cada cinco minutos</h2><p className="chart-description">Consulta el pronóstico del día y compáralo con las mediciones disponibles.</p></div></div>
      <div className="modos-seguimiento" role="group" aria-label="Fuente del seguimiento">
        <button aria-pressed={s.modo === "real"} onClick={() => s.setModo("real")}>Seguimiento de Supabase</button>
        <button aria-pressed={s.modo === "reproduccion"} onClick={() => s.setModo("reproduccion")}>Histórico con la hora actual</button>
      </div>
      {s.modo === "real" ? <>
        <form className="fecha-seguimiento" onSubmit={(event) => { event.preventDefault(); recalcular(); }}><label>Fecha a seguir<input type="date" required min={escenario.report.partitions.test.start.slice(0, 10)} value={fecha} onChange={(event) => cambiarFecha(event.target.value)} /></label><button className="outline-button">Fijar curva para este día</button><button type="button" className="outline-button" disabled={s.cargando} onClick={s.actualizar}><RefreshCw size={14} />Consultar ahora</button></form>
        <p className="nota-seguimiento">Consulta cada 5 minutos las mediciones almacenadas. La zona horaria original de los registros legados está pendiente de confirmar: la comparación por instante puede quedar desplazada y debe tratarse como provisional. Los intervalos pendientes quedan vacíos; esta consulta no inserta registros nuevos.</p>
      </> : <>
        <form className="fecha-seguimiento" onSubmit={(evento) => {
          evento.preventDefault();
          const dia = String(new FormData(evento.currentTarget).get("dia"));
          // Publicar la fecha inmediatamente para que, si se cambia de vista
          // mientras carga el histórico, el pronóstico abra ese mismo día.
          registrarFecha(dia);
          s.setFechaHistorica(dia);
        }}>
          <label>Día histórico<input key={s.fechaHistorica ?? s.plan?.date} name="dia" type="date" required
            min={escenario.report.partitions.test.start.slice(0, 10)}
            max={escenario.report.partitions.test.end.slice(0, 10)}
            defaultValue={s.fechaHistorica ?? s.plan?.date} /></label>
          <button className="outline-button" disabled={s.cargando}>Ver día</button>
        </form>
        {s.plan && evaluacion?.errores && <p className="nota-seguimiento">
          {s.plan.date === "2025-05-25" && "Este día se eligió como ejemplo con el método anterior. "}
          En {evaluacion.dias} días de prueba, {evaluacion.metodo} obtuvo un RMSE de {numero(evaluacion.errores.rmse_wh)} Wh por intervalo.
        </p>}
        <p className="aviso-reproduccion"><strong>Reproducción histórica.</strong> El reloj de Ecuador marca hasta qué hora se muestran las mediciones del día elegido. La línea naranja avanza cada cinco minutos mientras la reproducción está sincronizada.</p>
        <div className="reproductor-seguimiento"><button className="primary-button" disabled={!s.plan} onClick={s.alternarSincronizacion}>{s.avanzando ? <Pause size={14} /> : <Play size={14} />}{s.avanzando ? "Pausar" : "Sincronizar con hora actual"}</button><button className="outline-button" disabled={!s.plan || s.cursor >= 288} onClick={s.siguiente}><SkipForward size={14} />Siguiente intervalo</button><button className="outline-button" onClick={s.reiniciar}><RotateCcw size={14} />Desde las 00:00</button><label>Intervalos visibles <input type="range" min="0" max="288" step="1" value={s.cursor} onChange={(event) => { s.setEjecutando(false); s.setCursor(Number(event.target.value)); }} aria-label="Intervalos históricos visibles" /></label><span>{s.cursor} / 288</span></div>
        <details className="ayuda-reproduccion"><summary>Origen y ritmo de reproducción</summary><p>Se usa un día de prueba del Edificio Central. La predicción se calcula exclusivamente con antecedentes anteriores al día, y permanece fija al recibir las mediciones. No se insertan registros en Supabase. Al abrir se muestran las lecturas hasta la hora actual de Ecuador, redondeada al intervalo de cinco minutos anterior. Por ejemplo, a las 17:03 se ven los datos históricos hasta las 17:00. El año original se conserva. Al llegar a medianoche comienza de nuevo el mismo día histórico. Los controles manuales pausan la sincronización; puedes reanudarla con «Sincronizar con hora actual».</p></details>
      </>}
      {s.cargando && <p role="status">Consultando mediciones…</p>}
      {s.error && <p role="alert">{s.error} <button className="text-button" onClick={s.actualizar}>Reintentar</button></p>}
    </section>
    {s.plan && comparacion && <>
      <p className="estado-seguimiento" role="status">{s.modo === "real" ? "Supabase" : "Histórico auditado"} · {s.plan.date} · {comparacion.recibidos} de {s.plan.forecast.length} intervalos comparables{s.modo === "real" && s.ultimaConsulta ? ` · Última consulta: ${s.ultimaConsulta.toLocaleTimeString("es-EC", { timeZone: "America/Guayaquil", hour12: false })}` : ""}. {ultima ? `Última lectura: ${new Date(ultima.timestamp).toLocaleTimeString("es-EC", { timeZone: "America/Guayaquil", hour12: false })}.` : "Esperando la primera lectura del día."}</p>
      {comparacion.recibidos === 0 && <p className="notice">Aún no hay mediciones comparables para este día. La curva medida aparecerá cuando estén disponibles; también puedes explorar la reproducción histórica.</p>}
      {comparacion.fueraDeRejilla > 0 && <p className="notice">{comparacion.fueraDeRejilla} registros no coinciden exactamente con la rejilla de predicción. No se redondean ni se usan para calcular el error.</p>}
      <div className="metricas-seguimiento">
        <article><span>Energía medida</span><strong>{numero(comparacion.actualKwh)} <small>kWh</small></strong></article>
        <article><span>{"Prevista en esos intervalos"}</span><strong>{numero(comparacion.predictedKwh)} <small>kWh</small></strong></article>
        <article><span>{"Medida / prevista"}</span><strong>{numero(comparacion.relacionPct, 1)} <small>%</small></strong></article>
        <article><span>Error absoluto parcial</span><strong>{numero(comparacion.maeWh)} <small>Wh / 5 min</small></strong></article>
      </div>
      <div className="grafica-con-interpretacion">
      <section className="panel curva-seguimiento"><div className="panel-heading"><div><h2>{nombreCurva}</h2><p className="chart-description">{s.plan.date} · hora de Ecuador · {s.plan.method_label ?? "Pronóstico de 24 horas"} · Antecedentes hasta {s.plan.source_end.slice(0,10)}</p>
        {s.plan.weather_source && <p className="chart-description">{s.plan.weather_source}</p>}
        {s.plan.fallback && <p className="nota-seguimiento">Para esta fecha se usó el método histórico de respaldo.</p>}
        </div><div className="segmented compact"><button aria-pressed={unidad === "power"} onClick={() => setUnidad("power")}>kW</button><button aria-pressed={unidad === "energy"} onClick={() => setUnidad("energy")}>Wh</button></div></div><GraficoSolar option={curva} label={`${nombreCurva} del día, en azul`} /></section>
        <InterpretacionAutomatica lateral titulo={"Lectura de la predicción"} pregunta="Interpreta la predicción anticipada construida solo con antecedentes anteriores al día en un máximo de 80 palabras. Explica energía prevista, hora y valor del pico y carácter de escenario histórico. No saludes ni inventes causas meteorológicas. Usa dos párrafos breves y redondea a dos decimales." contexto={{
          ...baseInterpretacion, energia_prevista_dia_kwh: s.plan.total_kwh,
          pico_previsto: picoPrevisto ? { hora: picoPrevisto.hora, energia_wh_intervalo: picoPrevisto.prediction_wh, potencia_media_kw: picoPrevisto.prediction_wh * .012 } : null,
          entradas_hasta: s.plan.source_end, escenario: s.plan.method_label,
          evaluacion_historica_del_metodo: evaluacion,
        }} />
      </div>
      <div className="grafica-con-interpretacion">
      <section className="panel curva-seguimiento">
        <h2>Pronóstico frente a la producción medida</h2>
        <p className="chart-description">
          {s.plan.date} · Hora de Ecuador. {ultima
            ? `Última lectura visible a las ${ultima.hora}. La línea naranja muestra las lecturas disponibles.`
            : "Esperando la primera lectura para dibujar la línea naranja."}
        </p>
        <GraficoSolar option={historico} label="Pronóstico del día en azul discontinuo y producción medida disponible en naranja" />
      </section>
        <InterpretacionAutomatica lateral titulo="Lectura de las mediciones" pregunta="Interpreta únicamente las mediciones recibidas en un máximo de 90 palabras. Indica cobertura y última hora recibida, compara energía medida y prevista SOLO en esos intervalos, y menciona pico medido. Si no hay lecturas dilo; no trates pendientes como ceros ni inventes causas. No saludes, usa dos párrafos y dos decimales." contexto={{
          ...baseInterpretacion, intervalos_recibidos: comparacion.recibidos, intervalos_totales: puntos.length,
          ultima_hora_recibida: ultima?.hora ?? null,
          energia_medida_intervalos_recibidos_kwh: comparacion.actualKwh,
          energia_prevista_mismos_intervalos_kwh: comparacion.predictedKwh,
          error_absoluto_medio_parcial_wh: comparacion.maeWh,
          pico_medido: picoMedido ? { hora: picoMedido.hora, energia_wh_intervalo: picoMedido.actual_wh, potencia_media_kw: (picoMedido.actual_wh ?? 0) * .012 } : null,
        }} />
      </div>
      <p className="nota-seguimiento">La relación medida/prevista puede superar el 100 % y no es un porcentaje de precisión. El error mostrado es parcial, distinto del MAE del conjunto de prueba. {"La previsión utiliza información disponible antes del día objetivo."}</p>
      <details className="panel data-table"><summary>Ver las últimas lecturas comparadas</summary><button className="outline-button" disabled={!recibidos.length} onClick={() => downloadCsv(recibidos.map((p) => ({ fecha_hora: p.timestamp, prevista_wh: p.prediction_wh, medida_wh: p.actual_wh, error_wh: p.error_wh, modo: s.modo, tipo_curva: s.plan!.mode, fuente: s.modo === "real" ? "Supabase" : "historico_auditado_reproducido" })), `seguimiento-${s.modo}-${s.plan!.date}.csv`)}><Download size={14} />Exportar comparación</button><div className="table-scroll"><table><caption>Últimos intervalos recibidos · error = medida − prevista</caption><thead><tr><th>Hora Ecuador</th><th>{"Prevista (Wh)"}</th><th>Medida (Wh)</th><th>Error (Wh)</th></tr></thead><tbody>{recibidos.slice(-12).map((p) => <tr key={p.timestamp}><th>{p.hora}</th><td>{numero(p.prediction_wh)}</td><td>{numero(p.actual_wh)}</td><td>{numero(p.error_wh)}</td></tr>)}</tbody></table></div></details>
    </>}
  </div>;
}
