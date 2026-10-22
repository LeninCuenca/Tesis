"""Contrato único de variables y unidades para entrenamiento e inferencia."""
from pathlib import Path

import numpy as np
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent
TIMEZONE = 'America/Guayaquil'
INTERVAL_MINUTES = 5
TARGET = 'Producción fotovoltaica'
WEATHER = ['Irradiación', 'Temperatura ambiente', 'Temperatura de módulo']
FEATURES = ['Irradiación', 'Temperatura ambiente', 'Temperatura de módulo',
            'hora_sin', 'hora_cos', 'dia_anio_sin', 'dia_anio_cos', 'mes', 'hora', 'fin_de_semana']
BUNDLE_PATH = BASE_DIR / 'artifacts/forecast_bundle.joblib'
REPORT_PATH = BASE_DIR / 'artifacts/model_report.json'


def local_index(values):
    index = pd.DatetimeIndex(values)
    if index.hasnans:
        raise ValueError('Hay fechas inválidas')
    return index.tz_localize(TIMEZONE) if index.tz is None else index.tz_convert(TIMEZONE)


def features(weather):
    """Clima ya alineado a la hora local; fracción de hora preservada."""
    out = weather[WEATHER].astype(float).copy()
    index = local_index(out.index)
    out.index = index
    hour = index.hour + index.minute / 60
    out['hora_sin'] = np.sin(2 * np.pi * hour / 24)
    out['hora_cos'] = np.cos(2 * np.pi * hour / 24)
    out['dia_anio_sin'] = np.sin(2 * np.pi * index.day_of_year / 365.25)
    out['dia_anio_cos'] = np.cos(2 * np.pi * index.day_of_year / 365.25)
    out['mes'] = index.month
    out['hora'] = hour
    out['fin_de_semana'] = (index.day_of_week >= 5).astype(int)
    return out[FEATURES]


def load_data(path=None):
    source = pd.read_pickle(path or BASE_DIR / 'dataset_limpio.pkl')
    source.index = local_index(source.index)
    if source.index.has_duplicates:
        raise ValueError('El dataset contiene timestamps duplicados; consolidar antes de entrenar')
    source = source.sort_index()
    required = source[[TARGET] + WEATHER].apply(pd.to_numeric, errors='coerce')
    valid = np.isfinite(required).all(axis=1)
    valid &= required[TARGET].ge(0) & required['Irradiación'].between(0, 1600)
    valid &= required['Temperatura ambiente'].between(-30, 60)
    valid &= required['Temperatura de módulo'].between(-30, 110)
    # El target ya representa energía del intervalo; nunca se interpola aquí.
    return required.loc[valid].copy(), {
        'rows_source': len(required), 'rows_valid': int(valid.sum()),
        'rows_excluded': int((~valid).sum()),
        'first_timestamp': source.index.min().isoformat(),
        'last_timestamp': source.index.max().isoformat(),
        'zero_irradiance_positive_energy': int(((required['Irradiación'] == 0) & (required[TARGET] > 0)).sum()),
    }


def bounded_predict(model, matrix):
    prediction = np.maximum(0, np.asarray(model.predict(matrix), dtype=float))
    # Restricción basada en irradiancia, sin horarios de amanecer inventados.
    prediction[matrix['Irradiación'].to_numpy() <= 0] = 0
    return prediction


def energy_to_power_kw(energy_wh):
    """Potencia media de un intervalo de cinco minutos, no potencia instantánea."""
    return np.asarray(energy_wh) * 60 / INTERVAL_MINUTES / 1000


def interval_bounds(prediction, radius):
    prediction = np.asarray(prediction)
    return np.maximum(0, prediction - radius), prediction + radius
