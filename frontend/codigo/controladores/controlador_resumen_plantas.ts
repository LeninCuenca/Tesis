import { useEffect, useState } from "react";
import type { Period } from "../modelos/energia";
import type { GraficaPlanta } from "../modelos/resumen_plantas";
import { consultarResumenPlantas } from "../servicios/servicio_resumen_plantas";
import { programarActualizacion } from "../utilidades/actualizacion_periodica";

export function useControladorResumenPlantas(periodo: Period, revision: number) {
  const [resultado, setResultado] = useState<{ periodo: Period; graficas: GraficaPlanta[]; fecha: Date } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [intento, setIntento] = useState(0);
  useEffect(() => {
    let vigente = true;
    let activa: AbortController | null = null;
    const cargar = async () => {
      if (activa) return;
      const consulta = new AbortController();
      activa = consulta;
      setCargando(true);
      setError("");
      try {
        const graficas = await consultarResumenPlantas(periodo, consulta.signal);
        if (vigente) setResultado({ periodo, graficas, fecha: new Date() });
      } catch (razon) {
        if (vigente) setError(razon instanceof Error ? razon.message : "No se pudieron consultar las gráficas. Revisa la conexión y vuelve a intentar.");
      } finally {
        activa = null;
        if (vigente) setCargando(false);
      }
    };
    void cargar();
    const detener = programarActualizacion(() => void cargar());
    return () => { vigente = false; detener(); activa?.abort(); };
  }, [periodo, revision, intento]);
  const actual = resultado?.periodo === periodo ? resultado : null;
  return { graficas: actual?.graficas ?? [], ultimaConsulta: actual?.fecha, cargando, error, reintentar: () => setIntento((n) => n + 1) };
}
