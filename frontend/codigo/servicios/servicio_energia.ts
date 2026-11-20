import { CENTRAL_PRINCIPAL, desplazarFecha, type CentralSolar } from "../modelos/centrales";
import { supabase, supabaseConfigured } from "../configuracion/cliente_supabase";
import {
  emptyDashboard,
  type DashboardData,
  type EnergyPoint,
  type Period,
} from "../modelos/energia";

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

async function range(period: Period, central: CentralSolar) {
  if (!supabaseConfigured || !supabase)
    throw new Error("SUPABASE_NOT_CONFIGURED");
  const { data, error } = await supabase
    .from("resumen_diario")
    .select("fecha")
    .eq("central_id", central.fuenteId)
    .order("fecha", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const end = desplazarFecha(`${data.fecha}T00:00:00Z`, central.desfaseDias).slice(0, 10);
  const start = new Date(`${end}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - PERIOD_DAYS[period] + 1);
  return { start: start.toISOString().slice(0, 10), end };
}

export async function fetchDashboardData(
  period: Period,
  central: CentralSolar = CENTRAL_PRINCIPAL,
): Promise<DashboardData> {
  const dates = await range(period, central);
  if (!dates || !supabase) return emptyDashboard();
  const { data: rows, error } = await supabase
    .from("resumen_diario")
    .select(
      "fecha, produccion_fotovoltaica_wh, consumo_wh, irradiacion_promedio, temperatura_promedio, registros_validos",
    )
    .eq("central_id", central.fuenteId)
    .gte("fecha", dates.start)
    .lte("fecha", dates.end)
    .order("fecha", { ascending: true });
  if (error) throw error;
  // Los resúmenes no prueban que ambas señales existan en los mismos intervalos.
  // Solo las lecturas emparejadas permiten comparar producción y consumo.
  const pares = new Map<string, { generacion: number; consumo: number; cantidad: number }>();
  let paresDisponibles = true;
  try {
    for (let offset = 0; ; offset += 1000) {
      const { data: lecturas, error: errorPares } = await supabase
        .from("mediciones_energeticas").select("fecha_hora, produccion_fotovoltaica, consumo")
        .eq("central_id", central.fuenteId)
        .gte("fecha_hora", `${dates.start}T00:00:00Z`).lte("fecha_hora", `${dates.end}T23:59:59Z`)
        .order("fecha_hora", { ascending: true }).range(offset, offset + 999);
      if (errorPares) throw errorPares;
      for (const lectura of lecturas ?? []) {
        const generacion = numeric(lectura.produccion_fotovoltaica);
        const consumo = numeric(lectura.consumo);
        const fecha = String(lectura.fecha_hora).slice(0, 10);
        if (generacion === null || consumo === null || generacion < 0 || consumo < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue;
        const par = pares.get(fecha) ?? { generacion: 0, consumo: 0, cantidad: 0 };
        par.generacion += generacion; par.consumo += consumo; par.cantidad++;
        pares.set(fecha, par);
      }
      if (!lecturas || lecturas.length < 1000) break;
    }
  } catch { paresDisponibles = false; pares.clear(); }
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
    const par = pares.get(key);
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
        par && par.consumo > 0
          ? (par.generacion / par.consumo) * 100
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
  if (!paresDisponibles) warnings.push("No se pudieron consultar los intervalos emparejados; la relación generación/consumo no está disponible.");
  else if (!pares.size) warnings.push("No hay intervalos con producción y consumo válidos simultáneamente; la relación no está disponible.");
  const generacionPareada = [...pares.values()].reduce((total, par) => total + par.generacion, 0);
  const consumoPareado = [...pares.values()].reduce((total, par) => total + par.consumo, 0);
  const { data: reading, error: readingError } = await supabase
    .from("mediciones_energeticas")
    .select(
      "fecha_hora, temperatura_ambiente, irradiacion, temperatura_modulo, tension_ca_l1, corriente_ca_l1, tension_cc_mpp1, corriente_cc_mpp1, factor_potencia",
    )
    .eq("central_id", central.fuenteId)
    .gte("fecha_hora", `${dates.start}T00:00:00Z`)
    .lte("fecha_hora", `${dates.end}T23:59:59Z`)
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
        consumoPareado > 0
          ? (generacionPareada / consumoPareado) * 100
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
  central: CentralSolar = CENTRAL_PRINCIPAL,
): Promise<Record<string, unknown>[]> {
  const dates = await range(period, central);
  if (!dates || !supabase) return [];
  const rows: Record<string, unknown>[] = [];
  // TIMESTAMPTZ de la instalación; no reinterpretar un UTC legado sin migrarlo.
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("mediciones_energeticas")
      .select("*")
      .eq("central_id", central.fuenteId)
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
