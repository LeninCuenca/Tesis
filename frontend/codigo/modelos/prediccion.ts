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
type ErroresPronosticoDiario = {
  mae_wh: number;
  rmse_wh: number;
  mae_diario_kwh?: number;
  sesgo_diario_kwh?: number;
};
export type ModelReport = {
  pronostico_diario?: {
    nombre: string;
    dias_prueba: number;
    prueba: ErroresPronosticoDiario;
    referencia_prueba: ErroresPronosticoDiario;
    media_180_dias_prueba?: ErroresPronosticoDiario;
    calendario_prueba?: ErroresPronosticoDiario;
    cobertura_calendario_prueba?: number;
    periodo_prueba_examinado_previamente?: boolean;
    cobertura_prueba: number;
  };
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
  irradiacion: number | null;
  temperatura_ambiente: number | null;
};
export type ForecastResult = {
  forecast: AutomaticForecastPoint[];
  mode: string;
  method_label?: string;
  weather_source?: string | null;
  fallback?: boolean;
  date: string;
  timezone: string;
  interval_minutes: number;
  source_start: string;
  source_end: string;
  total_kwh: number;
  warnings: string[];
  report: ModelReport;
};

export function evaluacionDelPronostico(plan: ForecastResult) {
  const diario = plan.report.pronostico_diario;
  if (!diario) return undefined;
  const respaldo = plan.fallback === true;
  return {
    metodo: plan.method_label ?? (respaldo ? "Respaldo por calendario" : diario.nombre),
    dias: diario.dias_prueba,
    errores: respaldo ? diario.calendario_prueba : diario.prueba,
    cobertura: respaldo ? diario.cobertura_calendario_prueba : diario.cobertura_prueba,
  };
}

