import { CENTRALES, CENTRAL_PRINCIPAL, procedenciaCentral } from "../modelos/centrales";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchDashboardData, fetchMeasurementExport } from "../servicios/servicio_energia";
import { emptyDashboard, type DashboardData, type DataState, type Period } from "../modelos/energia";
import { programarActualizacion } from "../utilidades/actualizacion_periodica";
import { downloadCsv } from "../utilidades/exportar_csv";

// Coordina consultas, estado de carga, errores y exportaciones del panel.
export function useControladorPanel() {
  const [centralId, setCentralId] = useState(CENTRAL_PRINCIPAL.id);
  const central = CENTRALES.find((item) => item.id === centralId) ?? CENTRAL_PRINCIPAL;
  const [period, setPeriod] = useState<Period>("week");
  const [data, setData] = useState<DashboardData>(emptyDashboard);
  const [state, setState] = useState<DataState>("loading");
  const [message, setMessage] = useState("");
  const [exporting, setExporting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const sequence = useRef(0);
  const inFlight = useRef<number | null>(null);
  const loadedPeriod = useRef<string | null>(null);
  const [loadedContext, setLoadedContext] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (inFlight.current !== null) return;
    const request = ++sequence.current;
    inFlight.current = request;
    const preserveData = loadedPeriod.current === `${central.id}:${period}`;
    setRefreshing(true);
    if (!preserveData) {
      setState("loading");
      setData(emptyDashboard());
      setLastUpdated(null);
    }
    setMessage("");
    try {
      const next = await fetchDashboardData(period, central);
      if (request === sequence.current) {
        loadedPeriod.current = `${central.id}:${period}`;
        setLoadedContext(`${central.id}:${period}`);
        setData(next);
        setState("ready");
        setLastUpdated(new Date());
      }
    } catch (reason) {
      if (request === sequence.current) {
        const missing =
          reason instanceof Error && reason.message === "SUPABASE_NOT_CONFIGURED";
        setState(preserveData ? "ready" : missing ? "not-configured" : "error");
        setMessage(
          preserveData
            ? "No se pudo actualizar. Se conservan los últimos datos consultados; se reintentará automáticamente en 5 minutos."
            : missing
              ? "Configura las variables públicas de Supabase en frontend/.env.local para consultar las mediciones."
              : "No se pudieron consultar las mediciones. Se reintentará en 5 minutos; también puedes actualizar manualmente.",
        );
      }
    } finally {
      if (request === sequence.current) {
        inFlight.current = null;
        setRefreshing(false);
      }
    }
  }, [period, central]);
  const invalidate = useCallback(() => {
    sequence.current++;
    inFlight.current = null;
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Consulta externa al cambiar el periodo.
    void load();
    const detener = programarActualizacion(() => void load());
    return () => {
      detener();
      invalidate();
    };
  }, [load, invalidate]);
  const exportData = async () => {
    setExporting(true);
    setMessage("");
    try {
      const rows = await fetchMeasurementExport(period, central);
      if (!rows.length)
        setMessage("No hay mediciones para exportar en este periodo.");
      else {
        downloadCsv(rows.map((row) => ({ ...row, ...procedenciaCentral(central) })), `mediciones-${central.id}-${data.startDate}-${data.endDate}.csv`);
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
  const exportSummary = () =>
    downloadCsv(
      data.points.map((point) => ({
        ...procedenciaCentral(central),
        fecha: point.date,
        generacion_wh: point.generation,
        consumo_wh: point.consumption,
        relacion_generacion_consumo_pct: point.solarCoverage,
        registros_validos: point.records,
      })),
      `resumen-${central.id}-${data.startDate}-${data.endDate}.csv`,
    );
  const contextoVigente = loadedContext === `${central.id}:${period}`;
  return { central, centralId, setCentralId, period, setPeriod,
    data: contextoVigente ? data : emptyDashboard(),
    state: !contextoVigente && state === "ready" ? "loading" as const : state,
    message, exporting, load, exportData, exportSummary, refreshing,
    lastUpdated: contextoVigente ? lastUpdated : null };

}
