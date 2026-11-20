"""Corrección de la curva diaria con radiación regional pronosticada antes de medianoche."""
import numpy as np
import pandas as pd
from scipy.ndimage import gaussian_filter1d
from sklearn.linear_model import Ridge

from backend.configuracion.rutas import BASE_DATOS
from backend.modelos.modelo_solar import TIMEZONE

ARCHIVO = BASE_DATOS / 'datos/meteorologia/radiacion_loja.csv.gz'
MODELOS = ('gfs_global', 'icon_global', 'ecmwf_ifs025')
COLUMNAS = [f'shortwave_radiation_previous_day{plazo}_{modelo}' for plazo in (1, 2) for modelo in MODELOS]
FUENTE = 'Open-Meteo Previous Runs · GFS, ICON y ECMWF · radiación horaria prevista'
URL_DOCUMENTACION = 'https://open-meteo.com/en/docs/previous-runs-api'


def cargar_archivo():
    if not ARCHIVO.is_file():
        return pd.DataFrame(columns=COLUMNAS, index=pd.DatetimeIndex([], tz=TIMEZONE))
    tabla = pd.read_csv(ARCHIVO, index_col='hora_local', parse_dates=True)
    tabla.index = tabla.index.tz_localize(TIMEZONE)
    if tabla.index.has_duplicates or not tabla.index.is_monotonic_increasing:
        raise ValueError('Archivo meteorológico con horas duplicadas o desordenadas')
    return tabla[COLUMNAS]


def variables_radiacion(archivo, dia, perfil):
    """La última hora (00:00 de mañana) emplea también el plazo de dos días."""
    if archivo.empty:
        return None
    horas = pd.date_range(dia, periods=25, freq='h')
    radiacion = archivo.reindex(horas).to_numpy(dtype=float)
    # Los plazos son relativos a la hora válida. Hasta las 15 h se reserva un
    # margen mínimo de 9 h entre inicialización y medianoche para difusión.
    plazo_uno = (np.arange(25) <= 15)[:, None]
    previsto = np.where(plazo_uno, radiacion[:, :3], radiacion[:, 3:])
    previas = archivo.loc[(archivo.index >= dia - pd.Timedelta(days=60)) & (archivo.index < dia)]
    if previas.empty or not np.isfinite(previsto).all():
        return None
    por_hora = previas.groupby(previas.index.hour)
    normales = por_hora.mean().where(por_hora.count() >= 14).reindex(np.arange(25) % 24).to_numpy()
    normal = np.where(plazo_uno, normales[:, :3], normales[:, 3:])
    if not np.isfinite(normal).all():
        return None
    # La hora válida de Open-Meteo cierra la media de la hora precedente.
    franjas = np.arange(288) / 12
    diferencia = np.column_stack([
        np.interp(franjas, np.arange(25) - .5, serie) for serie in (previsto - normal).T
    ])
    diferencia = gaussian_filter1d(diferencia, sigma=12, axis=0)
    escala = np.clip(perfil / 500, 0, 2)
    return np.column_stack([diferencia * escala[:, None],
                            diferencia.mean(axis=1) * escala * (dia.day_of_week < 5)])


def ajustar_radiacion(matrices, residuos):
    if len(matrices) < 30:
        return None
    # Regularización y contracción hacia el perfil local ante errores de la celda regional.
    modelo = Ridge(alpha=3_000_000, fit_intercept=False).fit(np.vstack(matrices), np.concatenate(residuos))
    return .5 * modelo.coef_
