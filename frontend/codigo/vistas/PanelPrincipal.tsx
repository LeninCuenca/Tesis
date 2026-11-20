import { ChatSolaris } from "./componentes/ChatSolaris";
import logoSolaris from "../recursos/logo-solaris.png";
import { ResumenPlantas } from "./componentes/ResumenPlantas";
import { CENTRALES, CENTRAL_PRINCIPAL } from "../modelos/centrales";
import {
  lazy,
  Suspense,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  Database,
  Download,
  Gauge,
  LayoutDashboard,
  Menu,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  SunMedium,
  ThermometerSun,
  X,
  Zap,
} from "lucide-react";
import type { EChartsOption } from "echarts";
import "../estilos/panel_principal.css";
import { useControladorPanel } from "../controladores/controlador_panel";
import {
  type DataState,
  type DashboardData,
  type Period,
} from "../modelos/energia";
import { GraficoSolar } from "./componentes/GraficoSolar";
import { ExploradorVariables } from "./componentes/ExploradorVariables";
import { LimiteAnalisis } from "./componentes/LimiteAnalisis";
import { chartBase } from "../configuracion/tema_graficos";
const PanelPrediccion = lazy(() =>
  import("./componentes/PanelPrediccion").then((module) => ({
    default: module.PanelPrediccion,
  })),
);
const EvaluacionRendimiento = lazy(() =>
  import("./componentes/EvaluacionRendimiento").then((module) => ({
    default: module.EvaluacionRendimiento,
  })),
);

type View =
  | "Resumen"
  | "Rendimiento"
  | "Variables"
  | "Predicción IA"
  | "Calidad de datos"
  | "Configuración";
const navigation = [
  { label: "Resumen", icon: LayoutDashboard },
  { label: "Rendimiento", icon: Gauge },
  { label: "Variables", icon: Activity },
  { label: "Predicción IA", icon: Sparkles },
  { label: "Calidad de datos", icon: ShieldCheck },
] as const;
const periodLabels: Record<Period, string> = {
  day: "Último día disponible",
  week: "Últimos 7 días disponibles",
  month: "Últimos 30 días disponibles",
};
const headings: Record<View, [string, string]> = {
  Resumen: [
    "Las plantas solares, de un vistazo",
    "Generación y consumo por planta. Las cinco demostraciones usan periodos distintos del histórico del Edificio Central.",
  ],
  Rendimiento: [
    "Cada día de generación cuenta",
    "Energía diaria medida y relación entre producción y consumo del edificio.",
  ],
  Variables: [
    "Explora las variables de tu central",
    "Selecciona tus señales, compara su evolución y consulta cada medición.",
  ],
  "Predicción IA": [
    "Anticipar, comparar, comprender",
    "Escenarios solares y evaluación temporal del modelo con resultados verificables.",
  ],
  "Calidad de datos": [
    "La confianza empieza en la medición",
    "Cobertura calculada sobre todos los intervalos esperados del periodo.",
  ],
  Configuración: [
    "Conexiones y criterios de cálculo",
    "Estado de las fuentes y datos necesarios para ampliar el análisis fotovoltaico.",
  ],
};
const format = (value: number | null, digits = 1) =>
  value === null
    ? "—"
    : value.toLocaleString("es-EC", {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      });
const kwh = (value: number | null) => (value === null ? null : value / 1000);

