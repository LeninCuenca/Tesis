"""Casos de uso de predicción puntual y escenarios históricos."""
from backend.modelos.radiacion_prevista import FUENTE
import numpy as np
import pandas as pd
from backend.modelos.modelo_solar import (INTERVAL_MINUTES, TIMEZONE, WEATHER, TARGET,
    bounded_predict, energy_to_power_kw, features, interval_bounds, local_index)
from backend.modelos.repositorio_prediccion import bundle, dataset
from backend.modelos.pronostico_diario import METODOS, pronosticar_dia


def finite_number(payload, key, minimum, maximum):
    value = payload[key]
    if isinstance(value, bool):
        raise ValueError(f'{key} debe ser numérico')
    value = float(value)
    if not np.isfinite(value) or not minimum <= value <= maximum:
        raise ValueError(f'{key} debe estar entre {minimum} y {maximum}')
    return value


def predict_one(payload):
    artifact = bundle()
    moment = local_index([payload['timestamp']])[0]
    irradiance = finite_number(payload, 'irradiacion', 0, 1600)
    ambient = finite_number(payload, 'temperatura_ambiente', -30, 60)
    warnings = []
    if payload.get('temperatura_modulo') is not None:
        module = finite_number(payload, 'temperatura_modulo', -30, 110)
        temperature_source = 'Proporcionada por el usuario'
    elif payload.get('poa_wm2') is not None:
        from pvlib.temperature import faiman
        poa = finite_number(payload, 'poa_wm2', 0, 1600)
        wind = finite_number(payload, 'wind_speed_ms', 0, 60)
        module = float(faiman(poa, ambient, wind))
        temperature_source = 'Estimada con pvlib Faiman, parámetros u0=25 y u1=6.84'
        warnings.append('Faiman utiliza POA y viento declarados; parámetros térmicos genéricos sin calibrar para esta instalación.')
    else:
        thermal_input = pd.DataFrame([{'Irradiación': irradiance, 'Temperatura ambiente': ambient}])
        module = float(artifact['thermal_model'].predict(thermal_input)[0])
        temperature_source = 'Estimada con modelo térmico histórico'
        warnings.append('Temperatura de módulo estimada; la evaluación publicada usa temperatura medida.')
    weather = pd.DataFrame([[irradiance, ambient, module]], index=[moment], columns=WEATHER)
    matrix = features(weather)
    prediction = float(bounded_predict(artifact['model'], matrix)[0])
    lower, upper = interval_bounds([prediction], artifact['report']['uncertainty']['radius_wh'])
    development_end = artifact['report']['partitions']['validation']['end']
    return {'timestamp': moment.isoformat(), 'prediction_wh': prediction,
            'mean_power_kw': float(energy_to_power_kw(prediction)),
            'interval_minutes': INTERVAL_MINUTES, 'lower_wh': float(lower[0]), 'upper_wh': float(upper[0]),
            'temperature_source': temperature_source, 'module_temperature_c': module,
            'warnings': warnings, 'model_trained_until': development_end}


