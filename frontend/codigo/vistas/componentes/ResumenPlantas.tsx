import type { EChartsOption } from "echarts";
import type { Period } from "../../modelos/energia";
import { useControladorResumenPlantas } from "../../controladores/controlador_resumen_plantas";
import { chartBase } from "../../configuracion/tema_graficos";
import { GraficoSolar } from "./GraficoSolar";

export function ResumenPlantas({ periodo, revision }: { periodo: Period; revision: number }) {
  const { graficas, ultimaConsulta, cargando, error, reintentar } = useControladorResumenPlantas(periodo, revision);
  return <section aria-label="Gráficas de las seis plantas solares">
    <p className="estado-resumen-plantas" role="status">{cargando ? "Actualizando gráficas…" : "Actualización cada 5 minutos"}{ultimaConsulta && ` · Última consulta: ${ultimaConsulta.toLocaleTimeString("es-EC", { timeZone: "America/Guayaquil", hour12: false })}`}</p>
    {error && <div className="notice" role="alert"><span>{error}</span><button className="outline-button" onClick={reintentar}>Reintentar</button></div>}
    {!cargando && !error && !graficas.length && <p className="notice">No hay registros disponibles para mostrar las gráficas.</p>}
    <div className="rejilla-resumen-plantas">{graficas.map(({ central, inicio, fin, puntos }) => {
      const hayDatos = puntos.some((punto) => punto.generacionKwh !== null || punto.consumoKwh !== null);
      const option: EChartsOption = {
        ...chartBase,
        grid: { left: 50, right: 12, top: 55, bottom: 35 },
        xAxis: { type: "category", axisLine: { lineStyle: { color: "#dce3eb" } }, axisTick: { show: false }, data: puntos.map((punto) => punto.fecha), axisLabel: { color: "#52657a", fontSize: 10, hideOverlap: true, formatter: (valor: string) => `${valor.slice(8, 10)}/${valor.slice(5, 7)}` } },
        yAxis: { ...chartBase.yAxis, name: "kWh" },
        legend: { ...chartBase.legend, textStyle: { color: "#52657a", fontSize: 10 } },
        series: [
          { name: "Generación solar", type: "bar", barMaxWidth: 18, data: puntos.map((punto) => punto.generacionKwh), itemStyle: { borderRadius: [2, 2, 0, 0] } },
          { name: "Consumo", type: "bar", barMaxWidth: 18, data: puntos.map((punto) => punto.consumoKwh), itemStyle: { borderRadius: [2, 2, 0, 0] } },
        ],
      };
      return <article className="grafica-planta" key={central.id}>
        <header><h2>{central.nombre}</h2><span className={central.demostracion ? "etiqueta-demo-planta" : "etiqueta-historico-planta"}>{central.demostracion ? "Demostración" : "Histórico medido"}</span></header>
        <p className="periodo-grafica-planta">{inicio} — {fin}{central.demostracion && " · Fuente: Edificio Central UTPL"}</p>
        {hayDatos ? <GraficoSolar option={option} label={`${central.nombre}${central.demostracion ? ", demostración con datos del Edificio Central UTPL" : ""}: generación y consumo diarios en kWh, del ${inicio} al ${fin}`} /> : <p className="grafica-planta-vacia">Sin mediciones en este periodo.</p>}
      </article>;
    })}</div>
  </section>;
}
