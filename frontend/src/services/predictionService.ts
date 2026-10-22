const API = (import.meta.env.VITE_PREDICTION_API_URL || "/api").replace(
  /\/$/,
  "",
);
export type PredictionInput = {
  timestamp: string;
  irradiacion: number;
  temperatura_ambiente: number;
  temperatura_modulo?: number;
};
export type Metrics = {
  mae_wh: number;
  rmse_wh: number;
  r2: number;
  bias_wh: number;
};
export type ModelReport = {
  model: string;
  created_at: string;
  target_unit: string;
  timezone: string;
  features: string[];
  test: Metrics;
  daylight_test: Metrics | null;
  validation: (Metrics & { model: string })[];
  baseline: Metrics & { model: string };
  skill_vs_baseline_pct: number | null;
  uncertainty: {
    radius_wh: number;
    nominal_coverage: number;
    test_coverage: number;
    method: string;
  };
  partitions: Record<string, { start: string; end: string; rows: number }>;
  data_quality: {
    rows_source: number;
    rows_valid: number;
    rows_excluded: number;
    last_timestamp: string;
  };
  limitations: string[];
  backtest: { timestamp: string; actual_wh: number; predicted_wh: number }[];
};
export type AutomaticForecastPoint = {
  timestamp: string;
  hora: string;
  prediction_wh: number;
  mean_power_kw: number;
  lower_wh: number;
  upper_wh: number;
  baseline_wh: number;
  irradiacion: number;
  temperatura_ambiente: number;
};
export type ForecastResult = {
  forecast: AutomaticForecastPoint[];
  mode: string;
  date: string;
  timezone: string;
  interval_minutes: number;
  source_start: string;
  source_end: string;
  total_kwh: number;
  warnings: string[];
  report: ModelReport;
};

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
        "No se pudo conectar con la API predictiva. Inicia api_prediccion.py y vuelve a intentar.",
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
