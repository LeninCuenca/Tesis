"""API local: escenarios históricos, predicción puntual y evaluación auditables."""
import json
import os
import sys
from functools import lru_cache
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

import joblib
import numpy as np
import pandas as pd

from solar_model import (BUNDLE_PATH, INTERVAL_MINUTES, TIMEZONE, WEATHER,
                         bounded_predict, energy_to_power_kw, features,
                         interval_bounds, load_data, local_index)


@lru_cache(maxsize=1)
def dataset():
    return load_data()[0]


@lru_cache(maxsize=1)
def _load_bundle(modified):
    return joblib.load(BUNDLE_PATH)


def bundle():
    if not BUNDLE_PATH.exists():
        raise FileNotFoundError('Ejecuta primero 04_pronostico_clima.py para generar el modelo validado')
    return _load_bundle(BUNDLE_PATH.stat().st_mtime_ns)


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


def automatic_forecast(payload=None):
    payload = payload or {}
    artifact = bundle()
    data = dataset()
    last = data.index.max()
    date = payload.get('date')
    start = local_index([date])[0].normalize() if date else last.normalize() + pd.Timedelta(days=1)
    # Una climatología reciente es un escenario; nunca se presenta como API meteorológica.
    history = data.loc[data.index >= last - pd.Timedelta(days=90)]
    profile = history[WEATHER[:2]].groupby(history.index.hour * 60 + history.index.minute).median()
    index = pd.date_range(start, periods=288, freq='5min')
    slots = index.hour * 60 + index.minute
    weather = profile.reindex(slots).set_axis(index)
    if weather.isna().any().any():
        raise ValueError('Perfil histórico incompleto; faltan franjas de cinco minutos para construir el escenario')
    weather[WEATHER[2]] = artifact['thermal_model'].predict(weather[WEATHER[:2]])
    prediction = bounded_predict(artifact['model'], features(weather))
    lower, upper = interval_bounds(prediction, artifact['report']['uncertainty']['radius_wh'])
    baseline = artifact['baseline_profile'].reindex(slots).to_numpy()
    forecast = [{'timestamp': moment.isoformat(), 'hora': moment.strftime('%H:%M'),
                 'prediction_wh': float(prediction[i]), 'mean_power_kw': float(energy_to_power_kw(prediction[i])),
                 'lower_wh': float(lower[i]), 'upper_wh': float(upper[i]),
                 'baseline_wh': float(baseline[i]),
                 'irradiacion': float(weather.iloc[i][WEATHER[0]]),
                 'temperatura_ambiente': float(weather.iloc[i][WEATHER[1]])} for i, moment in enumerate(index)]
    warnings = [
        'Escenario con medianas históricas de los últimos 90 días disponibles; no utiliza un pronóstico meteorológico en vivo.',
        'La banda muestra error por intervalo calibrado en histórico; no cuantifica incertidumbre meteorológica ni de energía diaria.',
        'Temperatura de módulo estimada desde irradiancia y temperatura ambiente históricas.',
    ]
    age = (pd.Timestamp.now(tz=TIMEZONE).normalize() - last.normalize()).days
    if age > 7:
        warnings.append(f'La última observación histórica tiene {age} días de antigüedad; actualizar datos antes de decisiones operativas.')
    return {'forecast': forecast, 'mode': 'historical_scenario', 'date': start.date().isoformat(),
            'timezone': TIMEZONE, 'interval_minutes': INTERVAL_MINUTES,
            'source_start': history.index.min().isoformat(), 'source_end': last.isoformat(),
            'total_kwh': float(prediction.sum() / 1000),
            'warnings': warnings, 'report': artifact['report']}


class PredictionHandler(BaseHTTPRequestHandler):
    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        allowed = os.environ.get('FRONTEND_ORIGINS', 'http://127.0.0.1:5176,http://localhost:5176,http://127.0.0.1:5173,http://localhost:5173').split(',')
        origin = self.headers.get('Origin')
        if origin in allowed:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_json(200, {})

    def do_GET(self):
        path = urlparse(self.path).path
        try:
            if path == '/health':
                self.send_json(200, {'status': 'ready', 'model': bundle()['report']['model'], 'timezone': TIMEZONE})
            elif path == '/model':
                self.send_json(200, bundle()['report'])
            else:
                self.send_json(404, {'error': 'Ruta no encontrada'})
        except (BrokenPipeError, ConnectionResetError):
            return  # El navegador canceló la consulta; no es un fallo del modelo.
        except FileNotFoundError as error:
            self.send_json(503, {'error': str(error)})

    def do_POST(self):
        path = urlparse(self.path).path
        if path not in ('/predict', '/predict/auto'):
            self.send_json(404, {'error': 'Ruta no encontrada'})
            return
        try:
            length = int(self.headers.get('Content-Length', 0))
            if length < 0 or length > 16384:
                self.send_json(413, {'error': 'Solicitud demasiado grande'})
                return
            payload = json.loads(self.rfile.read(length) or b'{}')
            if not isinstance(payload, dict):
                raise ValueError('Se esperaba un objeto JSON')
            self.send_json(200, automatic_forecast(payload) if path == '/predict/auto' else predict_one(payload))
        except (BrokenPipeError, ConnectionResetError):
            return  # El navegador canceló la consulta; no es un fallo del modelo.
        except FileNotFoundError as error:
            self.send_json(503, {'error': str(error)})
        except (KeyError, TypeError, ValueError, OverflowError) as error:
            self.send_json(400, {'error': f'Entrada inválida: {error}'})
        except Exception:
            self.send_json(500, {'error': 'No fue posible ejecutar el modelo. Revisa el registro del servidor.'})
            import traceback
            traceback.print_exc()

    def log_message(self, format, *args):
        return


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f'API predictiva: http://127.0.0.1:{port} (Ctrl+C para detener)', flush=True)
    ThreadingHTTPServer(('127.0.0.1', port), PredictionHandler).serve_forever()
