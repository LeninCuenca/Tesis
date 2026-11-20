export type Daily = {
  complete_days: number;
  excluded_days: number;
  mae_kwh: number | null;
  rmse_kwh: number | null;
  bias_kwh: number | null;
  days: { date: string; actual_kwh: number; predicted_kwh: number; complete: boolean; rows: number }[];
};
type Physical = {
  value: number | null;
  status: string;
  unit: string;
  requirements: string[];
};
export type Evaluation = {
  central: string;
  daily_test: Daily;
  daily_baseline: Daily;
  daily_persistence: Daily;
  physical: Record<string, Physical>;
  storage: { rows: number; channels: number; integrity: string };
  limitations: string[];
  test_period: { start: string; end: string };
};
