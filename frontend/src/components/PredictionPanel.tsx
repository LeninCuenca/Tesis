import { useEffect, useState } from 'react'
import { AlertCircle, BrainCircuit, RefreshCw } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fetchAutomaticForecast, type AutomaticForecastPoint } from '../services/predictionService'

export function PredictionPanel() {
  const [forecast, setForecast] = useState<AutomaticForecastPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadForecast = async () => {
    setLoading(true); setError('')
    try { setForecast(await fetchAutomaticForecast()) } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo generar el pronóstico') } finally { setLoading(false) }
  }

  useEffect(() => { void loadForecast() }, [])
  const total = forecast.reduce((sum, point) => sum + point.prediction_wh, 0)
  const peak = forecast.reduce((current, point) => point.prediction_wh > current.prediction_wh ? point : current, forecast[0])

  return <div className="prediction-runner"><article className="panel automatic-prediction"><div className="prediction-symbol"><BrainCircuit size={22} /></div><p className="panel-kicker">PRONÓSTICO AUTOMÁTICO</p><h2>Producción estimada · próximas 24 horas</h2><p className="muted-copy">El sistema genera el pronóstico usando los perfiles horarios históricos de irradiación y temperatura junto con el modelo entrenado.</p>{error ? <div className="prediction-error"><AlertCircle size={15} />{error}<button type="button" onClick={() => void loadForecast()}>Reintentar</button></div> : <div className="forecast-chart">{loading ? <div className="result-empty">Generando pronóstico...</div> : <ResponsiveContainer width="100%" height="100%"><AreaChart data={forecast} margin={{ top: 15, right: 8, left: -25, bottom: 0 }}><defs><linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2e8b71" stopOpacity={.35} /><stop offset="100%" stopColor="#2e8b71" stopOpacity={.03} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#e9e5dc" strokeDasharray="3 3" /><XAxis dataKey="hora" tickLine={false} axisLine={false} tick={{ fill: '#8d918d', fontSize: 10 }} interval={3} /><YAxis tickLine={false} axisLine={false} tick={{ fill: '#8d918d', fontSize: 10 }} /><Tooltip formatter={(value) => [`${Number(value ?? 0).toFixed(2)} Wh`, 'Estimación']} /><Area type="monotone" dataKey="prediction_wh" name="Producción estimada" stroke="#2e8b71" strokeWidth={2.5} fill="url(#forecastFill)" /></AreaChart></ResponsiveContainer>}</div>}</article><article className="panel forecast-summary"><div className="panel-heading"><div><p className="panel-kicker">RESULTADO DEL MODELO</p><h2>Resumen de pronóstico</h2></div><button className="icon-button" type="button" aria-label="Actualizar pronóstico" onClick={() => void loadForecast()}><RefreshCw size={17} className={loading ? 'spin' : ''} /></button></div><div className="forecast-total"><span>Producción estimada acumulada</span><strong>{forecast.length ? (total / 1_000_000).toFixed(4) : '—'} <small>MWh</small></strong></div><div className="forecast-detail"><span>Intervalos calculados</span><strong>{forecast.length || '—'}</strong></div><div className="forecast-detail"><span>Pico estimado</span><strong>{peak ? `${peak.prediction_wh.toFixed(2)} Wh · ${peak.hora}` : '—'}</strong></div><span className="model-status">Regresión Lineal · 10 variables</span></article></div>
}
