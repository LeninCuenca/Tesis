import { InterpretacionAutomatica } from "./InterpretacionAutomatica";
import { SeguimientoPrediccion } from "./SeguimientoPrediccion";
import { useMemo, useState } from "react";
import { evaluacionDelPronostico } from "../../modelos/prediccion";
import { useControladorPrediccion, useControladorPrediccionPuntual } from "../../controladores/controlador_prediccion";
import {
  AlertCircle,
  ArrowUpRight,
  BrainCircuit,
  Download,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import type { EChartsOption } from "echarts";
import { downloadCsv } from "../../utilidades/exportar_csv";
import { GraficoSolar } from "./GraficoSolar";
import { chartBase } from "../../configuracion/tema_graficos";

const number = (value: number, digits = 1) =>
  value.toLocaleString("es-EC", { maximumFractionDigits: digits });
const dateLabel = (value: string) =>
  new Date(value).toLocaleDateString("es-EC", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Guayaquil",
  });

export function PanelPrediccion() {
  const [view, setView] = useState<"tracking" | "scenario" | "backtest" | "models">(
    "tracking",
  );
  const [fechaSeguida, setFechaSeguida] = useState<string>();
  const [mostrarBanda, setMostrarBanda] = useState(false);
  const [unit, setUnit] = useState<"power" | "energy">("power");
  const { result, date, setDate, loading, error, load } = useControladorPrediccion();
  const report = result?.report;
  const diario = report?.pronostico_diario;
  const fechaEnPrueba = result && report &&
    result.date >= report.partitions.test.start.slice(0, 10) &&
    result.date <= report.partitions.test.end.slice(0, 10);
  const evaluacion = result ? evaluacionDelPronostico(result) : undefined;
  const peak = result?.forecast.reduce(
    (best, point) => (point.prediction_wh > best.prediction_wh ? point : best),
    result.forecast[0],
  );
  const multiplier = unit === "power" ? 12 / 1000 : 1;
  const unitLabel = unit === "power" ? "kW medios / 5 min" : "Wh / 5 min";
  const option = useMemo<EChartsOption>(() => {
    const points =
      view === "backtest" ? (report?.backtest ?? []) : (result?.forecast ?? []);
    const times = points.map((point) =>
      new Date(point.timestamp).toLocaleTimeString("es-EC", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "America/Guayaquil",
      }),
    );
    if (view === "backtest")
      return {
        ...chartBase,
        grid: { left: 58, right: 20, top: 74, bottom: 50 },
        color: ["#004270", "#bd8100"],
        xAxis: {
          type: "category",
          data: times,
          boundaryGap: false,
          axisLabel: { hideOverlap: true, fontSize: 10 },
        },
        yAxis: { ...chartBase.yAxis, name: unitLabel },
        dataZoom: [
          { type: "inside" },
          { type: "slider", bottom: 0, height: 18 },
        ],
        series: [
          {
            name: "Medida",
            type: "line",
            showSymbol: false,
            data: report?.backtest.map((point) => point.actual_wh * multiplier),
          },
          {
            name: "Estimada con clima observado",
            type: "line",
            showSymbol: false,
            lineStyle: { type: "dashed" },
            data: report?.backtest.map(
              (point) => point.predicted_wh * multiplier,
            ),
          },
        ],
      };
    const data = result?.forecast ?? [];
    return {
      ...chartBase,
      grid: { left: 58, right: 20, top: 74, bottom: 50 },
      color: ["#004270", "#8594aa", "#d8e4ef", "#d8e4ef"],
      xAxis: {
        type: "category",
        data: times,
        boundaryGap: false,
        axisLabel: { hideOverlap: true, fontSize: 10 },
      },
      yAxis: { ...chartBase.yAxis, name: unitLabel },
      dataZoom: [{ type: "inside" }, { type: "slider", bottom: 0, height: 18 }],
      legend: {
        ...chartBase.legend,
        data: ["Pronóstico", "Promedio histórico", ...(mostrarBanda ? ["Margen de incertidumbre"] : [])],
      },
      series: [
        {
          name: "Pronóstico",
          type: "line",
          showSymbol: false,
          z: 4,
          lineStyle: { width: 2.5 },
          data: data.map((point) => point.prediction_wh * multiplier),
        },
        {
          name: "Promedio histórico",
          type: "line",
          showSymbol: false,
          lineStyle: { type: "dashed", width: 1.5 },
          data: data.map((point) => point.baseline_wh * multiplier),
        },
        ...(mostrarBanda ? [
          {
            name: "Límite inferior",
            type: "line" as const,
            stack: "band",
            symbol: "none",
            lineStyle: { opacity: 0 },
            areaStyle: { opacity: 0 },
            tooltip: { show: false },
            data: data.map((point) => point.lower_wh * multiplier),
          },
          {
            name: "Margen de incertidumbre",
            type: "line" as const,
            stack: "band",
            symbol: "none",
            lineStyle: { opacity: 0 },
            areaStyle: { color: "#9ebbd0", opacity: 0.28 },
            tooltip: { show: false },
            data: data.map(
              (point) => (point.upper_wh - point.lower_wh) * multiplier,
            ),
          },
        ] : []),
      ],
    };
  }, [report, result, view, unitLabel, multiplier, mostrarBanda]);

  return (
    <div className="prediction-workspace" aria-busy={loading}>
      <div className="analysis-toolbar">
        <div className="segmented" aria-label="Vista del análisis">
          {(
            [
              ["tracking", "Seguimiento 5 min"],
              ["scenario", "Pronóstico 24 h"],
              ["backtest", "Diagnóstico con clima observado"],
              ["models", "Evaluación"],
            ] as const
          ).map(([key, label]) => (
            <button
              type="button"
              key={key}
              onClick={() => {
                setView(key);
                // La fecha elegida en seguimiento es la referencia para comparar
                // ambas curvas. Sincronizar al entrar al escenario, incluso si
                // se llegó desde otra pestaña del módulo.
                if (key === "scenario" && fechaSeguida && fechaSeguida !== result?.date) {
                  void load(fechaSeguida);
                }
              }}
              aria-pressed={view === key}
            >
              {label}
            </button>
          ))}
        </div>
        {view === "scenario" && (        <button
          className="outline-button"
          disabled={!result || loading}
          onClick={() =>
            result &&
            downloadCsv(
              result.forecast.map((point) => ({
                fecha_hora: point.timestamp,
                energia_estimada_wh_5min: point.prediction_wh,
                potencia_media_kw: point.mean_power_kw,
                limite_inferior_wh: point.lower_wh,
                limite_superior_wh: point.upper_wh,
                baseline_wh: point.baseline_wh,
                irradiancia_wm2: point.irradiacion,
                temperatura_ambiente_c: point.temperatura_ambiente,
                metodo: result.method_label,
                fuente_meteorologica: result.weather_source,
                respaldo: result.fallback,
              })),
              `escenario-solar-${result.date}.csv`,
            )
          }
        >
          <Download size={16} /> Exportar escenario
        </button>)}
      </div>
      {loading && (
        <div className="panel loading-panel" role="status">
          <RefreshCw className="spin" size={24} />
          <h2>Calculando el escenario</h2>
          <p>Preparando 288 intervalos y el informe de evaluación.</p>
        </div>
      )}
      {error && (
        <div className="panel prediction-error" role="alert">
          <AlertCircle size={22} />
          <div>
            <h2>No se pudo cargar el análisis</h2>
            <p>{error}</p>
          </div>
          <button
            className="outline-button"
            onClick={() => void load(date || undefined)}
          >
            Reintentar
          </button>
          {date && <button className="outline-button" onClick={() => void load()}>Abrir fecha predeterminada</button>}
        </div>
      )}
      {result && report && (
        <>
          {view === "scenario" && <div className="prediction-kpis">
            <Metric
              label="Energía del escenario"
              value={number(result.total_kwh, 2)}
              unit="kWh / 24 h"
              detail="Suma de 288 intervalos estimados"
            />
            <Metric
              label="Pico de potencia media"
              value={peak ? number(peak.mean_power_kw, 2) : "—"}
              unit="kW"
              detail={peak ? `${peak.hora} · hora de Ecuador` : ""}
            />
            <Metric
              label="MAE del pronóstico de 24 h"
              value={evaluacion?.errores ? number(evaluacion.errores.mae_wh, 2) : "—"}
              unit="Wh / 5 min"
              detail={evaluacion?.errores ? `${evaluacion.dias} días de prueba · ${evaluacion.metodo}` : "Evaluación diaria pendiente"}
            />
            <Metric
              label="Frente al promedio histórico"
              value={
                diario && evaluacion?.errores && diario.referencia_prueba.rmse_wh > 0
                  ? `${number(100 * (1 - evaluacion.errores.rmse_wh / diario.referencia_prueba.rmse_wh))}%`
                  : "—"
              }
              unit=""
              detail="Reducción del RMSE en prueba"
            />
          </div>}
          {view === "tracking" ? (
            <SeguimientoPrediccion
              key={`${result.date}:${report.created_at}`}
              escenario={result}
              fecha={date}
              cambiarFecha={setDate}
              recalcular={() => void load(date)}
              diaInicial={fechaEnPrueba ? result.date : undefined}
              registrarFecha={setFechaSeguida}
            />
          ) : view !== "models" ? (
            <section className="panel prediction-chart-panel">
              <div className="panel-heading">
                <div>
                  <span className="provenance-tag">
                    <BrainCircuit size={13} />
                    {view === "scenario"
                      ? "Pronóstico diario"
                      : "Meteorología medida en el mismo intervalo"}
                  </span>
                  <h2>
                    {view === "scenario"
                      ? "Producción solar prevista"
                      : `${report.model} con clima observado`}
                  </h2>
                  <p className="chart-description">
                    {view === "scenario"
                      ? `${dateLabel(result.forecast[0].timestamp)} · ${result.method_label ?? "Pronóstico de 24 horas"}`
                      : `${report.backtest[0] ? dateLabel(report.backtest[0].timestamp) : "Sin registros"} · último día del conjunto de prueba`}
                  </p>
                  {view === "scenario" && <p className="chart-description">
                    Para comparar con mediciones, abre Seguimiento 5 min.
                  </p>}
                  {view === "scenario" && result.weather_source && <p className="chart-description">{result.weather_source}</p>}
                  {view === "scenario" && result.fallback && <p className="nota-seguimiento">Este día utiliza el método histórico de respaldo.</p>}
                </div>
                <div className="prediction-chart-actions">
                  {view === "scenario" && <button type="button" className="outline-button" aria-pressed={mostrarBanda}
                    onClick={() => setMostrarBanda(!mostrarBanda)}>
                    {mostrarBanda ? "Ocultar margen de incertidumbre" : "Mostrar margen de incertidumbre"}
                  </button>}
                  <div className="segmented compact">
                    <button
                      aria-pressed={unit === "power"}
                      onClick={() => setUnit("power")}
                    >
                      kW
                    </button>
                    <button
                      aria-pressed={unit === "energy"}
                      onClick={() => setUnit("energy")}
                    >
                      Wh
                    </button>
                  </div>
                </div>
              </div>
              <GraficoSolar
                option={option}
                label={
                  view === "scenario"
                    ? `Pronóstico y promedio histórico${mostrarBanda ? " con margen de incertidumbre" : ""}`
                    : "Energía medida y estimación calculada con los sensores meteorológicos del mismo intervalo"
                }
                className="forecast-plot"
              />
              {(view === "backtest" || mostrarBanda) && <div className="chart-footnote">
                <ShieldCheck size={16} />
                <span>
                  {view === "scenario"
                    ? `Banda nominal del 90 % por intervalo. ${evaluacion?.cobertura == null ? "Cobertura del método pendiente de evaluación." : `En prueba cubrió el ${number(evaluacion.cobertura * 100)} % de los intervalos.`} El sombreado representa un rango para cada tramo de cinco minutos.`
                    : "La curva estimada utiliza la irradiancia y las temperaturas medidas durante el día mostrado."}
                </span>
              </div>}
              {view === "scenario" && evaluacion?.errores?.mae_diario_kwh != null && (
                <details className="chart-footnote">
                  <summary>Error en energía diaria</summary>
                  <p>
                    En {evaluacion.dias} días, el error absoluto medio del total diario fue de{" "}
                    {number(evaluacion.errores.mae_diario_kwh, 2)} kWh.
                    {evaluacion.errores.sesgo_diario_kwh != null && (
                      <> El sesgo medio (pronóstico menos medición) fue de {number(evaluacion.errores.sesgo_diario_kwh, 2)} kWh al día.</>
                    )}
                    {diario?.periodo_prueba_examinado_previamente && " Este periodo ya fue examinado en revisiones anteriores."}
                  </p>
                </details>
              )}
              {view === "scenario" && (
                <form
                  className="scenario-date"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void load(date);
                  }}
                >
                  <label htmlFor="scenario-date">
                    Fecha del escenario{" "}
                    <input
                      id="scenario-date"
                      type="date"
                      required
                      min={report.partitions.test.start.slice(0, 10)}
                      value={date}
                      onChange={(event) => setDate(event.target.value)}
                    />
                  </label>
                  <button className="outline-button" disabled={loading}>
                    <RefreshCw size={14} /> Recalcular
                  </button>
                  <span>
                    El pronóstico usa los datos disponibles antes de la fecha elegida.
                  </span>
                </form>
              )}
            </section>
          ) : (
            <>
              {diario && <section className="panel">
                <h2>Pronóstico emitido antes del día</h2>
                <p className="chart-description">{diario.nombre} · {diario.dias_prueba} días de prueba · {dateLabel(report.partitions.test.start)} — {dateLabel(report.partitions.test.end)}</p>
                <div className="test-metrics">
                  <Metric label="RMSE por intervalo" value={number(diario.prueba.rmse_wh, 2)} unit="Wh / 5 min" detail="Da más peso a los errores grandes" />
                  <Metric label="Error absoluto medio" value={number(diario.prueba.mae_wh, 2)} unit="Wh / 5 min" detail="Incluye las horas nocturnas" />
                  <Metric label="Error del total diario" value={diario.prueba.mae_diario_kwh == null ? "—" : number(diario.prueba.mae_diario_kwh, 2)} unit="kWh/día" detail="Diferencia absoluta media en energía" />
                  <Metric label="Sesgo diario" value={diario.prueba.sesgo_diario_kwh == null ? "—" : number(diario.prueba.sesgo_diario_kwh, 2)} unit="kWh/día" detail="Un valor positivo indica sobreestimación" />
                </div>
                {diario.media_180_dias_prueba && <p className="muted-copy">En esos mismos días, el perfil medio de 180 días obtuvo un RMSE de {number(diario.media_180_dias_prueba.rmse_wh, 2)} Wh por intervalo
                  {diario.media_180_dias_prueba.mae_diario_kwh != null && <> y un error diario de {number(diario.media_180_dias_prueba.mae_diario_kwh, 2)} kWh</>}.</p>}
                {result.fallback && <p className="nota-seguimiento">Para {result.date} se usó {evaluacion?.metodo ?? "el método de respaldo por calendario"}.
                  {evaluacion?.errores && <> Su RMSE en prueba fue de {number(evaluacion.errores.rmse_wh, 2)} Wh por intervalo.</>}</p>}
                {diario.periodo_prueba_examinado_previamente && <p className="muted-copy">Este periodo también se utilizó para revisar versiones anteriores.</p>}
              </section>}
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <span className="provenance-tag">
                      <ShieldCheck size={13} />
                      Validación cronológica
                    </span>
                    <h2>Estimación con meteorología observada</h2>
                    <p className="chart-description">
                      Los modelos reciben irradiancia y temperaturas medidas en el intervalo que estiman.
                      La selección usa el RMSE de validación.
                    </p>
                  </div>
                </div>
                <div className="table-scroll">
                  <table>
                    <caption>
                      Comparación en validación, Wh por intervalo de cinco
                      minutos
                    </caption>
                    <thead>
                      <tr>
                        <th>Modelo</th>
                        <th>MAE ↓</th>
                        <th>RMSE ↓</th>
                        <th>R²</th>
                        <th>Selección</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.validation.map((model) => (
                        <tr key={model.model}>
                          <th scope="row">{model.model}</th>
                          <td>{number(model.mae_wh, 2)}</td>
                          <td>{number(model.rmse_wh, 2)}</td>
                          <td>{number(model.r2, 3)}</td>
                          <td>
                            {model.model === report.model ? (
                              <span className="selected-label">
                                Seleccionado
                              </span>
                            ) : (
                              "Comparado"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="panel">
                <h2>{report.model} con meteorología observada en prueba</h2>
                <div className="test-metrics">
                  <Metric
                    label="RMSE"
                    value={number(report.test.rmse_wh, 2)}
                    unit="Wh / 5 min"
                    detail={`Baseline: ${number(report.baseline.rmse_wh, 2)} Wh`}
                  />
                  <Metric
                    label="R²"
                    value={number(report.test.r2, 3)}
                    unit=""
                    detail="Coeficiente de determinación; no es exactitud porcentual"
                  />
                  <Metric
                    label="Sesgo medio"
                    value={number(report.test.bias_wh, 2)}
                    unit="Wh / 5 min"
                    detail="Positivo: sobreestimación"
                  />
                  <Metric
                    label="MAE diurno"
                    value={
                      report.daylight_test
                        ? number(report.daylight_test.mae_wh, 2)
                        : "—"
                    }
                    unit="Wh / 5 min"
                    detail="Solo irradiancia > 20 W/m²"
                  />
                </div>
              </section>
            </>
          )}
          {(view === "scenario" || view === "backtest") && <InterpretacionAutomatica
            key={view + result.date}
            contexto={view === "scenario" ? {
              vista: "Escenario histórico completo, no mediciones en vivo",
              fecha: result.date, zona_horaria: result.timezone, fuente_historica_hasta: result.source_end,
              escenario: result.method_label, fuente_meteorologica: result.weather_source, respaldo_historico: result.fallback,
              evaluacion_historica_del_metodo: evaluacion, version_del_informe: report.created_at,
              energia_predicha_dia_kwh: result.total_kwh, pico_kw: peak?.mean_power_kw, hora_pico: peak?.hora,
              prediccion_por_intervalo: result.forecast.map(p => ({ hora: p.hora, prediccion_wh: p.prediction_wh })),
              nota: "La banda es por intervalo; no hay mediciones comparables en esta vista."
            } : {
              vista: "Diagnóstico retrospectivo con meteorología medida durante el día evaluado",
              zona_horaria: result.timezone, modelo: report.model, metricas_de_prueba: report.test, version_del_informe: report.created_at,
              intervalos_de_prueba_mostrados: report.backtest,
              nota: "No confundir la evaluación de prueba con el escenario de pronóstico."
            }}
          />}
          {view !== "tracking" && <><div className="analysis-bottom">
            <section className="panel methodology-panel">
              <div className="panel-heading">
                <div>
                  <p className="panel-kicker">Particiones del modelo con clima observado</p>
                  <h2>{report.model}</h2>
                </div>
                <ArrowUpRight size={20} />
              </div>
              <div className="partition-list">
                {Object.entries(report.partitions).map(([name, part]) => (
                  <div key={name}>
                    <span>
                      {{
                        train: "Entrenamiento",
                        validation: "Validación",
                        calibration: "Calibración",
                        test: "Prueba final",
                      }[name] ?? name}
                    </span>
                    <strong>
                      {part.rows.toLocaleString("es-EC")} registros
                    </strong>
                    <small>
                      {dateLabel(part.start)} — {dateLabel(part.end)}
                    </small>
                  </div>
                ))}
              </div>
              <p className="muted-copy">
                Entrenamiento final = entrenamiento + validación. Calibración y
                prueba permanecen separadas.
              </p>
            </section>
            <section className="panel interpretation-panel">
              <p className="panel-kicker">Cómo interpretar este análisis</p>
              <h2>Estimación con contexto</h2>
              <ul>
                {result.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
              <p className="data-source-note">
                Datos de referencia: {dateLabel(result.source_start)} —{" "}
                {dateLabel(result.source_end)}. Zona horaria: {result.timezone}.
              </p>
              <details>
                <summary>Supuestos y límites de la evaluación</summary>
                <ul>
                  {report.limitations.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </details>
            </section>
          </div>
          {view === "scenario" && <details className="panel data-table">
            <summary>Consultar valores del escenario (288 intervalos)</summary>
            <div className="table-scroll">
              <table>
                <caption>
                  Energía estimada y potencia media; datos calculados, no
                  mediciones
                </caption>
                <thead>
                  <tr>
                    <th>Hora Ecuador</th>
                    <th>Energía (Wh / 5 min)</th>
                    <th>Potencia media (kW)</th>
                    <th>Irradiancia (W/m²)</th>
                  </tr>
                </thead>
                <tbody>
                  {result.forecast.map((point) => (
                    <tr key={point.timestamp}>
                      <th scope="row">{point.hora}</th>
                      <td>{number(point.prediction_wh, 2)}</td>
                      <td>{number(point.mean_power_kw, 2)}</td>
                      <td>{point.irradiacion === null ? "—" : number(point.irradiacion)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>}
          <PointScenario date={result.date} /></>}
        </>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  unit,
  detail,
}: {
  label: string;
  value: string;
  unit: string;
  detail: string;
}) {
  return (
    <article className="analysis-metric">
      <span>{label}</span>
      <strong>
        {value} <small>{unit}</small>
      </strong>
      <p>{detail}</p>
    </article>
  );
}

function PointScenario({ date }: { date: string }) {
  const { busy, answer, calcular } = useControladorPrediccionPuntual();
  return (
    <details className="panel">
      <summary>Explorar condiciones meteorológicas de un intervalo</summary>
      <p className="muted-copy">
        Introduce condiciones hipotéticas. El resultado es una estimación para
        cinco minutos.
      </p>
      <form
        className="point-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const values = new FormData(event.currentTarget);
          await calcular(values);
        }}
      >
        <label>
          Fecha y hora Ecuador
          <input
            name="timestamp"
            type="datetime-local"
            defaultValue={`${date}T12:00`}
            required
          />
        </label>
        <label>
          Irradiancia (W/m²)
          <input
            name="irradiance"
            type="number"
            min="0"
            max="1600"
            step="any"
            defaultValue="600"
            required
          />
        </label>
        <label>
          Temperatura ambiente (°C)
          <input
            name="temperature"
            type="number"
            min="-30"
            max="60"
            step="any"
            defaultValue="22"
            required
          />
        </label>
        <button className="primary-button" disabled={busy}>
          {busy ? "Calculando…" : "Estimar intervalo"}
        </button>
      </form>
      <p className="scenario-answer" role="status">
        {answer}
      </p>
    </details>
  );
}
