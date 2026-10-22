import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
import "./App.css";
import {
  fetchDashboardData,
  fetchMeasurementExport,
} from "./services/energyService";
import {
  emptyDashboard,
  type DataState,
  type DashboardData,
  type Period,
} from "./types/energy";
import { downloadCsv } from "./utils/exportCsv";
import { SolarChart } from "./components/SolarChart";
import { AnalysisBoundary } from "./components/AnalysisBoundary";
import { chartBase } from "./lib/chartTheme";
const PredictionPanel = lazy(() =>
  import("./components/PredictionPanel").then((module) => ({
    default: module.PredictionPanel,
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
    "La energía de tu central, en contexto",
    "Generación, demanda y calidad del registro para el Edificio Central de la UTPL.",
  ],
  Rendimiento: [
    "Cada día de generación cuenta",
    "Energía diaria medida y relación entre producción y consumo del edificio.",
  ],
  Variables: [
    "Del sensor a la interpretación",
    "Magnitudes eléctricas y ambientales identificadas por unidad y lado del sistema.",
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

export default function App() {
  const [period, setPeriod] = useState<Period>("week");
  const [view, setView] = useState<View>("Resumen");
  const [mobile, setMobile] = useState(false);
  const [data, setData] = useState<DashboardData>(emptyDashboard);
  const [state, setState] = useState<DataState>("loading");
  const [message, setMessage] = useState("");
  const [exporting, setExporting] = useState(false);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    setState("loading");
    setData(emptyDashboard());
    setMessage("");
    try {
      const next = await fetchDashboardData(period);
      if (request === sequence.current) {
        setData(next);
        setState("ready");
      }
    } catch (reason) {
      if (request === sequence.current) {
        const missing =
          reason instanceof Error &&
          reason.message === "SUPABASE_NOT_CONFIGURED";
        setState(missing ? "not-configured" : "error");
        setMessage(
          missing
            ? "Configura las variables públicas de Supabase en frontend/.env.local para consultar las mediciones."
            : "No se pudieron consultar las mediciones. Revisa la conexión y los permisos de lectura de Supabase.",
        );
      }
    }
  }, [period]);
  const invalidate = useCallback(() => {
    sequence.current++;
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Sincroniza Supabase y su estado de carga al cambiar el periodo.
    void load();
    return invalidate;
  }, [load, invalidate]);
  const hasData = data.records > 0;
  const go = (next: View) => {
    setView(next);
    setMobile(false);
  };
  const status =
    state === "ready"
      ? hasData
        ? "Histórico conectado"
        : "Sin registros"
      : state === "loading"
        ? "Consultando"
        : "Revisar conexión";
  const exportData = async () => {
    setExporting(true);
    setMessage("");
    try {
      const rows = await fetchMeasurementExport(period);
      if (!rows.length)
        setMessage("No hay mediciones para exportar en este periodo.");
      else {
        downloadCsv(rows, `mediciones-${data.startDate}-${data.endDate}.csv`);
        setMessage(
          `${rows.length.toLocaleString("es-EC")} mediciones exportadas.`,
        );
      }
    } catch {
      setMessage(
        "No se pudo exportar. Revisa la conexión e inténtalo nuevamente.",
      );
    } finally {
      setExporting(false);
    }
  };
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
  const exportSummary = () =>
    downloadCsv(
      data.points.map((point) => ({
        fecha: point.date,
        generacion_wh: point.generation,
        consumo_wh: point.consumption,
        relacion_generacion_consumo_pct: point.solarCoverage,
        registros_validos: point.records,
      })),
      `resumen-${data.startDate}-${data.endDate}.csv`,
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
          <div className="brand-mark">
            <SunMedium size={25} />
          </div>
          <div>
            <strong>
              Solaris<span>UTPL</span>
            </strong>
            <small>Observatorio de energía solar</small>
          </div>
        </a>
        <div className="site-switcher">
          <span>Central monitoreada</span>
          <strong>
            <span className="station-dot" />
            Edificio Central
          </strong>
          <small>Loja, Ecuador</small>
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
            <span>Central UTPL</span>
            <ChevronRight size={14} />
            <strong>{view}</strong>
          </div>
          <div
            className={`connection ${state === "ready" && hasData ? "connected" : ""}`}
          >
            <i />
            {status}
          </div>
        </header>
        <div className="page-content">
          <section className="page-heading">
            <div>
              <span className="page-location">
                <SunMedium size={14} />
                Edificio Central · Loja
              </span>
              <h1>{headings[view][0]}</h1>
              <p>{headings[view][1]}</p>
            </div>
            {view !== "Predicción IA" && (
              <button
                className="icon-button"
                onClick={() => void load()}
                disabled={state === "loading"}
                aria-label="Actualizar mediciones"
              >
                <RefreshCw
                  size={19}
                  className={state === "loading" ? "spin" : ""}
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
                {data.startDate && data.endDate
                  ? `${data.startDate} — ${data.endDate}`
                  : "Periodo basado en el último dato disponible"}
              </span>
              <button
                className="outline-button"
                disabled={!hasData || exporting}
                onClick={() => void exportData()}
              >
                <Download size={15} />
                {exporting ? "Exportando…" : "Exportar mediciones"}
              </button>
            </div>
          )}
          {view !== "Predicción IA" && state !== "ready" && (
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
          {message && state === "ready" && view !== "Predicción IA" && (
            <p className="notice" role="status">
              {message}
            </p>
          )}
          {view === "Predicción IA" ? (
            <AnalysisBoundary>
              <Suspense
                fallback={
                  <div className="panel loading-panel">
                    Cargando análisis predictivo…
                  </div>
                }
              >
                <PredictionPanel />
              </Suspense>
            </AnalysisBoundary>
          ) : (
            <>
              {(view === "Resumen" || view === "Rendimiento") && (
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
                      detail="No equivale a autoconsumo"
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
                        <SolarChart
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
                  {view === "Rendimiento" && <DailyTable data={data} />}
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
              {view === "Variables" && <Variables data={data} />}
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
                      <span>Supabase · central_id = 1</span>
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
              {view === "Predicción IA"
                ? "Modelos locales · evaluación reproducible"
                : "Fuente: Supabase · datos históricos"}
            </span>
            <span>Ingeniería con datos</span>
          </footer>
        </div>
      </main>
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
function Variables({ data }: { data: DashboardData }) {
  const latest = data.latest;
  const values: [string, number | null, string, string][] = [
    ["Tensión AC · fase L1", latest.voltageAc, "V", "AC / valor medido"],
    ["Corriente AC · fase L1", latest.currentAc, "A", "AC / valor medido"],
    ["Tensión DC · MPP1", latest.voltageDc, "V", "DC / valor medido"],
    ["Corriente DC · MPP1", latest.currentDc, "A", "DC / valor medido"],
    ["Factor de potencia", latest.powerFactor, "", "AC / adimensional"],
    [
      "Temperatura de módulo",
      latest.moduleTemperature,
      "°C",
      "Ambiental / valor medido",
    ],
    ["Irradiancia", latest.irradiance, "W/m²", latest.source],
    ["Temperatura ambiente", latest.temperature, "°C", latest.source],
  ];
  const weather: EChartsOption = {
    ...chartBase,
    color: ["#c88718"],
    legend: { show: false },
    xAxis: { ...chartBase.xAxis, data: data.points.map((point) => point.time) },
    yAxis: { ...chartBase.yAxis, name: "W/m²" },
    series: [
      {
        type: "line",
        showSymbol: true,
        connectNulls: false,
        data: data.points.map((point) => point.irradiance),
        name: "Irradiancia media diaria",
      },
    ],
  };
  return (
    <>
      <p className="notice">
        Última lectura almacenada:{" "}
        {latest.timestamp
          ? new Date(latest.timestamp).toLocaleString("es-EC", {
              timeZone: "America/Guayaquil",
            })
          : "sin medición puntual disponible"}
        . Los promedios diarios se identifican por separado.
      </p>
      <section className="variable-grid">
        {values.map(([label, value, unit, source]) => (
          <article className="panel variable-card" key={label}>
            <span>{label}</span>
            <strong>
              {format(value, 2)} <small>{unit}</small>
            </strong>
            <p>{source}</p>
            {label === "Factor de potencia" &&
              value !== null &&
              Math.abs(value) > 1 && (
                <small className="invalid-reading">
                  Fuera del rango físico: revisar sensor o escala
                </small>
              )}
          </article>
        ))}
      </section>
      <section className="panel">
        <h2>Irradiancia media por día</h2>
        <p className="chart-description">
          W/m² representa irradiancia; la irradiación integrada se expresa en
          Wh/m².
        </p>
        <SolarChart
          option={weather}
          label="Irradiancia media diaria en vatios por metro cuadrado"
        />
      </section>
      <div className="engineering-note">
        <Activity size={23} />
        <p>
          Las magnitudes AC y DC se muestran por separado. La potencia activa AC
          requiere factor de potencia y configuración de fases; no se deduce
          multiplicando estas lecturas aisladas.
        </p>
      </div>
    </>
  );
}
