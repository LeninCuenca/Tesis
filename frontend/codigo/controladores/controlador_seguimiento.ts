import { intervalosHastaHoraEcuador, sincronizarRelojHistorico } from "../utilidades/reloj_historico";
import { useEffect, useState } from "react";
import type { ForecastResult } from "../modelos/prediccion";
import { compararPrediccion, lecturasHastaIntervalo, type ObservacionPrediccion, type ReproduccionHistorica } from "../modelos/seguimiento_prediccion";
import { consultarMedicionesPrediccion } from "../servicios/servicio_seguimiento";
import { consultarReproduccionHistorica } from "../servicios/servicio_prediccion";
import { programarActualizacion } from "../utilidades/actualizacion_periodica";

export function useControladorSeguimiento(inicial: ForecastResult, diaInicial?: string) {
  const [modo, setModo] = useState<"real" | "reproduccion">("reproduccion");
  const [observaciones, setObservaciones] = useState<ObservacionPrediccion[]>([]);
  const [reproduccion, setReproduccion] = useState<ReproduccionHistorica | null>(null);
  const [fechaHistorica, setFechaHistorica] = useState(diaInicial);
  const [cursor, setCursor] = useState(() => intervalosHastaHoraEcuador());
  const [ejecutando, setEjecutando] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [ultimaConsulta, setUltimaConsulta] = useState<Date | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let vigente = true;
    let activa: AbortController | null = null;
    const cargar = async () => {
      if (activa) return;
      activa = new AbortController();
      setCargando(true); setError("");
      try {
        if (modo === "real") {
          const datos = await consultarMedicionesPrediccion(inicial, activa.signal);
          if (vigente) { setObservaciones(datos); setUltimaConsulta(new Date()); }
        } else {
          const datos = await consultarReproduccionHistorica(activa.signal, fechaHistorica);
          if (vigente) { setReproduccion(datos); setCursor(intervalosHastaHoraEcuador()); setEjecutando(true); }
        }
      } catch (razon) {
        if (vigente) setError(razon instanceof Error ? razon.message : "No se pudo consultar el seguimiento.");
      } finally { activa = null; if (vigente) setCargando(false); }
    };
    void cargar();
    const detener = modo === "real" ? programarActualizacion(() => void cargar()) : () => {};
    return () => { vigente = false; detener(); activa?.abort(); };
  }, [modo, inicial, revision, fechaHistorica]);
  const historico = !fechaHistorica || fechaHistorica === reproduccion?.forecast.date ? reproduccion : null;
  const avanzando = modo === "reproduccion" && ejecutando && !!historico;
  useEffect(() => {
    if (!avanzando) return;
    return sincronizarRelojHistorico(() => setCursor(intervalosHastaHoraEcuador()));
  }, [avanzando]);
  const plan = modo === "real" ? inicial : historico?.forecast ?? null;
  const lecturas = modo === "real" ? observaciones : historico ? lecturasHastaIntervalo(historico.forecast, historico.observations, cursor) : [];
  const comparacion = plan ? compararPrediccion(plan, lecturas) : null;
  return { modo, setModo: (nuevo: "real" | "reproduccion") => { setEjecutando(false); setModo(nuevo); }, fechaHistorica, setFechaHistorica, plan, comparacion, cursor, setCursor, avanzando, setEjecutando,
    alternarSincronizacion: () => {
      if (!avanzando) setCursor(intervalosHastaHoraEcuador());
      setEjecutando(!avanzando);
    },
    cargando, error, ultimaConsulta, actualizar: () => setRevision((n) => n + 1),
    reiniciar: () => { setEjecutando(false); setCursor(0); },
    siguiente: () => { setEjecutando(false); setCursor((n) => Math.min(288, n + 1)); } };
}
