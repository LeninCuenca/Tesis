import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  BrainCircuit,
  Download,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import type { EChartsOption } from "echarts";
import {
  fetchAutomaticForecast,
  predictProduction,
  type ForecastResult,
} from "../services/predictionService";
import { downloadCsv } from "../utils/exportCsv";
import { SolarChart } from "./SolarChart";
import { chartBase } from "../lib/chartTheme";

const number = (value: number, digits = 1) =>
  value.toLocaleString("es-EC", { maximumFractionDigits: digits });
const dateLabel = (value: string) =>
  new Date(value).toLocaleDateString("es-EC", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Guayaquil",
  });

export function PredictionPanel() {
  const [result, setResult] = useState<ForecastResult | null>(null);
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<"scenario" | "backtest" | "models">(
    "scenario",
  );
  const [unit, setUnit] = useState<"power" | "energy">("power");
  const controller = useRef<AbortController | null>(null);
  const load = useCallback(async (selectedDate?: string) => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const next = await fetchAutomaticForecast(selectedDate, current.signal);
      if (!current.signal.aborted) {
        setResult(next);
        setDate(next.date);
      }
    } catch (reason) {
      if (!current.signal.aborted)
        setError(
          reason instanceof Error
            ? reason.message
            : "No se pudo generar el escenario",
        );
    } finally {
      if (!current.signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Inicia una consulta externa cancelable y muestra su estado.
    void load();
    return () => controller.current?.abort();
  }, [load]);
  const report = result?.report;
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
        color: ["#2473aa", "#c88718"],
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
            name: "Predicha en prueba",
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
      color: ["#c88718", "#8594aa", "#d8e4ef", "#d8e4ef"],
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
        data: ["Estimada", "Baseline histórico", "Banda histórica 90% nominal"],
      },
      series: [
        {
          name: "Estimada",
          type: "line",
          showSymbol: false,
          z: 4,
          lineStyle: { width: 2.5 },
          data: data.map((point) => point.prediction_wh * multiplier),
        },
        {
          name: "Baseline histórico",
          type: "line",
          showSymbol: false,
          lineStyle: { type: "dashed", width: 1.5 },
          data: data.map((point) => point.baseline_wh * multiplier),
        },
        {
          name: "Límite inferior",
          type: "line",
          stack: "band",
          symbol: "none",
          lineStyle: { opacity: 0 },
          areaStyle: { opacity: 0 },
          tooltip: { show: false },
          data: data.map((point) => point.lower_wh * multiplier),
        },
        {
          name: "Banda histórica 90% nominal",
          type: "line",
          stack: "band",
          symbol: "none",
          lineStyle: { opacity: 0 },
          areaStyle: { color: "#9ebbd0", opacity: 0.28 },
          tooltip: { show: false },
          data: data.map(
            (point) => (point.upper_wh - point.lower_wh) * multiplier,
          ),
        },
      ],
    };
  }, [report, result, view, unitLabel, multiplier]);

  return (
    <div className="prediction-workspace" aria-busy={loading}>
      <div className="analysis-toolbar">
        <div className="segmented" aria-label="Vista del análisis">
          {(
            [
              ["scenario", "Escenario 24 h"],
              ["backtest", "Medido vs. predicho"],
              ["models", "Evaluación"],
            ] as const
          ).map(([key, label]) => (
            <button
              type="button"
              key={key}
              onClick={() => setView(key)}
              aria-pressed={view === key}
            >
              {label}
            </button>
          ))}
        </div>
        <button
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
                fuente: "escenario_historico",
              })),
              `escenario-solar-${result.date}.csv`,
            )
          }
        >
          <Download size={16} /> Exportar escenario
        </button>
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
        </div>
      )}
      {result && report && (
        <>
          <div className="prediction-kpis">
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
              label="Error absoluto en prueba"
              value={number(report.test.mae_wh, 2)}
              unit="Wh / 5 min"
              detail="MAE con meteorología observada"
            />
            <Metric
              label="Frente al baseline"
              value={
                report.skill_vs_baseline_pct === null
                  ? "—"
                  : `${number(report.skill_vs_baseline_pct)}%`
              }
              unit=""
              detail="Reducción del RMSE en prueba"
            />
          </div>
          {view !== "models" ? (
            <section className="panel prediction-chart-panel">
              <div className="panel-heading">
                <div>
                  <span className="provenance-tag">
                    <BrainCircuit size={13} />
                    {view === "scenario"
                      ? "Escenario histórico"
                      : "Prueba temporal reservada"}
                  </span>
                  <h2>
                    {view === "scenario"
                      ? "Un día de generación solar"
                      : "La predicción frente a la medición"}
                  </h2>
                  <p className="chart-description">
                    {view === "scenario"
                      ? `${dateLabel(result.forecast[0].timestamp)} · perfil meteorológico histórico, sin clima en vivo`
                      : `${report.backtest[0] ? dateLabel(report.backtest[0].timestamp) : "Sin registros"} · último día del conjunto de prueba`}
                  </p>
                </div>
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
              <SolarChart
                option={option}
                label={
                  view === "scenario"
                    ? "Energía estimada, baseline y banda de error por intervalo"
                    : "Comparación temporal entre energía medida y predicha en datos de prueba"
                }
                className="forecast-plot"
              />
              <div className="chart-footnote">
                <ShieldCheck size={16} />
                <span>
                  {view === "scenario"
                    ? `Banda nominal 90%; cobertura observada en prueba: ${number(report.uncertainty.test_coverage * 100)}%. No es un intervalo de energía diaria.`
                    : "Estas mediciones no se utilizaron para entrenar, seleccionar ni calibrar el modelo."}
                </span>
              </div>
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
                      value={date}
                      onChange={(event) => setDate(event.target.value)}
                    />
                  </label>
                  <button className="outline-button" disabled={loading}>
                    <RefreshCw size={14} /> Recalcular
                  </button>
                  <span>
                    Cambiar la fecha modifica el calendario; el clima conserva
                    el perfil histórico.
                  </span>
                </form>
              )}
            </section>
          ) : (
            <>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <span className="provenance-tag">
                      <ShieldCheck size={13} />
                      Validación cronológica
                    </span>
                    <h2>El modelo se elige antes de ver la prueba</h2>
                    <p className="chart-description">
                      Candidatos comparados por RMSE de validación. El conjunto
                      final evalúa únicamente al ganador.
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
                <h2>Resultados del conjunto de prueba</h2>
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
          <div className="analysis-bottom">
            <section className="panel methodology-panel">
              <div className="panel-heading">
                <div>
                  <p className="panel-kicker">Trazabilidad del modelo</p>
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
                Clima de referencia: {dateLabel(result.source_start)} —{" "}
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
          <details className="panel data-table">
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
                      <td>{number(point.irradiacion)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <PointScenario date={result.date} />
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
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState("");
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
          setBusy(true);
          setAnswer("");
          try {
            const response = await predictProduction({
              timestamp: `${values.get("timestamp")}:00-05:00`,
              irradiacion: Number(values.get("irradiance")),
              temperatura_ambiente: Number(values.get("temperature")),
            });
            setAnswer(
              `${number(response.prediction_wh, 2)} Wh / 5 min · ${number(response.mean_power_kw, 2)} kW medios. ${response.temperature_source}. ${response.warnings.join(" ")}`,
            );
          } catch (reason) {
            setAnswer(
              reason instanceof Error ? reason.message : "No se pudo calcular",
            );
          } finally {
            setBusy(false);
          }
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