export default function PanelPrincipal() {
  const [view, setView] = useState<View>("Resumen");
  const [mobile, setMobile] = useState(false);
  const [revisionResumen, setRevisionResumen] = useState(0);
  const { central, centralId, setCentralId, period, setPeriod, data, state, message, exporting, load, exportData, exportSummary, refreshing, lastUpdated } = useControladorPanel();
  const hasData = data.records > 0;
  const go = (next: View) => {
    setView(next);
    setMobile(false);
  };
  const status =
    state === "ready"
      ? hasData
        ? central.demostracion ? "Demostración histórica" : "Histórico conectado"
        : "Sin registros"
      : state === "loading"
        ? "Consultando"
        : "Revisar conexión";
  const balance = useMemo<EChartsOption>(
    () => ({
      ...chartBase,
      xAxis: {
        ...chartBase.xAxis,
        data: data.points.map((point) => point.time),
      },
      series: [
        {
          type: "bar",
          name: "Generación solar",
          data: data.points.map((point) => kwh(point.generation)),
          barMaxWidth: 24,
          itemStyle: { borderRadius: [3, 3, 0, 0] },
        },
        {
          type: "bar",
          name: "Consumo del edificio",
          data: data.points.map((point) => kwh(point.consumption)),
          barMaxWidth: 24,
          itemStyle: { borderRadius: [3, 3, 0, 0] },
        },
      ],
    }),
    [data.points],
  );


  return (
    <div className="app-shell">
      {mobile && (
        <button
          className="nav-backdrop"
          aria-label="Cerrar navegación"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? "sidebar-open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            go("Resumen");
          }}
        >
          <div className="brand-logo-contenido">
            <span className="brand-logo-fondo"><span className="brand-logo-simbolo"><img src={logoSolaris} alt="" className="brand-logo-imagen" /></span><span className="brand-logo-nombre">SOLARIS</span></span>
            <small>Observatorio de energía solar · UTPL</small>
          </div>
        </a>
        <div className="site-switcher">
          <span>Central seleccionada</span>
          <strong>
            <span className="station-dot" />
            {central.nombre}
          </strong>
          <small>{central.demostracion ? "Demostración · nombre provisional" : central.ubicacion}</small>
        </div>
        <nav aria-label="Navegación principal" className="nav-list">
          {navigation.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={`nav-item ${view === label ? "active" : ""}`}
              aria-current={view === label ? "page" : undefined}
              onClick={() => go(label)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {label === "Predicción IA" && (
                <span className="nav-tag">Modelos</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-context">
          <SunMedium size={36} strokeWidth={1} />
          <strong>Datos para una mejor energía</strong>
          <p>Plataforma de análisis fotovoltaico e investigación.</p>
          <span>Proyecto de tesis · UTPL</span>
        </div>
        <div className="sidebar-footer">
          <button
            className={`nav-item ${view === "Configuración" ? "active" : ""}`}
            onClick={() => go("Configuración")}
          >
            <Settings2 size={18} />
            Configuración
          </button>
          <div className="profile">
            <span className="avatar">LC</span>
            <div>
              <strong>Lenin Cuenca</strong>
              <small>Investigación energética</small>
            </div>
          </div>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu"
              aria-label={mobile ? "Cerrar menú" : "Abrir menú"}
              aria-expanded={mobile}
              onClick={() => setMobile(!mobile)}
            >
              {mobile ? <X size={22} /> : <Menu size={22} />}
            </button>
            <span>{view === "Resumen" ? "Plantas solares UTPL" : central.nombre}</span>
            <ChevronRight size={14} />
            <strong>{view}</strong>
          </div>
          <div
            className={`connection ${state === "ready" && hasData ? "connected" : ""}`}
          >
            <i />
            {view === "Resumen" ? `${CENTRALES.length} plantas solares` : status}
          </div>
        </header>
        <div className={`page-content ${view === "Predicción IA" ? "vista-prediccion" : `vistas-compactas ${view === "Resumen" ? "vista-resumen" : "vista-con-central"} ${view === "Variables" ? "vista-variables" : ""} ${view === "Configuración" ? "vista-configuracion" : ""}`}`}>
          {view !== "Resumen" && <section className="selector-centrales" aria-label="Elegir central solar">
            <label htmlFor="central-solar"><SunMedium size={20} /><span>Central solar<small>1 histórico disponible · 5 demostraciones</small></span></label>
            <select id="central-solar" value={centralId} onChange={(event) => setCentralId(event.target.value)}>
              {CENTRALES.map((item) => <option key={item.id} value={item.id}>{item.nombre} — {item.demostracion ? "Demostración" : "Histórico medido"}</option>)}
            </select>
          </section>}
          {view !== "Resumen" && central.demostracion && <aside className="aviso-central-demo" role="note">
            <strong>Demostración · {central.nombre}</strong>
            <p>Nombre provisional. Se muestran mediciones del Edificio Central UTPL de un periodo {central.desfaseDias} días anterior al último disponible. Esta central aún no tiene mediciones propias registradas.</p>
          </aside>}
          <section className="page-heading">
            <div>
              <span className="page-location">
                <SunMedium size={14} />
                {view === "Resumen" ? `${CENTRALES.length} plantas solares` : `${central.nombre} · ${central.demostracion ? "Demostración" : "Loja"}`}
              </span>
              <h1>{headings[view][0]}</h1>
              <p>{headings[view][1]}</p>
            </div>
            {view !== "Predicción IA" && (
              <button
                className="icon-button"
                onClick={() => view === "Resumen" ? setRevisionResumen((n) => n + 1) : void load()}
                disabled={view !== "Resumen" && refreshing}
                aria-label="Actualizar mediciones"
              >
                <RefreshCw
                  size={19}
                  className={view !== "Resumen" && refreshing ? "spin" : ""}
                />
              </button>
            )}
          </section>
          {view !== "Predicción IA" && (
            <div className="period-toolbar">
              <label>
                <CalendarDays size={16} />
                <select
                  aria-label="Periodo de consulta"
                  value={period}
                  onChange={(event) => setPeriod(event.target.value as Period)}
                >
                  {Object.entries(periodLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <span>
                {view === "Resumen" ? "Cada gráfica indica su periodo de consulta" : data.startDate && data.endDate
                  ? `${data.startDate} — ${data.endDate}`
                  : "Periodo basado en el último dato disponible"}
              </span>
              {view !== "Resumen" && (              <button
                className="outline-button"
                disabled={!hasData || exporting}
                onClick={() => void exportData()}
              >
                <Download size={15} />
                {exporting ? "Exportando…" : "Exportar mediciones"}
              </button>)}
            </div>
          )}
          {view !== "Predicción IA" && view !== "Resumen" && (
            <p className="refresh-status" role="status" aria-live="polite">
              <span>{refreshing ? "Consultando datos…" : "Actualización automática cada 5 minutos"}</span>
              <span>
                Última consulta correcta: {lastUpdated
                  ? lastUpdated.toLocaleTimeString("es-EC", { timeZone: "America/Guayaquil", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
                  : "pendiente"}
              </span>
              <span>
                Última medición: {data.latest.timestamp
                  ? new Date(data.latest.timestamp).toLocaleString("es-EC", { timeZone: "America/Guayaquil", hour12: false })
                  : "sin fecha disponible"}
              </span>
            </p>
          )}
          {view !== "Predicción IA" && view !== "Resumen" && state !== "ready" && (
            <div className={`data-banner ${state}`} role="status">
              <Database size={20} />
              <div>
                <strong>
                  {state === "loading"
                    ? "Consultando el histórico de la central"
                    : "La fuente de mediciones requiere atención"}
                </strong>
                <p>
                  {state === "loading"
                    ? "Los indicadores se mostrarán al completar la consulta."
                    : message}
                </p>
              </div>
              {state !== "loading" && (
                <button className="outline-button" onClick={() => void load()}>
                  Reintentar
                </button>
              )}
            </div>
          )}
          {message && state === "ready" && view !== "Predicción IA" && view !== "Resumen" && (
            <p className="notice" role="status">
              {message}
            </p>
          )}
          {view === "Predicción IA" && central.demostracion ? (
            <section className="panel modelo-no-disponible">
              <Sparkles size={28} /><h2>Modelo propio pendiente</h2>
              <p>Las centrales de demostración permiten explorar históricos de referencia. El modelo predictivo existente y sus métricas solo corresponden al Edificio Central UTPL.</p>
              <button className="primary-button" onClick={() => setCentralId(CENTRAL_PRINCIPAL.id)}>Ver el modelo del Edificio Central</button>
            </section>
          ) : view === "Predicción IA" ? (
            <LimiteAnalisis>
              <Suspense
                fallback={
                  <div className="panel loading-panel">
                    Cargando análisis predictivo…
                  </div>
                }
              >
                <PanelPrediccion />
              </Suspense>
            </LimiteAnalisis>
          ) : (
            <>
              {view === "Resumen" && <ResumenPlantas periodo={period} revision={revisionResumen} />}
              {view === "Rendimiento" && (
                <>
                  <section className="kpi-grid">
                    <Kpi
                      label="Generación solar"
                      value={format(kwh(data.totals.generationWh), 2)}
                      unit="kWh"
                      detail="Energía registrada en el periodo"
                      icon={<SunMedium />}
                      tone="solar"
                    />
                    <Kpi
                      label="Consumo del edificio"
                      value={format(kwh(data.totals.consumptionWh), 2)}
                      unit="kWh"
                      detail="Energía registrada en el periodo"
                      icon={<Zap />}
                      tone="blue"
                    />
                    <Kpi
                      label="Generación / consumo"
                      value={format(data.totals.coverage)}
                      unit="%"
                      detail="Solo intervalos con ambas lecturas; no es autoconsumo"
                      icon={<Gauge />}
                      tone="green"
                    />
                    <Kpi
                      label="Cobertura de datos"
                      value={hasData ? format(data.totals.dataCoverage) : "—"}
                      unit="%"
                      detail={`${data.records.toLocaleString("es-EC")} de ${data.expectedRecords.toLocaleString("es-EC")} intervalos`}
                      icon={<ShieldCheck />}
                      tone="violet"
                    />
                  </section>
                  <section className="overview-grid">
                    <article className="panel balance-panel">
                      <div className="panel-heading">
                        <div>
                          <p className="panel-kicker">Balance energético</p>
                          <h2>Generación y demanda diaria</h2>
                        </div>
                        <button
                          className="icon-button"
                          aria-label="Exportar resumen diario"
                          disabled={!hasData}
                          onClick={exportSummary}
                        >
                          <Download size={17} />
                        </button>
                      </div>
                      {hasData ? (
                        <GraficoSolar
                          option={balance}
                          label="Energía diaria de generación solar y consumo en kilovatios hora"
                        />
                      ) : (
                        <Empty state={state} />
                      )}
                      <div className="chart-footnote">
                        <span className="key-dot" />
                        Energía en kWh. Los días sin mediciones conservan sus
                        huecos.
                      </div>
                    </article>
                    <article className="panel station-panel">
                      <p className="panel-kicker">Integridad del periodo</p>
                      <h2>¿Cuánto del histórico vemos?</h2>
                      <div
                        className="coverage-ring"
                        style={
                          {
                            "--coverage": `${data.totals.dataCoverage}%`,
                          } as React.CSSProperties
                        }
                      >
                        <div>
                          <strong>
                            {hasData
                              ? format(data.totals.dataCoverage, 0)
                              : "—"}
                            <small>{hasData ? "%" : ""}</small>
                          </strong>
                          <span>intervalos registrados</span>
                        </div>
                      </div>
                      <div className="station-stat">
                        <span>Grilla de referencia</span>
                        <strong>5 minutos</strong>
                      </div>
                      <div className="station-stat">
                        <span>Intervalos ausentes</span>
                        <strong>
                          {state === "ready"
                            ? Math.max(
                                0,
                                data.expectedRecords - data.records,
                              ).toLocaleString("es-EC")
                            : "—"}
                        </strong>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => go("Calidad de datos")}
                      >
                        Explorar calidad <ArrowUpRight size={15} />
                      </button>
                    </article>
                  </section>
                  <section className="environment-strip">
                    <div>
                      <ThermometerSun size={23} />
                      <span>
                        Temperatura ambiente
                        <strong>
                          {format(data.latest.temperature)} <small>°C</small>
                        </strong>
                      </span>
                    </div>
                    <div>
                      <SunMedium size={23} />
                      <span>
                        Irradiancia solar
                        <strong>
                          {format(data.latest.irradiance)} <small>W/m²</small>
                        </strong>
                      </span>
                    </div>
                    <p>
                      <strong>{data.latest.source}</strong>
                      <span>
                        {data.latest.timestamp
                          ? new Date(data.latest.timestamp).toLocaleString(
                              "es-EC",
                              { timeZone: "America/Guayaquil" },
                            )
                          : "Sin marca temporal de medición"}
                      </span>
                      <small>
                        Lecturas históricas; no indican el estado en vivo.
                      </small>
                    </p>
                  </section>
                  {data.warnings.length > 0 && (
                    <div className="notice">
                      <ShieldCheck size={17} />
                      <span>{data.warnings.join(" ")}</span>
                    </div>
                  )}
                  {view === "Rendimiento" && <>
                    <Suspense fallback={<section className="panel">Cargando evaluación energética…</section>}>
                      {central.demostracion ? <section className="panel"><h2>Evaluación propia pendiente</h2><p>Esta vista usa un histórico de referencia. Las métricas del modelo y los parámetros físicos del Edificio Central no se atribuyen a esta central de demostración.</p></section> : <EvaluacionRendimiento />}
                    </Suspense>
                    <DailyTable data={data} />
                  </>}
                  <section className="prediction-invitation">
                    <div className="invitation-icon">
                      <Sparkles size={25} />
                    </div>
                    <div>
                      <span>Análisis predictivo</span>
                      <h2>Compara lo esperado con lo medido</h2>
                      <p>
                        Escenarios de cinco minutos, modelos comparados y
                        evaluación temporal.
                      </p>
                    </div>
                    <button
                      className="primary-button"
                      onClick={() => go("Predicción IA")}
                    >
                      Abrir análisis <ArrowUpRight size={16} />
                    </button>
                  </section>
                </>
              )}
              {view === "Variables" && <ExploradorVariables key={central.id} central={central} periodo={period} actualizacion={lastUpdated?.getTime()} />}
              {view === "Calidad de datos" && (
                <>
                  <section className="quality-grid">
                    <Kpi
                      label="Intervalos registrados"
                      value={
                        state === "ready"
                          ? data.records.toLocaleString("es-EC")
                          : "—"
                      }
                      unit=""
                      detail="Suma de registros_validos diarios"
                      icon={<Database />}
                      tone="blue"
                    />
                    <Kpi
                      label="Intervalos esperados"
                      value={
                        state === "ready"
                          ? data.expectedRecords.toLocaleString("es-EC")
                          : "—"
                      }
                      unit=""
                      detail="Días seleccionados × 288"
                      icon={<CalendarDays />}
                      tone="violet"
                    />
                    <Kpi
                      label="Cobertura temporal"
                      value={hasData ? format(data.totals.dataCoverage) : "—"}
                      unit="%"
                      detail="Incluye días completamente ausentes"
                      icon={<ShieldCheck />}
                      tone="green"
                    />
                  </section>
                  <section className="panel">
                    <h2>Criterios de interpretación</h2>
                    <ul className="method-list">
                      <li>
                        Un valor cero puede ser una medición válida. Un valor
                        ausente se representa con un guion.
                      </li>
                      <li>
                        Los acumulados parciales no se extrapolan para rellenar
                        intervalos faltantes.
                      </li>
                      <li>
                        Esta cobertura mide disponibilidad de producción; no
                        certifica exactitud del sensor ni disponibilidad de la
                        planta.
                      </li>
                      <li>
                        Los registros legados requieren auditar zona horaria e
                        interpolaciones contra los archivos originales.
                      </li>
                      {data.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </section>
                  <DailyTable data={data} />
                </>
              )}
              {view === "Configuración" && (
                <section className="panel config-panel">
                  <h2>Fuentes y parámetros</h2>
                  <div className="config-row">
                    <Database size={22} />
                    <div>
                      <strong>Mediciones y resúmenes</strong>
                      <span>Supabase · central de origen {central.fuenteId}{central.demostracion ? ` · demostración con ${central.desfaseDias} días de desfase` : ""}</span>
                    </div>
                    <span className="provenance-tag">{status}</span>
                  </div>
                  <div className="config-row">
                    <Sparkles size={22} />
                    <div>
                      <strong>Motor predictivo</strong>
                      <span>
                        API configurable mediante VITE_PREDICTION_API_URL; proxy
                        /api en desarrollo.
                      </span>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => go("Predicción IA")}
                    >
                      Consultar <ArrowUpRight size={15} />
                    </button>
                  </div>
                  <div className="engineering-note">
                    <Gauge size={22} />
                    <div>
                      <strong>
                        PR y rendimiento específico pendientes de datos técnicos
                      </strong>
                      <p>
                        Se requieren potencia nominal STC e irradiación en el
                        plano del generador para calcular estos indicadores. No
                        se sustituyen por la relación generación / consumo.
                      </p>
                    </div>
                  </div>
                  <p className="muted-copy">
                    Interfaz React + Vite. Análisis en hora de Ecuador
                    (America/Guayaquil). Las mediciones UTC legadas deben
                    auditarse antes de migrar su zona horaria.
                  </p>
                </section>
              )}
            </>
          )}
          <footer className="data-footer">
            <span>
              <SunMedium size={14} />
              Solaris / UTPL
            </span>
            <span>
              {view === "Resumen" ? "1 histórico medido · 5 demostraciones históricas" : central.demostracion ? "Demostración · fuente: Edificio Central UTPL" : view === "Predicción IA"
                ? "Modelos locales · evaluación reproducible"
                : "Fuente: Supabase · datos históricos"}
            </span>
            <span>Ingeniería con datos</span>
          </footer>
        </div>
      </main>
      <ChatSolaris central={central} periodo={period} />
    </div>
  );
}

function Kpi({
  label,
  value,
  unit,
  detail,
  icon,
  tone,
}: {
  label: string;
  value: string;
  unit: string;
  detail: string;
  icon: ReactNode;
  tone: string;
}) {
  return (
    <article className="kpi-card">
      <div className="kpi-top">
        <span>{label}</span>
        <span className={`kpi-icon ${tone}`}>{icon}</span>
      </div>
      <strong>
        {value}
        <small>{unit}</small>
      </strong>
      <p>{detail}</p>
    </article>
  );
}
function Empty({ state }: { state: DataState }) {
  return (
    <div className="empty-chart">
      <Database size={28} />
      <strong>
        {state === "loading"
          ? "Consultando mediciones…"
          : "Sin mediciones para mostrar"}
      </strong>
      <span>Los gráficos se completan con los datos reales de la central.</span>
    </div>
  );
}
function DailyTable({ data }: { data: DashboardData }) {
  return (
    <section className="panel">
      <h2>Detalle diario del registro</h2>
      <div className="table-scroll">
        <table>
          <caption>
            Acumulados disponibles; un guion representa ausencia de datos
          </caption>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Generación (kWh)</th>
              <th>Consumo (kWh)</th>
              <th>Intervalos / 288</th>
              <th>Cobertura</th>
            </tr>
          </thead>
          <tbody>
            {data.points.map((point) => (
              <tr key={point.date}>
                <th scope="row">{point.date}</th>
                <td>{format(kwh(point.generation), 2)}</td>
                <td>{format(kwh(point.consumption), 2)}</td>
                <td>{point.records}</td>
                <td>{format(Math.min(100, (point.records / 288) * 100))}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
