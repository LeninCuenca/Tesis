import json
from urllib.request import Request, urlopen
import pandas as pd

from backend.configuracion.rutas import DATOS_LEGADOS, RAIZ_PROYECTO

def load_env():
    values = {}
    for line in (RAIZ_PROYECTO / '.env').read_text(encoding='utf-8').splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key, value = line.split('=', 1)
            values[key.strip()] = value.strip()
    return values

def clean(value):
    if pd.isna(value): return None
    if hasattr(value, 'item'): return value.item()
    return value

def post(url, headers, rows):
    request = Request(url, data=json.dumps(rows, allow_nan=False).encode(), headers={**headers, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=minimal'}, method='POST')
    with urlopen(request, timeout=120) as response: response.read()

def main():
    config = load_env()
    headers = {'apikey': config['SUPABASE_SECRET_KEY'], 'Authorization': f"Bearer {config['SUPABASE_SECRET_KEY']}"}
    df = pd.read_pickle(DATOS_LEGADOS / 'dataset_limpio.pkl')
    daily = df.assign(fecha=df.index.date).groupby('fecha').agg(
        produccion_fotovoltaica_wh=('Producción fotovoltaica', lambda values: values.sum(min_count=1)),
        consumo_wh=('Consumo', lambda values: values.sum(min_count=1)),
        energia_red_wh=('Energía obtenida de la red', lambda values: values.sum(min_count=1)),
        potencia_maxima=('Potencia aparente', 'max'),
        irradiacion_promedio=('Irradiación', 'mean'),
        temperatura_promedio=('Temperatura ambiente', 'mean'),
        registros_validos=('Producción fotovoltaica', 'count'),
    ).reset_index()
    rows = []
    for _, source in daily.iterrows():
        rows.append({'central_id': 1, 'fecha': str(source['fecha']), **{column: clean(source[column]) for column in daily.columns if column != 'fecha'}})
    post(f"{config['SUPABASE_URL']}/rest/v1/resumen_diario?on_conflict=central_id,fecha", headers, rows)
    print(f'Resumen diario cargado: {len(rows)} días')

if __name__ == '__main__': main()
