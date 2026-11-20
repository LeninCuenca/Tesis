import { useCallback, useEffect, useRef, useState } from "react";
import type { ForecastResult } from "../modelos/prediccion";
import { fetchAutomaticForecast, predictProduction } from "../servicios/servicio_prediccion";

export function useControladorPrediccion() {
  const [result, setResult] = useState<ForecastResult | null>(null);
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
  return { result, date, setDate, loading, error, load };
}

// Coordina el envío de condiciones hipotéticas y el resultado del formulario.
export function useControladorPrediccionPuntual() {
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState("");
  const number = (value: number, digits = 1) =>
    value.toLocaleString("es-EC", { maximumFractionDigits: digits });
  const calcular = async (values: FormData) => {
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
  };
  return { busy, answer, calcular };
}
