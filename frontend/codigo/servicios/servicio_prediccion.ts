import type { PredictionInput, ForecastResult } from "../modelos/prediccion";
import type { Evaluation } from "../modelos/evaluacion";
const API = (import.meta.env.VITE_PREDICTION_API_URL || "/api").replace(
  /\/$/,
  "",
);

async function request<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  try {
    const response = await fetch(`${API}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
        : AbortSignal.timeout(30000),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error ?? "No se pudo ejecutar el modelo");
    return result as T;
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError")
      throw new Error(
        "La API tardó demasiado en responder. Revisa el servidor y vuelve a intentar.",
      );
    if (
      error instanceof TypeError ||
      (error instanceof Error && error.name === "SyntaxError")
    )
      throw new Error(
        "No se pudo conectar con la API predictiva. Ejecuta npm run api y vuelve a intentar.",
      );
    throw error;
  }
}
export const fetchAutomaticForecast = (date?: string, signal?: AbortSignal) =>
  request<ForecastResult>("/predict/auto", date ? { date } : {}, signal);
export const predictProduction = (input: PredictionInput) =>
  request<{
    prediction_wh: number;
    mean_power_kw: number;
    warnings: string[];
    temperature_source: string;
  }>("/predict", input);

export const consultarEvaluacion = (signal?: AbortSignal) =>
  request<Evaluation>("/evaluation", undefined, signal);

export const consultarReproduccionHistorica = (signal?: AbortSignal, date?: string) =>
  request<import("../modelos/seguimiento_prediccion").ReproduccionHistorica>("/predict/replay", date ? { date } : {}, signal);
