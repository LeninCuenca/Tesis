"""Carga el dataset limpio en Supabase mediante la API REST por lotes."""
import json
from pathlib import Path
from urllib.request import Request, urlopen

import pandas as pd

BASE_DIR = Path(__file__).resolve().parent
DATASET = BASE_DIR / 'dataset_limpio.pkl'
ENV_FILE = BASE_DIR / '.env'
BATCH_SIZE = 500

COLUMN_MAP = {
    'Corriente CA L1': 'corriente_ca_l1', 'Corriente CA L2': 'corriente_ca_l2', 'Corriente CA L3': 'corriente_ca_l3',
    'Corriente CC MPP1': 'corriente_cc_mpp1', 'Corriente CC MPP2': 'corriente_cc_mpp2',
    'Energía': 'energia', 'Energía MPP1': 'energia_mpp1', 'Energía MPP2': 'energia_mpp2',
    'Factor de potencia': 'factor_potencia', 'Potencia aparente': 'potencia_aparente', 'Potencia reactiva': 'potencia_reactiva',
    'Rendimiento específico': 'rendimiento_especifico', 'Tensión CA L1': 'tension_ca_l1', 'Tensión CA L2': 'tension_ca_l2', 'Tensión CA L3': 'tension_ca_l3',
    'Tensión CC MPP1': 'tension_cc_mpp1', 'Tensión CC MPP2': 'tension_cc_mpp2', 'Consumido directamente': 'consumido_directamente',
    'Consumo': 'consumo', 'Energía obtenida de la red': 'energia_obtenida_red', 'Energía suministrada a la red': 'energia_suministrada_red',
    'Producción fotovoltaica': 'produccion_fotovoltaica',
    'Potencia aparente L1 punto de alimentación': 'potencia_aparente_l1_alimentacion', 'Potencia aparente L2 punto de alimentación': 'potencia_aparente_l2_alimentacion', 'Potencia aparente L3 punto de alimentación': 'potencia_aparente_l3_alimentacion',
    'Potencia efectiva L1 punto de alimentación': 'potencia_efectiva_l1_alimentacion', 'Potencia efectiva L2 punto de alimentación': 'potencia_efectiva_l2_alimentacion', 'Potencia efectiva L3 punto de alimentación': 'potencia_efectiva_l3_alimentacion',
    'Tensión CA L1 punto de alimentación': 'tension_ca_l1_alimentacion', 'Tensión CA L2 punto de alimentación': 'tension_ca_l2_alimentacion', 'Tensión CA L3 punto de alimentación': 'tension_ca_l3_alimentacion',
    'Irradiación': 'irradiacion', 'Temperatura ambiente': 'temperatura_ambiente', 'Temperatura de módulo': 'temperatura_modulo',
}


def load_env():
    values = {}
    for line in ENV_FILE.read_text(encoding='utf-8').splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key, value = line.split('=', 1)
            values[key.strip()] = value.strip()
    return values


def clean_value(value):
    if pd.isna(value):
        return None
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if hasattr(value, 'item'):
        return value.item()
    return value


def post_rows(url, headers, rows, query=''):
    request = Request(
        f'{url}{query}',
        data=json.dumps(rows, allow_nan=False).encode('utf-8'),
        headers={**headers, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=minimal'},
        method='POST',
    )
    with urlopen(request, timeout=120) as response:
        response.read()
        return response.status


def main():
    config = load_env()
    if not DATASET.exists():
        raise FileNotFoundError(DATASET)
    if 'SUPABASE_URL' not in config or 'SUPABASE_SECRET_KEY' not in config:
        raise RuntimeError('Faltan SUPABASE_URL o SUPABASE_SECRET_KEY en .env')

    headers = {'apikey': config['SUPABASE_SECRET_KEY'], 'Authorization': f"Bearer {config['SUPABASE_SECRET_KEY']}"}
    api = f"{config['SUPABASE_URL']}/rest/v1/"
    df = pd.read_pickle(DATASET).rename(columns=COLUMN_MAP)
    columns = list(COLUMN_MAP.values())
    rows = []
    for timestamp, source_row in df[columns].iterrows():
        row = {'central_id': 1, 'fecha_hora': timestamp.isoformat()}
        row.update({column: clean_value(source_row[column]) for column in columns})
        rows.append(row)
        if len(rows) == BATCH_SIZE:
            post_rows(api + 'mediciones_energeticas', headers, rows, '?on_conflict=central_id,fecha_hora')
            print(f'Mediciones enviadas: {timestamp}', flush=True)
            rows.clear()
    if rows:
        post_rows(api + 'mediciones_energeticas', headers, rows, '?on_conflict=central_id,fecha_hora')

    daily = df.assign(fecha=df.index.date).groupby('fecha').agg(
        produccion_fotovoltaica_wh=('Producción fotovoltaica', 'sum'),
        consumo_wh=('Consumo', 'sum'),
        energia_red_wh=('Energía obtenida de la red', 'sum'),
        potencia_maxima=('Potencia aparente', 'max'),
        irradiacion_promedio=('Irradiación', 'mean'),
        temperatura_promedio=('Temperatura ambiente', 'mean'),
        registros_validos=('Producción fotovoltaica', 'count'),
    ).reset_index()
    summary_rows = []
    for _, source_row in daily.iterrows():
        summary_rows.append({'central_id': 1, 'fecha': str(source_row['fecha']), **{column: clean_value(source_row[column]) for column in daily.columns if column != 'fecha'}})
    for start in range(0, len(summary_rows), BATCH_SIZE):
        post_rows(api + 'resumen_diario', headers, summary_rows[start:start + BATCH_SIZE], '?on_conflict=central_id,fecha')

    print(f'Carga completada: {len(df)} mediciones y {len(summary_rows)} resúmenes diarios')


if __name__ == '__main__':
    main()
