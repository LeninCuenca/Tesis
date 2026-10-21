export type Period = 'day' | 'week' | 'month'

export type EnergyPoint = {
  time: string
  date: string
  generation: number
  consumption: number
  solarCoverage: number
}

export type DashboardData = {
  points: EnergyPoint[]
  totals: {
    generationWh: number
    consumptionWh: number
    coverage: number
    dataCoverage: number
    specificYield: number | null
  }
  latest: {
    temperature: number | null
    irradiance: number | null
    availability: number | null
  }
  records: number
}

export type DataState = 'loading' | 'ready' | 'not-configured' | 'error'
