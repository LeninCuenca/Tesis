import { useEffect, useState } from "react";
import type { Evaluation } from "../modelos/evaluacion";
import { consultarEvaluacion } from "../servicios/servicio_prediccion";

export function useControladorEvaluacion() {
  const [report, setReport] = useState<Evaluation | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    consultarEvaluacion(controller.signal)
      .then(setReport)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "No se pudo cargar la evaluación");
      });
    return () => controller.abort();
  }, [attempt]);
  const reintentar = () => { setError(""); setAttempt(attempt + 1); };
  return { report, error, reintentar };
}
