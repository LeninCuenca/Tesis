"""Perfil diario de producción para el calendario local de la central de Loja."""

import numpy as np
import pandas as pd

from backend.modelos.modelo_solar import TIMEZONE


# Días de descanso publicados para los años con mediciones de la central.
# Calendarios oficiales del Ministerio de Turismo:
# https://www.turismo.gob.ec/wp-content/uploads/2021/10/CALENDARIO-DE-FERIADOS.pdf
# https://www.turismo.gob.ec/wp-content/uploads/2022/12/CALENDARIO-FERIADOS-2023-2025-06-12-2022-.pdf
# El decreto 474 añadió el 2 y el 3 de enero de 2025 antes de la fecha de emisión:
# https://www.registroficial.gob.ec/segundo-suplemento-al-registro-oficial-no-703/
FERIADOS = {
    2020: '01-01 02-24 02-25 04-10 05-01 05-25 08-10 10-09 11-02 11-03 12-25',
    2023: '01-02 02-20 02-21 04-07 05-01 05-26 08-11 10-09 11-02 11-03 12-25',
    2024: '01-01 02-12 02-13 03-29 05-03 05-24 08-09 10-11 11-01 11-04 12-25',
    2025: '01-01 01-02 01-03 03-03 03-04 04-18 05-02 05-23 08-11 10-10 11-03 11-04 12-25',
}
FECHAS_FERIADAS = frozenset(
    f'{anio}-{dia}' for anio, dias in FERIADOS.items() for dia in dias.split()
)
DIAS_HISTORIA = 180


def _es_descanso(fechas):
    return (fechas.day_of_week >= 5) | fechas.strftime('%Y-%m-%d').isin(FECHAS_FERIADAS)


def perfil_calendario(historia: pd.Series, inicio: pd.Timestamp) -> np.ndarray:
    """Pronostica 288 intervalos desde medianoche con días comparables ya observados.

    Para años fuera del calendario publicado se distingue sábado/domingo.
    Si hay menos de cuatro días comparables se usa el perfil de todos los días válidos.
    """
    inicio = pd.Timestamp(inicio)
    inicio = inicio.tz_localize(TIMEZONE) if inicio.tz is None else inicio.tz_convert(TIMEZONE)
    inicio = inicio.normalize()
    indice = historia.index
    indice = indice.tz_localize(TIMEZONE) if indice.tz is None else indice.tz_convert(TIMEZONE)
    # Cortar antes de identificar el último dato también permite usar el archivo entero en un replay.
    anteriores = historia.set_axis(indice).loc[indice < inicio].dropna()
    if anteriores.empty:
        raise ValueError('Sin historial anterior para el perfil de calendario')
    ultimo_dia = anteriores.index.max().normalize()
    anteriores = anteriores.loc[anteriores.index >= ultimo_dia - pd.Timedelta(days=DIAS_HISTORIA - 1)]
    anteriores = anteriores.where(np.isfinite(anteriores) & (anteriores >= 0))
    en_franja = anteriores.index == anteriores.index.floor('5min')
    anteriores = anteriores.loc[en_franja]
    indice = anteriores.index
    dias = anteriores.groupby([indice.normalize(), indice.hour * 12 + indice.minute // 5]).mean().unstack()
    dias = dias.reindex(columns=range(288))
    # Un registro cada 10 min puede acumular dos intervalos. Se requieren al menos
    # 283 franjas distintas (98 %) para que el día aporte al perfil de cinco minutos.
    dias = dias.loc[dias.count(axis=1) >= 283]
    if dias.empty:
        raise ValueError('Sin días con cobertura suficiente para el perfil de calendario')
    es_descanso = _es_descanso(pd.DatetimeIndex([inicio]))[0]
    comparables = dias.loc[_es_descanso(dias.index) == es_descanso]
    perfil = dias.mean()
    if len(comparables) >= 4:
        perfil = comparables.mean().fillna(perfil)
    if perfil.isna().any():
        raise ValueError('Faltan franjas de cinco minutos en el historial del perfil de calendario')
    # Promedia franjas vecinas de la curva histórica con una desviación de diez minutos.
    desplazamientos = np.arange(-8, 9)
    pesos = np.exp(-.5 * (desplazamientos / 2) ** 2)
    valores = np.pad(perfil.to_numpy(), 8, mode='symmetric')
    return np.convolve(valores, pesos / pesos.sum(), mode='valid')
