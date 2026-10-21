"""API local para ejecutar el modelo predictivo entrenado."""
import json
import sys
from datetime import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent
MODEL = joblib.load(BASE_DIR / 'modelo_pronostico_final.joblib')
DATASET = pd.read_pickle(BASE_DIR / 'dataset_limpio.pkl')
FEATURES = [
    'Irradiación', 'Temperatura ambiente', 'Temperatura de módulo',
    'hora_sin', 'hora_cos', 'dia_anio_sin', 'dia_anio_cos',
    'mes', 'hora', 'fin_de_semana',
]


def make_features(payload):
    moment = pd.Timestamp(payload['timestamp'])
    hour = moment.hour
    day_of_year = moment.dayofyear
    return {
        'Irradiación': float(payload['irradiacion']),
        'Temperatura ambiente': float(payload['temperatura_ambiente']),
        'Temperatura de módulo': float(payload['temperatura_modulo']),
        'hora_sin': np.sin(2 * np.pi * hour / 24),
        'hora_cos': np.cos(2 * np.pi * hour / 24),
        'dia_anio_sin': np.sin(2 * np.pi * day_of_year / 365.25),
        'dia_anio_cos': np.cos(2 * np.pi * day_of_year / 365.25),
        'mes': moment.month,
        'hora': hour,
        'fin_de_semana': int(moment.dayofweek >= 5),
    }


def automatic_forecast():
    weather = DATASET[['Irradiación', 'Temperatura ambiente', 'Temperatura de módulo']].copy()
    weather['hora'] = weather.index.hour
    profile = weather.groupby('hora').mean(numeric_only=True)
    start = DATASET.index.max().ceil('h')
    forecast = []
    for offset in range(24):
        moment = start + pd.Timedelta(hours=offset)
        hour_values = profile.loc[moment.hour].fillna(0)
        features = make_features({
            'timestamp': moment.isoformat(),
            'irradiacion': hour_values['Irradiación'],
            'temperatura_ambiente': hour_values['Temperatura ambiente'],
            'temperatura_modulo': hour_values['Temperatura de módulo'],
        })
        prediction = max(0, float(MODEL.predict(pd.DataFrame([features], columns=FEATURES))[0]))
        forecast.append({
            'timestamp': moment.isoformat(),
            'hora': moment.strftime('%H:%M'),
            'prediction_wh': prediction,
            'irradiacion': float(hour_values['Irradiación']),
            'temperatura_ambiente': float(hour_values['Temperatura ambiente']),
        })
    return forecast


class PredictionHandler(BaseHTTPRequestHandler):
    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', 'http://127.0.0.1:5176')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_json(204, {})

    def do_POST(self):
        if self.path == '/predict/auto':
            try:
                self.send_json(200, {'forecast': automatic_forecast()})
            except Exception as error:
                self.send_json(500, {'error': str(error)})
            return
        if self.path != '/predict':
            self.send_json(404, {'error': 'Ruta no encontrada'})
            return
        try:
            length = int(self.headers.get('Content-Length', 0))
            payload = json.loads(self.rfile.read(length))
            features = make_features(payload)
            prediction = float(MODEL.predict(pd.DataFrame([features], columns=FEATURES))[0])
            self.send_json(200, {'prediction_wh': max(0, prediction), 'features': features})
        except (KeyError, TypeError, ValueError) as error:
            self.send_json(400, {'error': f'Entrada inválida: {error}'})
        except Exception as error:
            self.send_json(500, {'error': str(error)})

    def log_message(self, format, *args):
        return


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f'API predictiva disponible en http://127.0.0.1:{port}/predict')
    HTTPServer(('127.0.0.1', port), PredictionHandler).serve_forever()
