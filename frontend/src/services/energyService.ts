import { supabase, supabaseConfigured } from "../lib/supabase";
import {
  emptyDashboard,
  type DashboardData,
  type EnergyPoint,
  type Period,
} from "../types/energy";

const PERIOD_DAYS: Record<Period, number> = { day: 1, week: 7, month: 30 };
const numeric = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const sumKnown = (values: (number | null)[]) =>
  values.every((value) => value === null)
    ? null
    : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);

async function range(period: Period) {
  if (!supabaseConfigured || !supabase)
    throw new Error("SUPABASE_NOT_CONFIGURED");
  const { data, error } = await supabase
    .from("resumen_diario")
    .select("fecha")
    .eq("central_id", 1)
    .order("fecha", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const start = new Date(`${data.fecha}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - PERIOD_DAYS[period] + 1);
  return { start: start.toISOString().slice(0, 10), end: String(data.fecha) };
}

export async function fetchDashboardData(
  period: Period,
): Promise<DashboardData> {
  const dates = await range(period);
  if (!dates || !supabase) return emptyDashboard();
  const { data: rows, error } = await supabase
    .from("resumen_diario")
    .select(
      "fecha, produccion_fotovoltaica_wh, consumo_wh, irradiacion_promedio, temperatura_promedio, registros_validos",
    )
    .eq("central_id", 1)
    .gte("fecha", dates.start)
    .lte("fecha", dates.end)
    .order("fecha", { ascending: true });
  if (error) throw error;
  const points: EnergyPoint[] = [];
  // Mantener los días ausentes como huecos visibles y dentro del denominador.
  for (let offset = 0; offset < PERIOD_DAYS[period]; offset++) {
    const date = new Date(`${dates.start}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    const key = date.toISOString().slice(0, 10);
    const row = rows?.find((item) => item.fecha === key);
    const records = Math.max(0, numeric(row?.registros_validos) ?? 0);
    const generation = records
      ? numeric(row?.produccion_fotovoltaica_wh)
      : null;
    const consumption = row ? numeric(row.consumo_wh) : null;
    points.push({
      date: key,
      time: date.toLocaleDateString("es-EC", {
        day: "2-digit",
        month: "short",
        timeZone: "UTC",
      }),
      generation,
      consumption,
      solarCoverage:
        generation !== null && consumption !== null && consumption > 0
          ? (generation / consumption) * 100
          : null,
      irradiance: numeric(row?.irradiacion_promedio),
      temperature: numeric(row?.temperatura_promedio),
      records,
    });
  }
  const generationWh = sumKnown(points.map((point) => point.generation));
  const consumptionWh = sumKnown(points.map((point) => point.consumption));
  const records = points.reduce((total, point) => total + point.records, 0);
  const expectedRecords = PERIOD_DAYS[period] * 288;
  const warnings: string[] = [];
  const { data: reading, error: readingError } = await supabase
    .from("mediciones_energeticas")
    .select(
      "fecha_hora, temperatura_ambiente, irradiacion, temperatura_modulo, tension_ca_l1, corriente_ca_l1, tension_cc_mpp1, corriente_cc_mpp1, factor_potencia",
    )
    .eq("central_id", 1)
    .order("fecha_hora", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readingError)
    warnings.push(
      "No se pudo consultar la última medición; los resúmenes diarios sí están disponibles.",
    );
  if (records < expectedRecords)
    warnings.push(
      "El periodo contiene intervalos ausentes. Los acumulados reflejan solo los valores disponibles.",
    );
  if (records > expectedRecords)
    warnings.push(
      "El conteo supera la grilla esperada; revisar resúmenes duplicados o frecuencia de muestreo.",
    );
  const last = points.at(-1);
  return {
    points,
    totals: {
      generationWh,
      consumptionWh,
      coverage:
        generationWh !== null && consumptionWh !== null && consumptionWh > 0
          ? (generationWh / consumptionWh) * 100
          : null,
      dataCoverage: Math.min(100, (records / expectedRecords) * 100),
      specificYield: null,
    },
    latest: {
      temperature: reading
        ? numeric(reading.temperatura_ambiente)
        : (last?.temperature ?? null),
      irradiance: reading
        ? numeric(reading.irradiacion)
        : (last?.irradiance ?? null),
      timestamp: reading?.fecha_hora ?? null,
      source: reading ? "Medición almacenada" : "Promedio del último día",
      voltageAc: numeric(reading?.tension_ca_l1),
      currentAc: numeric(reading?.corriente_ca_l1),
      voltageDc: numeric(reading?.tension_cc_mpp1),
      currentDc: numeric(reading?.corriente_cc_mpp1),
      powerFactor: numeric(reading?.factor_potencia),
      moduleTemperature: numeric(reading?.temperatura_modulo),
    },
    records,
    expectedRecords,
    startDate: dates.start,
    endDate: dates.end,
    warnings,
  };
}

export async function fetchMeasurementExport(
  period: Period,
): Promise<Record<string, unknown>[]> {
  const dates = await range(period);
  if (!dates || !supabase) return [];
  const rows: Record<string, unknown>[] = [];
  // TIMESTAMPTZ de la instalación; no reinterpretar un UTC legado sin migrarlo.
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("mediciones_energeticas")
      .select("*")
      .eq("central_id", 1)
      .gte("fecha_hora", `${dates.start}T00:00:00Z`)
      .lte("fecha_hora", `${dates.end}T23:59:59Z`)
      .order("fecha_hora", { ascending: true })
      .range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}
