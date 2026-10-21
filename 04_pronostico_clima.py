"""Entrena y compara modelos para pronosticar la producción fotovoltaica.

Las diez variables son conocidas antes del instante pronosticado: tres
variables meteorológicas, cuatro variables cíclicas de calendario y tres
variables de calendario adicionales. No se usan magnitudes eléctricas
medidas después de la producción, para evitar fuga de información.
"""
from pathlib import Path

import pandas as pd
import numpy as np
import joblib
import json
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.metrics import r2_score, mean_squared_error, mean_absolute_error

BASE_DIR = Path(__file__).resolve().parent
DATASET = BASE_DIR / "dataset_limpio.pkl"
OUTPUT_CSV = BASE_DIR / "comparacion_modelos_pronostico.csv"
OUTPUT_MODEL = BASE_DIR / "modelo_pronostico_final.joblib"
OUTPUT_METADATA = BASE_DIR / "metadata_modelo_pronostico.json"

if not DATASET.exists():
        raise FileNotFoundError(
                f"No existe {DATASET.name}. Ejecuta primero 01_limpieza_consolidacion.py "
                "con los archivos Excel de origen."
        )

df = pd.read_pickle(DATASET)
TARGET = "Producción fotovoltaica"

CLIMA = ["Irradiación", "Temperatura ambiente", "Temperatura de módulo"]

faltantes = [col for col in [TARGET] + CLIMA if col not in df.columns]
if faltantes:
        raise ValueError(f"Columnas requeridas ausentes en el dataset: {faltantes}")

data = df[[TARGET] + CLIMA].copy()
data["hora"] = data.index.hour
data["mes"] = data.index.month
data["dia_anio"] = data.index.dayofyear
data["fin_de_semana"] = (data.index.dayofweek >= 5).astype(int)
data["hora_sin"] = np.sin(2 * np.pi * data["hora"] / 24)
data["hora_cos"] = np.cos(2 * np.pi * data["hora"] / 24)
data["dia_anio_sin"] = np.sin(2 * np.pi * data["dia_anio"] / 365.25)
data["dia_anio_cos"] = np.cos(2 * np.pi * data["dia_anio"] / 365.25)

# Diez entradas: clima (3), componentes cíclicas (4) y calendario (3).
feature_cols = CLIMA + [
        "hora_sin", "hora_cos", "dia_anio_sin", "dia_anio_cos",
        "mes", "hora", "fin_de_semana",
]

data_full = data.dropna(subset=[TARGET] + feature_cols)
print("Filas disponibles:", len(data_full), flush=True)
print("Rango:", data_full.index.min(), "->", data_full.index.max(), flush=True)

n = len(data_full)
cut = int(n * 0.8)
train, test = data_full.iloc[:cut], data_full.iloc[cut:]
print(f"Train: {len(train)}  Test: {len(test)}", flush=True)

X_train, y_train = train[feature_cols], train[TARGET]
X_test, y_test = test[feature_cols], test[TARGET]

modelos = {
    "Regresión Lineal": make_pipeline(StandardScaler(), LinearRegression()),
    "Random Forest Regressor": RandomForestRegressor(n_estimators=150, max_depth=12, random_state=42, n_jobs=-1),
    "Gradient Boosting": GradientBoostingRegressor(n_estimators=150, max_depth=4, learning_rate=0.1, random_state=42),
}

resultados = []
for nombre, modelo in modelos.items():
    modelo.fit(X_train, y_train)
    pred = modelo.predict(X_test)
    r2 = r2_score(y_test, pred)
    rmse = mean_squared_error(y_test, pred) ** 0.5
    mae = mean_absolute_error(y_test, pred)
    resultados.append({"modelo": nombre, "R2_test": round(r2, 4), "RMSE_test": round(rmse, 2), "MAE_test": round(mae, 2)})
    print(nombre, resultados[-1], flush=True)

res_df = pd.DataFrame(resultados).sort_values(
    ["RMSE_test", "MAE_test", "R2_test"], ascending=[True, True, False]
)
res_df.to_csv(OUTPUT_CSV, index=False)
print(res_df.to_string(index=False))

ganador_nombre = res_df.iloc[0]["modelo"]
ganador = modelos[ganador_nombre]
X_full, y_full = data_full[feature_cols], data_full[TARGET]
ganador.fit(X_full, y_full)
joblib.dump(ganador, OUTPUT_MODEL)

metadata = {
    "modelo": ganador_nombre,
    "tipo": "Pronóstico (10 variables: clima futuro + calendario, sin sensores eléctricos)",
    "target": TARGET,
    "unidad_target": "Wh (por intervalo de 5 min)",
    "columnas_entrada_en_orden": feature_cols,
    "descripcion_columnas": {
        "Irradiación": "W/m2, debe venir de pronóstico meteorológico (API clima)",
        "Temperatura ambiente": "°C, pronóstico meteorológico",
        "Temperatura de módulo": "°C, puede estimarse desde temp. ambiente + irradiación si no hay pronóstico directo",
        "hora": "0-23", "mes": "1-12", "dia_anio": "1-366", "fin_de_semana": "0/1",
        "hora_sin": "seno de la hora", "hora_cos": "coseno de la hora",
        "dia_anio_sin": "seno del día del año", "dia_anio_cos": "coseno del día del año"
    },
    "filas_entrenamiento_final": len(data_full),
    "rango_fechas_entrenamiento": [str(data_full.index.min()), str(data_full.index.max())],
    "metricas_validacion_80_20": res_df.to_dict(orient="records"),
}
with open(OUTPUT_METADATA, "w", encoding="utf-8") as f:
    json.dump(metadata, f, ensure_ascii=False, indent=2)
print("\nGanador:", ganador_nombre)