def automatic_forecast(payload=None, *, before_target=False):
    payload = payload or {}
    artifact = bundle()
    data = dataset()
    last = data.index.max()
    date = payload.get('date')
    start = local_index([date])[0].normalize() if date else last.normalize() + pd.Timedelta(days=1)
    development_end = local_index([artifact['report']['partitions']['validation']['end']])[0]
    if start <= development_end.normalize():
        raise ValueError('La fecha debe ser posterior al entrenamiento y validación del modelo; no se dispone de un modelo anterior para evaluar ese día.')
    diario = artifact['report'].get('pronostico_diario')
    if diario and start <= local_index([artifact['report']['partitions']['calibration']['end']])[0].normalize():
        raise ValueError('La fecha debe ser posterior a la selección y calibración del pronóstico diario.')
    # Usar exclusivamente antecedentes anteriores al día consultado, también en /predict/auto.
    if before_target or start <= last:
        data = data.loc[data.index < start]
        if data.empty:
            raise ValueError('No hay antecedentes anteriores al día elegido para construir el escenario')
        last = data.index.max()
    metodo = diario['metodo'] if diario else 'clima_mediano'
    index, prediction, weather, source_start, source_end, efectivo = pronosticar_dia(artifact, data, start, metodo)
    respaldo = efectivo != metodo
    slots = index.hour * 60 + index.minute
    if diario and 'radios_horarios_wh' in diario:
        radius = np.repeat(diario['radios_respaldo_wh' if respaldo else 'radios_horarios_wh'], 12)
    else:
        radius = diario['radio_wh'] if diario else artifact['report']['uncertainty']['radius_wh']
    lower, upper = interval_bounds(prediction, radius)
    baseline = artifact['baseline_profile'].reindex(slots).to_numpy()
    forecast = [{'timestamp': moment.isoformat(), 'hora': moment.strftime('%H:%M'),
                 'prediction_wh': float(prediction[i]), 'mean_power_kw': float(energy_to_power_kw(prediction[i])),
                 'lower_wh': float(lower[i]), 'upper_wh': float(upper[i]),
                 'baseline_wh': float(baseline[i]),
                 'irradiacion': float(weather.iloc[i][WEATHER[0]]) if metodo == "clima_mediano" else None,
                 'temperatura_ambiente': float(weather.iloc[i][WEATHER[1]]) if metodo == "clima_mediano" else None} for i, moment in enumerate(index)]
    warnings = [
        f'{METODOS[efectivo]}. Se utiliza únicamente información anterior al día objetivo.',
        'La banda se calibra por intervalo sobre fechas históricas. No es una banda de incertidumbre para la energía diaria.',
    ]
    if respaldo:
        warnings.append('Archivo de radiación incompleto para esta fecha. La curva y su banda utilizan el perfil por calendario.')
    age = (pd.Timestamp.now(tz=TIMEZONE).normalize() - last.normalize()).days
    if age > 7:
        warnings.append(f'La última observación histórica tiene {age} días de antigüedad; actualizar datos antes de decisiones operativas.')
    return {'forecast': forecast, 'mode': 'historical_scenario', 'date': start.date().isoformat(),
            'timezone': TIMEZONE, 'interval_minutes': INTERVAL_MINUTES,
            'source_start': source_start, 'source_end': source_end, 'method_label': METODOS[efectivo],
            'fallback': respaldo, 'weather_source': FUENTE if efectivo == 'radiacion_calendario' else None,
            'total_kwh': float(prediction.sum() / 1000),
            'warnings': warnings, 'report': artifact['report']}


def historical_replay(payload=None):
    """Reproducción explícita de un día de prueba; no inserta datos ni reajusta el modelo."""
    payload = payload or {}
    artifact = bundle()
    history = dataset()
    test_start = local_index([artifact['report']['partitions']['test']['start']])[0].normalize()
    candidates = history.loc[history.index >= test_start]
    counts = candidates.groupby(candidates.index.normalize()).size()
    complete = counts[counts == 288].index
    if not len(complete):
        raise ValueError('No hay un día completo de prueba disponible para reproducir')
    ejemplo = local_index(['2025-05-25'])[0]
    predeterminado = ejemplo if ejemplo in complete else complete.max()
    day = local_index([payload['date']])[0].normalize() if payload.get('date') else predeterminado
    if day < test_start:
        raise ValueError('La reproducción requiere un día del conjunto de prueba, posterior al entrenamiento y calibración')
    observed = candidates.loc[candidates.index.normalize() == day]
    expected = pd.date_range(day, periods=288, freq='5min')
    if not observed.index.equals(expected):
        raise ValueError('El día elegido no tiene los 288 intervalos auditados completos')
    forecast = automatic_forecast({'date': day.date().isoformat()}, before_target=True)
    return {'mode': 'historical_replay', 'source': 'local_audited_history',
            'forecast': forecast,
            'observations': [{'timestamp': timestamp.isoformat(), 'actual_wh': float(value)}
                             for timestamp, value in observed[TARGET].items()],
            'notice': 'Reproducción de mediciones históricas auditadas. No son datos en vivo ni inserciones nuevas en Supabase.'}


