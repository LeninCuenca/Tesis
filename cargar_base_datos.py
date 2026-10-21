"""Carga dataset_limpio.pkl en MariaDB por lotes y genera el resumen diario."""
from pathlib import Path

import pandas as pd

try:
    import mariadb
except ImportError as exc:
    raise SystemExit(
        "Falta el conector. Instala mariadb con: "
        "python -m pip install mariadb"
    ) from exc

BASE_DIR = Path(__file__).resolve().parent
DATASET = BASE_DIR / "dataset_limpio.pkl"
BATCH_SIZE = 5000
CENTRAL_ID = 1

COLUMN_MAP = {
    "Corriente CA L1": "corriente_ca_l1",
    "Corriente CA L2": "corriente_ca_l2",
    "Corriente CA L3": "corriente_ca_l3",
    "Corriente CC MPP1": "corriente_cc_mpp1",
    "Corriente CC MPP2": "corriente_cc_mpp2",
    "Energía": "energia",
    "Energía MPP1": "energia_mpp1",
    "Energía MPP2": "energia_mpp2",
    "Factor de potencia": "factor_potencia",
    "Potencia aparente": "potencia_aparente",
    "Potencia reactiva": "potencia_reactiva",
    "Rendimiento específico": "rendimiento_especifico",
    "Tensión CA L1": "tension_ca_l1",
    "Tensión CA L2": "tension_ca_l2",
    "Tensión CA L3": "tension_ca_l3",
    "Tensión CC MPP1": "tension_cc_mpp1",
    "Tensión CC MPP2": "tension_cc_mpp2",
    "Consumido directamente": "consumido_directamente",
    "Consumo": "consumo",
    "Energía obtenida de la red": "energia_obtenida_red",
    "Energía suministrada a la red": "energia_suministrada_red",
    "Producción fotovoltaica": "produccion_fotovoltaica",
    "Potencia aparente L1 punto de alimentación": "potencia_aparente_l1_alimentacion",
    "Potencia aparente L2 punto de alimentación": "potencia_aparente_l2_alimentacion",
    "Potencia aparente L3 punto de alimentación": "potencia_aparente_l3_alimentacion",
    "Potencia efectiva L1 punto de alimentación": "potencia_efectiva_l1_alimentacion",
    "Potencia efectiva L2 punto de alimentación": "potencia_efectiva_l2_alimentacion",
    "Potencia efectiva L3 punto de alimentación": "potencia_efectiva_l3_alimentacion",
    "Tensión CA L1 punto de alimentación": "tension_ca_l1_alimentacion",
    "Tensión CA L2 punto de alimentación": "tension_ca_l2_alimentacion",
    "Tensión CA L3 punto de alimentación": "tension_ca_l3_alimentacion",
    "Irradiación": "irradiacion",
    "Temperatura ambiente": "temperatura_ambiente",
    "Temperatura de módulo": "temperatura_modulo",
}


def cargar_configuracion():
    return mariadb.connect(
        host="localhost",
        port=3306,
        user="root",
        password="CAMBIAR_CONTRASENA",
        database="energia_utpl",
    )


def limpiar_valor(value):
    return None if pd.isna(value) else float(value)


def main():
    if not DATASET.exists():
        raise FileNotFoundError(f"No existe {DATASET}")

    df = pd.read_pickle(DATASET).rename(columns=COLUMN_MAP)
    df.index = pd.to_datetime(df.index).floor("min")
    expected = list(COLUMN_MAP.values())
    faltantes = [column for column in expected if column not in df.columns]
    if faltantes:
        raise ValueError(f"Columnas faltantes en el dataset: {faltantes}")

    columns = ["central_id", "fecha_hora"] + expected
    placeholders = ", ".join(["?"] * len(columns))
    updates = ", ".join(
        f"{column}=VALUES({column})" for column in expected
    )
    query = (
        f"INSERT INTO mediciones_energeticas ({', '.join(columns)}) "
        f"VALUES ({placeholders}) ON DUPLICATE KEY UPDATE {updates}"
    )

    connection = cargar_configuracion()
    cursor = connection.cursor()
    try:
        batch = []
        for timestamp, row in df[expected].iterrows():
            batch.append(
                [CENTRAL_ID, timestamp.to_pydatetime()]
                + [limpiar_valor(row[column]) for column in expected]
            )
            if len(batch) == BATCH_SIZE:
                cursor.executemany(query, batch)
                connection.commit()
                batch.clear()
        if batch:
            cursor.executemany(query, batch)
            connection.commit()

        resumen = (
            df.assign(fecha=df.index.date)
            .groupby("fecha")
            .agg(
                produccion_fotovoltaica_wh=("produccion_fotovoltaica", "sum"),
                consumo_wh=("consumo", "sum"),
                energia_red_wh=("energia_obtenida_red", "sum"),
                potencia_maxima=("potencia_aparente", "max"),
                irradiacion_promedio=("irradiacion", "mean"),
                temperatura_promedio=("temperatura_ambiente", "mean"),
                registros_validos=("produccion_fotovoltaica", "count"),
            )
        )
        summary_query = (
            "INSERT INTO resumen_diario (central_id, fecha, "
            "produccion_fotovoltaica_wh, consumo_wh, energia_red_wh, "
            "potencia_maxima, irradiacion_promedio, temperatura_promedio, "
            "registros_validos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) "
            "ON DUPLICATE KEY UPDATE "
            "produccion_fotovoltaica_wh=VALUES(produccion_fotovoltaica_wh), "
            "consumo_wh=VALUES(consumo_wh), energia_red_wh=VALUES(energia_red_wh), "
            "potencia_maxima=VALUES(potencia_maxima), "
            "irradiacion_promedio=VALUES(irradiacion_promedio), "
            "temperatura_promedio=VALUES(temperatura_promedio), "
            "registros_validos=VALUES(registros_validos)"
        )
        summary_rows = [
            [CENTRAL_ID, date] + [limpiar_valor(value) for value in row]
            for date, row in resumen.iterrows()
        ]
        cursor.executemany(summary_query, summary_rows)
        connection.commit()
        print(f"Mediciones procesadas: {len(df)}")
        print(f"Resúmenes diarios: {len(summary_rows)}")
    finally:
        cursor.close()
        connection.close()


if __name__ == "__main__":
    main()