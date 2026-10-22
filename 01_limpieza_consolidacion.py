"""
Script de limpieza y consolidación de datos históricos
Central Solar UTPL - Edificio Central
Tesis: Plataforma de Análisis de Datos y Visualización para la Gestión
       Energética de las Centrales Solares de la UTPL

Entradas: archivos .xlsx exportados de la plataforma de monitoreo,
con rangos de fechas parcialmente solapados y esquemas de columnas
distintos (36 a 105 columnas) porque el número de dispositivos
(inversores FRONIUS, PowerMeter, sensores ambientales) cambió con el
tiempo.

Salida: dataset_limpio.csv / dataset_limpio.pkl
Índice: Fecha y hora (grilla continua de 5 minutos, 2023-01-01 a 2025-06-30)
Columnas: 34 variables canónicas (ver diccionario de variables abajo)
"""
import pandas as pd
import numpy as np
import re
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
INPUT_DIR = BASE_DIR / "datos_historicos"


def canon_name(h: str) -> str:
    """Quita el sufijo de dispositivo, ej. 'Corriente CA L1 | PowerMeter' -> 'Corriente CA L1'."""
    return re.sub(r"\s*\|\s*.*$", "", str(h)).strip()


def cargar_y_homogeneizar(path: str) -> pd.DataFrame:
    df = pd.read_excel(path, header=0, skiprows=[1], engine="openpyxl")
    df = df.rename(columns={df.columns[0]: "Fecha y hora"})
    df["Fecha y hora"] = pd.to_datetime(
        df["Fecha y hora"], format="%d.%m.%Y %H:%M", errors="coerce"
    )
    df = df.dropna(subset=["Fecha y hora"]).set_index("Fecha y hora")
    df = df.replace(["n/a", "N/A", "NA", "nan", "NaN", ""], np.nan)
    for c in df.columns:
        df[c] = pd.to_numeric(df[c], errors="coerce")

    # Varias columnas miden la misma variable física desde distintos
    # dispositivos (inversor FRONIUS vs. PowerMeter externo). Se promedian
    # ignorando nulos -> una sola columna canónica por variable.
    canon_map = {}
    for c in df.columns:
        canon_map.setdefault(canon_name(c), []).append(c)
    out = {canon: df[cols].mean(axis=1, skipna=True) for canon, cols in canon_map.items()}
    return pd.DataFrame(out, index=df.index)


def main():
    files = sorted(INPUT_DIR.glob("*.xlsx"))
    if not files:
        raise FileNotFoundError(f"No hay archivos .xlsx en {INPUT_DIR}")

    print(f"Archivos encontrados: {len(files)}")
    frames = [cargar_y_homogeneizar(path) for path in files]
    all_df = pd.concat(frames, axis=0)

    # Los rangos de fecha se solapan entre archivos (p.ej. abril-mayo-junio
    # 2024 está contenido en marzo-julio 2024). Se consolidan los
    # timestamps duplicados promediando las fuentes disponibles, lo que
    # además rellena huecos de una fuente con datos de otra para el mismo
    # instante.
    df = all_df.groupby(all_df.index).mean(numeric_only=True).sort_index()

    # Columnas sin valor analítico: batería inexistente (siempre 0),
    # bandera digital sin documentar, variable redundante con más nulos
    # que su equivalente.
    df = df.drop(columns=[
        "Energía guardada en la batería",
        "Energía obtenida de la batería",
        "Digital 2",
        "Energía adquirida de la red",
    ], errors="ignore")

    # Anomalía de medición: "Consumo" no puede ser negativo (258 casos).
    if "Consumo" in df.columns:
        df.loc[df["Consumo"] < 0, "Consumo"] = np.nan

    # Primero exponer los huecos en la grilla real. No rellenar energía ni
    # meteorología: no son mediciones eléctricas instantáneas intercambiables.
    full_range = pd.date_range(df.index.min(), df.index.max(), freq="5min")
    df = df.reindex(full_range)
    continuous_prefixes = ("Corriente", "Tensión", "Potencia", "Factor de potencia")
    for column in df.columns:
        if not column.startswith(continuous_prefixes):
            continue
        missing = df[column].isna()
        groups = missing.ne(missing.shift()).cumsum()
        gap_length = missing.groupby(groups).transform('sum')
        short_gap = missing & gap_length.le(2)
        interpolated = df[column].interpolate(method="time", limit_area="inside")
        df.loc[short_gap, column] = interpolated.loc[short_gap]

    df.index.name = "Fecha y hora"

    df.to_csv(BASE_DIR / "dataset_limpio.csv")
    df.to_pickle(BASE_DIR / "dataset_limpio.pkl")
    print("Forma final:", df.shape)
    print((df.isna().mean() * 100).round(2).sort_values())


if __name__ == "__main__":
    main()
