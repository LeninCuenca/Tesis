export type Period = "day" | "week" | "month";
export type EnergyPoint = {
  date: string;
  time: string;
  generation: number | null;
  consumption: number | null;
  solarCoverage: number | null;
  irradiance: number | null;
  temperature: number | null;
  records: number;
};
export type DashboardData = {
  points: EnergyPoint[];
  totals: {
    generationWh: number | null;
    consumptionWh: number | null;
    coverage: number | null;
    dataCoverage: number;
    specificYield: number | null;
  };
  latest: {
    temperature: number | null;
    irradiance: number | null;
    timestamp: string | null;
    source: string;
    voltageAc: number | null;
    currentAc: number | null;
    voltageDc: number | null;
    currentDc: number | null;
    powerFactor: number | null;
    moduleTemperature: number | null;
  };
  records: number;
  expectedRecords: number;
  startDate: string | null;
  endDate: string | null;
  warnings: string[];
};
export type DataState = "loading" | "ready" | "not-configured" | "error";
export function emptyDashboard(): DashboardData {
  return {
    points: [],
    totals: {
      generationWh: null,
      consumptionWh: null,
      coverage: null,
      dataCoverage: 0,
      specificYield: null,
    },
    latest: {
      temperature: null,
      irradiance: null,
      timestamp: null,
      source: "Sin lectura",
      voltageAc: null,
      currentAc: null,
      voltageDc: null,
      currentDc: null,
      powerFactor: null,
      moduleTemperature: null,
    },
    records: 0,
    expectedRecords: 0,
    startDate: null,
    endDate: null,
    warnings: [],
  };
}
