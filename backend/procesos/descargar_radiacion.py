"""Descarga los plazos de 24 y 48 h ya emitidos para la celda del campus UTPL."""
import argparse
import json
from datetime import date, timedelta
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.parse import urlencode
from urllib.request import urlopen

import pandas as pd
from backend.modelos.modelo_solar import TIMEZONE
from backend.modelos.radiacion_prevista import ARCHIVO, MODELOS, COLUMNAS, cargar_archivo

ENDPOINT = 'https://previous-runs-api.open-meteo.com/v1/forecast'


def descargar(desde, hasta):
    if hasta < desde:
        raise ValueError('El final debe ser igual o posterior al inicio')
    bloques = []
    while desde <= hasta:
        fin = min(desde + timedelta(days=79), hasta)
        parametros = dict(latitude=-3.986, longitude=-79.198, timezone=TIMEZONE,
                          start_date=desde, end_date=fin, models=','.join(MODELOS),
                          hourly='shortwave_radiation_previous_day1,shortwave_radiation_previous_day2')
        with urlopen(f'{ENDPOINT}?{urlencode(parametros)}', timeout=60) as respuesta:
            datos = json.load(respuesta)
        if datos['timezone'] != TIMEZONE or any(datos['hourly_units'][c] != 'W/m²' for c in COLUMNAS):
            raise ValueError('Zona horaria o unidades inesperadas en el archivo meteorológico')
        bloque = pd.DataFrame(datos['hourly']).set_index('time')[COLUMNAS]
        bloque.index = pd.to_datetime(bloque.index)
        esperado = pd.date_range(desde, fin + timedelta(days=1), freq='h', inclusive='left')
        if not bloque.index.equals(esperado):
            raise ValueError('La respuesta no incluye todas las marcas horarias solicitadas')
        bloques.append(bloque)
        desde = fin + timedelta(days=1)
    anteriores = cargar_archivo().tz_localize(None)
    nuevas = pd.concat(bloques)
    # Una respuesta incompleta del proveedor nunca borra valores ya descargados.
    unido = nuevas.combine_first(anteriores).sort_index()[COLUMNAS].rename_axis('hora_local')
    ARCHIVO.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(dir=ARCHIVO.parent, delete=False) as temporal:
        ruta = Path(temporal.name)
    try:
        unido.to_csv(ruta, compression={'method': 'gzip', 'mtime': 0}, float_format='%.1f')
        ruta.replace(ARCHIVO)
    finally:
        ruta.unlink(missing_ok=True)
    print(f'{len(unido)} horas archivadas en {ARCHIVO}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('desde', type=date.fromisoformat)
    parser.add_argument('hasta', type=date.fromisoformat)
    args = parser.parse_args()
    descargar(args.desde, args.hasta)
