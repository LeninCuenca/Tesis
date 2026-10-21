import { supabase, supabaseConfigured } from '../lib/supabase'
import type { DashboardData, EnergyPoint, Period } from '../types/energy'

const PERIOD_DAYS: Record<Period, number> = { day: 1, week: 7, month: 30 }

const numeric = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export async function fetchDashboardData(period: Period): Promise<DashboardData> {
  if (!supabaseConfigured || !supabase) throw new Error('SUPABASE_NOT_CONFIGURED')

  const { data: lastDay, error: lastDayError } = await supabase
    .from('resumen_diario')
    .select('fecha')
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (lastDayError) throw lastDayError
  if (!lastDay) return emptyDashboard()

  const end = new Date(`${lastDay.fecha}T23:59:59Z`)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - PERIOD_DAYS[period] + 1)
  const startDate = start.toISOString().slice(0, 10)

  const { data: rows, error } = await supabase
    .from('resumen_diario')
    .select('fecha, produccion_fotovoltaica_wh, consumo_wh, irradiacion_promedio, temperatura_promedio, registros_validos')
    .eq('central_id', 1)
    .gte('fecha', startDate)
    .lte('fecha', lastDay.fecha)
    .order('fecha', { ascending: true })
  if (error) throw error

  const points: EnergyPoint[] = (rows ?? []).map((row) => {
    const generation = numeric(row.produccion_fotovoltaica_wh)
    const consumption = numeric(row.consumo_wh)
    return {
      date: row.fecha,
      time: period === 'day' ? row.fecha.slice(5) : new Date(`${row.fecha}T00:00:00`).toLocaleDateString('es-EC', { weekday: 'short' }).replace('.', ''),
      generation,
      consumption,
      solarCoverage: consumption ? Math.min(100, generation / consumption * 100) : 0,
    }
  })

  const generationWh = points.reduce((sum, point) => sum + point.generation, 0)
  const consumptionWh = points.reduce((sum, point) => sum + point.consumption, 0)
  const validRecords = (rows ?? []).reduce((sum, row) => sum + numeric(row.registros_validos), 0)
  const expectedRecords = points.length * 288
  const latest = rows?.at(-1)
  const { data: latestReading } = await supabase
    .from('mediciones_energeticas')
    .select('temperatura_ambiente, irradiacion')
    .eq('central_id', 1)
    .order('fecha_hora', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    points,
    totals: {
      generationWh,
      consumptionWh,
      coverage: consumptionWh ? generationWh / consumptionWh * 100 : 0,
      dataCoverage: expectedRecords ? Math.min(100, validRecords / expectedRecords * 100) : 0,
      specificYield: null,
    },
    latest: {
      temperature: latestReading ? numeric(latestReading.temperatura_ambiente) : numeric(latest?.temperatura_promedio),
      irradiance: latestReading ? numeric(latestReading.irradiacion) : numeric(latest?.irradiacion_promedio),
      availability: latest ? numeric(latest.registros_validos) : null,
    },
    records: points.filter((point) => point.generation > 0).length,
  }
}

export async function fetchMeasurementExport(period: Period): Promise<Record<string, unknown>[]> {
  if (!supabaseConfigured || !supabase) throw new Error('SUPABASE_NOT_CONFIGURED')

  const { data: lastDay, error: lastDayError } = await supabase
    .from('resumen_diario')
    .select('fecha')
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (lastDayError) throw lastDayError
  if (!lastDay) return []

  const end = new Date(`${lastDay.fecha}T23:59:59Z`)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - PERIOD_DAYS[period] + 1)
  const startDate = start.toISOString().slice(0, 10)
  const rows: Record<string, unknown>[] = []
  const pageSize = 1000

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('mediciones_energeticas')
      .select('*')
      .eq('central_id', 1)
      .gte('fecha_hora', `${startDate}T00:00:00Z`)
      .lte('fecha_hora', `${lastDay.fecha}T23:59:59Z`)
      .order('fecha_hora', { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < pageSize) break
  }
  return rows
}

function emptyDashboard(): DashboardData {
  return { points: [], totals: { generationWh: 0, consumptionWh: 0, coverage: 0, dataCoverage: 0, specificYield: null }, latest: { temperature: null, irradiance: null, availability: null }, records: 0 }
}
