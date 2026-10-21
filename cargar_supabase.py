"""Carga dataset_limpio.pkl en Supabase usando la conexión PostgreSQL."""
import csv
import os
from io import StringIO
from pathlib import Path

import pandas as pd
import psycopg

BASE_DIR = Path(__file__).resolve().parent
DATASET = BASE_DIR / "dataset_limpio.pkl"
CENTRAL_ID = 1

COLUMN_MAP = {
    "Corriente CA L1": "corriente_ca_l1", "Corriente CA L2": "corriente_ca_l2", "Corriente CA L3": "corriente_ca_l3",
    "Corriente CC MPP1": "corriente_cc_mpp1", "Corriente CC MPP2": "corriente_cc_mpp2",
    "Energía": "energia", "Energía MPP1": "energia_mpp1", "Energía MPP2": "energia_mpp2",
    "Factor de potencia": "factor_potencia", "Potencia aparente": "potencia_aparente", "Potencia reactiva": "potencia_reactiva",
    "Rendimiento específico": "rendimiento_especifico", "Tensión CA L1": "tension_ca_l1", "Tensión CA L2": "tension_ca_l2", "Tensión CA L3": "tension_ca_l3",
    "Tensión CC MPP1": "tension_cc_mpp1", "Tensión CC MPP2": "tension_cc_mpp2", "Consumido directamente": "consumido_directamente",
    "Consumo": "consumo", "Energía obtenida de la red": "energia_obtenida_red", "Energía suministrada a la red": "energia_suministrada_red",
    "Producción fotovoltaica": "produccion_fotovoltaica",
    "Potencia aparente L1 punto de alimentación": "potencia_aparente_l1_alimentacion", "Potencia aparente L2 punto de alimentación": "potencia_aparente_l2_alimentacion", "Potencia aparente L3 punto de alimentación": "potencia_aparente_l3_alimentacion",
    "Potencia efectiva L1 punto de alimentación": "potencia_efectiva_l1_alimentacion", "Potencia efectiva L2 punto de alimentación": "potencia_efectiva_l2_alimentacion", "Potencia efectiva L3 punto de alimentación": "potencia_efectiva_l3_alimentacion",
    "Tensión CA L1 punto de alimentación": "tension_ca_l1_alimentacion", "Tensión CA L2 punto de alimentación": "tension_ca_l2_alimentacion", "Tensión CA L3 punto de alimentación": "tension_ca_l3_alimentacion",
    "Irradiación": "irradiacion", "Temperatura ambiente": "temperatura_ambiente", "Temperatura de módulo": "temperatura_modulo",
}


def csv_value(value):
    return "" if pd.isna(value) else value


def main():
    connection_string = os.environ.get("SUPABASE_DB_URL")
    if not connection_string:
        raise RuntimeError("Define SUPABASE_DB_URL con la conexión PostgreSQL de Supabase.")
    if not DATASET.exists():
        raise FileNotFoundError(DATASET)

    df = pd.read_pickle(DATASET).rename(columns=COLUMN_MAP)
    df.index = pd.to_datetime(df.index, utc=True)
    expected = list(COLUMN_MAP.values())
    missing = [column for column in expected if column not in df.columns]
    if missing:
        raise ValueError(f"Columnas faltantes: {missing}")

    columns = ["central_id", "fecha_hora"] + expected
    connection = psycopg.connect(connection_string)
    try:
        with connection.cursor() as cursor:
            cursor.execute("CREATE TEMP TABLE carga_mediciones (LIKE mediciones_energeticas INCLUDING DEFAULTS) ON COMMIT DROP")
            buffer = StringIO()
            writer = csv.writer(buffer)
            for timestamp, row in df[expected].iterrows():
                writer.writerow([CENTRAL_ID, timestamp.to_pydatetime()] + [csv_value(row[column]) for column in expected])
            buffer.seek(0)
            with cursor.copy(f"COPY carga_mediciones ({', '.join(columns)}) FROM STDIN WITH (FORMAT CSV, NULL '')") as copy:
                copy.write(buffer.getvalue())
            cursor.execute(
                f"INSERT INTO mediciones_energeticas ({', '.join(columns)}) "
                f"SELECT {', '.join(columns)} FROM carga_mediciones "
                "ON CONFLICT (central_id, fecha_hora) DO UPDATE SET "
                + ", ".join(f"{column}=EXCLUDED.{column}" for column in expected)
            )
            cursor.execute("""
                INSERT INTO resumen_diario
                    (central_id, fecha, produccion_fotovoltaica_wh, consumo_wh,
                     energia_red_wh, potencia_maxima, irradiacion_promedio,
                     temperatura_promedio, registros_validos)
                SELECT central_id, fecha_hora::date,
                    SUM(produccion_fotovoltaica), SUM(consumo),
                    SUM(energia_obtenida_red), MAX(potencia_aparente),
                    AVG(irradiacion), AVG(temperatura_ambiente),
                    COUNT(produccion_fotovoltaica)
                FROM mediciones_energeticas
                WHERE central_id = %s
                GROUP BY central_id, fecha_hora::date
                ON CONFLICT (central_id, fecha) DO UPDATE SET
                    produccion_fotovoltaica_wh = EXCLUDED.produccion_fotovoltaica_wh,
                    consumo_wh = EXCLUDED.consumo_wh,
                    energia_red_wh = EXCLUDED.energia_red_wh,
                    potencia_maxima = EXCLUDED.potencia_maxima,
                    irradiacion_promedio = EXCLUDED.irradiacion_promedio,
                    temperatura_promedio = EXCLUDED.temperatura_promedio,
                    registros_validos = EXCLUDED.registros_validos
            """, (CENTRAL_ID,))
        connection.commit()
        print(f"Mediciones procesadas: {len(df)}")
    finally:
        connection.close()


if __name__ == "__main__":
    main()