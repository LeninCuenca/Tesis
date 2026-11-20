import type { Daily } from "../../modelos/evaluacion";
import { useControladorEvaluacion } from "../../controladores/controlador_evaluacion";
import type { EChartsOption } from "echarts";
import { GraficoSolar } from "./GraficoSolar";
import { chartBase } from "../../configuracion/tema_graficos";
import { downloadCsv } from "../../utilidades/exportar_csv";

const fmt = (n: number | null) => n === null ? "—" : n.toLocaleString("es-EC", { maximumFractionDigits: 2 });

export function EvaluacionRendimiento() {
  const { report, error, reintentar } = useControladorEvaluacion();
  if (error) return <section className="panel"><h2>Evaluación energética</h2><p role="alert">{error}</p><button className="text-button" onClick={reintentar}>Reintentar</button></section>;
  if (!report) return <section className="panel" aria-busy="true"><h2>Evaluación energética</h2><p>Consultando resultados del histórico auditado…</p></section>;
  const daily = report.daily_test;
  const option: EChartsOption = {
    ...chartBase,
    xAxis: { type: "category", data: daily.days.map((day) => day.date), axisLabel: { formatter: (value: string) => value.slice(5) } },
    yAxis: { type: "value", name: "kWh/día" },
    series: [
      { name: "Medida", type: "line", smooth: false, showSymbol: false, connectNulls: false, data: daily.days.map((day) => day.complete ? day.actual_kwh : null) },
      { name: "Estimada con clima observado", type: "line", smooth: false, showSymbol: false, connectNulls: false, data: daily.days.map((day) => day.complete ? day.predicted_kwh : null) },
    ],
  };
  const labels: Record<string, string> = { specific_yield: "Rendimiento específico", performance_ratio: "Performance Ratio", solar_to_ac_efficiency: "Eficiencia solar a AC" };
  return <section className="panel">
    <div className="panel-heading"><div><p className="panel-kicker">Histórico auditado · {report.central}</p><h2>Evaluación energética y física</h2></div><button className="text-button" onClick={() => downloadCsv(daily.days, "evaluacion-diaria-prueba.csv")}>Exportar evaluación</button></div>
    <p>{report.test_period.start.slice(0, 10)} a {report.test_period.end.slice(0, 10)} · {daily.complete_days} días completos · {daily.excluded_days} días excluidos. Este análisis tiene su propio periodo de prueba y no cambia con el filtro del histórico.</p>
    <GraficoSolar option={option} label="Energía diaria medida y estimada en el conjunto de prueba, en kilovatios hora por día" />
    <div className="table-scroll"><table><thead><tr><th>Estimador</th><th>MAE [kWh/día]</th><th>RMSE [kWh/día]</th><th>Sesgo [kWh/día]</th></tr></thead><tbody>
      {[["Modelo final", daily], ["Media histórica por franja", report.daily_baseline], ["Día anterior", report.daily_persistence]].map(([name, metrics]) => {
        const m = metrics as Daily;
        return <tr key={String(name)}><td>{String(name)}</td><td>{fmt(m.mae_kwh)}</td><td>{fmt(m.rmse_kwh)}</td><td>{fmt(m.bias_kwh)}</td></tr>;
      })}
    </tbody></table></div>
    <p className="muted-copy">La comparación usa meteorología observada. La suma diaria mantiene la interpretación previa de energía por intervalo, pendiente de confirmación instrumental.</p>
    <div className="table-scroll"><table><thead><tr><th>Indicador físico</th><th>Resultado</th><th>Datos necesarios</th></tr></thead><tbody>
      {Object.entries(report.physical).map(([key, metric]) => <tr key={key}><td>{labels[key] || key}</td><td>{metric.value === null ? "Pendiente de verificación" : `${fmt(metric.value)} ${metric.unit}`}</td><td>{metric.requirements.join(". ") || "Parámetros verificados"}</td></tr>)}
    </tbody></table></div>
    <p className="muted-copy">Repositorio auditado: {report.storage.rows.toLocaleString("es-EC")} posiciones temporales y {report.storage.channels} canales, con valores ausentes conservados. Este repositorio local es distinto de la carga histórica de Supabase.</p>
  </section>;
}
