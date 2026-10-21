export type PredictionInput = {
  timestamp: string
  irradiacion: number
  temperatura_ambiente: number
  temperatura_modulo: number
}

export async function predictProduction(input: PredictionInput) {
  const response = await fetch('http://127.0.0.1:8000/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? 'No se pudo ejecutar la predicción')
  return result as { prediction_wh: number }
}

export type AutomaticForecastPoint = {
  timestamp: string
  hora: string
  prediction_wh: number
  irradiacion: number
  temperatura_ambiente: number
}

export async function fetchAutomaticForecast() {
  const response = await fetch('http://127.0.0.1:8000/predict/auto', { method: 'POST' })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? 'No se pudo generar el pronóstico')
  return result.forecast as AutomaticForecastPoint[]
}
