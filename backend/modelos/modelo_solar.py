"""Contrato único de variables y unidades para entrenamiento e inferencia."""
from pathlib import Path
import hashlib
import json
import os

import numpy as np
import pandas as pd

from backend.configuracion.rutas import ARTEFACTOS, AUDITORIA
TIMEZONE = 'America/Guayaquil'
INTERVAL_MINUTES = 5
TARGET = 'Producción fotovoltaica'
WEATHER = ['Irradiación', 'Temperatura ambiente', 'Temperatura de módulo']
FEATURES = ['Irradiación', 'Temperatura ambiente', 'Temperatura de módulo',
            'hora_sin', 'hora_cos', 'dia_anio_sin', 'dia_anio_cos', 'mes', 'hora', 'fin_de_semana']
BUNDLE_PATH = ARTEFACTOS / 'forecast_bundle.joblib'
REPORT_PATH = ARTEFACTOS / 'model_report.json'
AUDITED_DATA_PATH = Path(os.environ.get('SOLAR_AUDITED_DATA_PATH', AUDITORIA / 'audited-by-device/cleaned.pkl')).resolve()
AUDITED_CHANNELS = {
    TARGET: TARGET,
    'Irradiación': 'Irradiación | Sensor Card / Box (1) [W/m²]',
    'Temperatura ambiente': 'Temperatura ambiente | Sensor Card / Box (1) [°C]',
    'Temperatura de módulo': 'Temperatura de módulo | Sensor Card / Box (1) [°C]',
}


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


def _read_source(path, channels):
    path = Path(path) if path is not None else AUDITED_DATA_PATH
    with path.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        stream.seek(0)
        source = pd.read_pickle(stream)
    mapping = {name: AUDITED_CHANNELS[name] if AUDITED_CHANNELS[name] in source else name
               for name in channels}
    source = source[list(mapping.values())].rename(columns={channel: name for name, channel in mapping.items()})
    provenance = {'source_path': str(path.resolve()), 'source_sha256': digest, 'channel_mapping': mapping}
    if path.resolve() == AUDITED_DATA_PATH.resolve():
        summary = json.loads((path.parent / 'summary.json').read_text())
        if summary['status'] != 'complete' or summary['imputed_observed_cells'] != 0:
            raise ValueError('Se requiere limpieza completa sin imputaciones para este entrenamiento')
        provenance.update(input_rows=summary['input_rows'],
                          observed_timestamps=summary['observed_timestamps'],
                          inserted_timestamps=summary['inserted_timestamps'],
                          imputed_observed_cells=summary['imputed_observed_cells'],
                          cleaning_warnings=summary['warnings'],
                          source_manifest=json.loads((path.parent / 'source_manifest.json').read_text()))
    source.index = local_index(source.index)
    if source.index.has_duplicates:
        raise ValueError('El dataset contiene timestamps duplicados; consolidar antes de entrenar')
    source = source.sort_index().apply(pd.to_numeric, errors='coerce')
    provenance.update(rows_source=len(source), first_timestamp=source.index.min().isoformat(),
                      last_timestamp=source.index.max().isoformat())
    return source, provenance


def _interval_cadence(energy):
    on_grid = energy.index == energy.index.floor('5min')
    observed = energy.index[np.isfinite(energy) & on_grid]
    # Algunos Excel contienen días enteros a 10 min. Sus Wh no son comparables con los de 5 min.
    phase = pd.Series(observed.minute % 10, index=observed).groupby(observed.normalize())
    cadence = phase.agg(['size', 'min', 'max'])
    coarse_days = cadence.index[(cadence['size'] == 144) & (cadence['min'] == cadence['max'])]
    return on_grid, energy.index.normalize().isin(coarse_days)


def _weather_observations(source, provenance, on_grid, coarse):
    finite = np.isfinite(source).all(axis=1)
    plausible = finite & source[TARGET].ge(0) & source['Irradiación'].between(0, 1600)
    plausible &= source['Temperatura ambiente'].between(-30, 60)
    plausible &= source['Temperatura de módulo'].between(-30, 110)
    # Mantener las fechas de los cortes anteriores permite evaluar las mismas fechas
    # tras corregir la duración de las observaciones usadas en el entrenamiento.
    anchor_days = source.index[plausible].normalize().unique()
    valid = plausible & on_grid & ~coarse
    return source.loc[valid].copy(), {
        **provenance, 'rows_valid': int(valid.sum()), 'rows_excluded': int((~valid).sum()),
        'rows_missing_or_nonfinite': int((~finite).sum()),
        'rows_complete_outside_bounds': int((finite & ~plausible).sum()),
        'rows_off_grid': int((plausible & ~on_grid).sum()),
        'rows_ten_minute_days': int((plausible & coarse).sum()),
        'days_ten_minute': source.index[plausible & coarse].normalize().nunique(),
        'partition_anchor_days': anchor_days.strftime('%Y-%m-%d').tolist(),
        'zero_irradiance_positive_energy': int(((source['Irradiación'] == 0) & (source[TARGET] > 0)).sum()),
    }


def _production_observations(source, provenance, on_grid, coarse):
    energy = source[TARGET]
    finite = np.isfinite(energy)
    valid = finite & energy.ge(0) & on_grid & ~coarse
    return source.loc[valid, [TARGET]].copy(), {
        **provenance, 'channel_mapping': {TARGET: provenance['channel_mapping'][TARGET]},
        'rows_valid': int(valid.sum()), 'rows_excluded': int((~valid).sum()),
        'rows_missing_or_nonfinite': int((~finite).sum()), 'rows_negative': int((finite & (energy < 0)).sum()),
        'rows_off_grid': int((finite & ~on_grid).sum()), 'rows_ten_minute_days': int((finite & coarse).sum()),
        'days_ten_minute': energy.index[coarse].normalize().nunique(),
    }


def load_data(path=None):
    """Observaciones conjuntas para el diagnóstico condicionado a meteorología medida."""
    source, provenance = _read_source(path, [TARGET] + WEATHER)
    return _weather_observations(source, provenance, *_interval_cadence(source[TARGET]))


def load_production(path=None):
    """Producción de cinco minutos disponible aunque el sensor meteorológico carezca de lectura."""
    source, provenance = _read_source(path, [TARGET])
    return _production_observations(source, provenance, *_interval_cadence(source[TARGET]))


def load_training_data(path=None):
    """Lee la fuente una vez y devuelve observaciones, procedencia, producción y su procedencia."""
    source, provenance = _read_source(path, [TARGET] + WEATHER)
    cadence = _interval_cadence(source[TARGET])
    weather, weather_quality = _weather_observations(source, provenance, *cadence)
    production, production_quality = _production_observations(source, provenance, *cadence)
    return weather, weather_quality, production, production_quality


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
