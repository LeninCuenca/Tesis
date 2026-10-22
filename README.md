# Solaris UTPL

Plataforma de tesis para explorar mediciones fotovoltaicas, consumo del edificio, calidad del registro y modelos predictivos. Interfaz React + TypeScript + Vite con Apache ECharts; datos históricos en Supabase y modelos locales en Python.

## Ejecutar en Linux

```bash
python -m venv .venv-linux
.venv-linux/bin/python -m pip install -r requirements.txt
.venv-linux/bin/python 04_pronostico_clima.py
.venv-linux/bin/python api_prediccion.py
```

En otra terminal:

```bash
npm ci --prefix frontend
npm run dev --prefix frontend
```

Abrir http://127.0.0.1:5176. El puerto es fijo. Vite reenvía `/api` a `127.0.0.1:8000`.

El entrenamiento requiere `dataset_limpio.pkl`, excluido de Git. Para reconstruirlo desde los Excel locales de `datos_historicos/`, ejecutar `01_limpieza_consolidacion.py`. Este paso modifica el dataset: verificar la consolidación de dispositivos y las unidades originales antes de usar sus resultados en la tesis. La nueva limpieza no interpola energía ni meteorología; solo rellena huecos interiores completos de hasta dos pasos en variables eléctricas continuas.

Copiar `frontend/.env.example` a `frontend/.env.local` y configurar las claves públicas de Supabase si se instala en otro equipo. Nunca poner claves secretas en variables `VITE_`. La vista predictiva funciona independientemente de Supabase, siempre que existan el dataset local y el modelo generado. En Windows puede usarse un entorno nuevo y su ejecutable `Scripts/python.exe`; el entorno `.venv/` legado del proyecto fue creado en Windows y no funciona como entorno Linux.

## Qué calcula cada vista

- **Resumen y rendimiento:** energía diaria en kWh; generación/consumo sin confundirla con autoconsumo; exportación de mediciones y resumen.
- **Variables:** lecturas AC, DC y ambientales con sus unidades; irradiancia diaria separada de temperatura.
- **Calidad:** registros válidos sobre días solicitados × 288. Los días ausentes permanecen en el denominador; nulo y cero tienen significados diferentes.
- **Predicción IA:** escenario histórico de 24 horas con 288 intervalos, potencia media derivada de energía, comparación medido/predicho sobre prueba reservada, métricas, bandas históricas y CSV.

## Modelo reproducible

`04_pronostico_clima.py` compara Ridge, HistGradientBoosting y XGBoost con días completos ordenados. Las particiones son aproximadamente 60% entrenamiento, 15% validación, 10% calibración y 15% prueba, por número de días disponibles. Se selecciona por RMSE de validación, se ajusta de nuevo con entrenamiento + validación y se calibra el error en una partición posterior independiente. La prueba final no selecciona modelos ni hiperparámetros. No se ajusta nuevamente sobre toda la historia después de publicar las métricas.

Artefactos:

- `artifacts/forecast_bundle.joblib`: modelo servido, estimador térmico y reporte. Se genera localmente, excluido de Git.
- `artifacts/model_report.json`: fechas, métricas, limitaciones, versiones y comparación sobre el último día de prueba.
- `comparacion_modelos_pronostico.csv`: puntuaciones de validación, no de prueba.
- `artifacts/model_xgboost.ubj`: se genera únicamente cuando XGBoost es el seleccionado.

`modelo_pronostico_final.joblib` y `metadata_modelo_pronostico.json` pertenecen al experimento anterior. Se conservan como referencia; **la API nueva no los utiliza**. No comparar directamente sus métricas 80/20 con las nuevas: difieren las particiones y el protocolo de selección.

El paquete XGBoost CPU evita descargar componentes GPU innecesarios. Las versiones usadas en el experimento están en el reporte; `requirements.lock.txt` registra el entorno de esta ejecución (Python 3.14, Linux).

## Contrato y límites científicos

La producción histórica se interpreta como Wh por intervalo de cinco minutos según el metadata previo. La potencia mostrada es **media**, calculada como `P_kW = E_Wh × 12 / 1000`. La energía diaria es la suma de los 288 intervalos dividida por 1000. El nombre legado `Irradiación` se conserva en el dataset, pero su unidad W/m² corresponde a **irradiancia**.

El escenario automático usa la mediana meteorológica por franja de cinco minutos de los últimos 90 días disponibles. No utiliza una API meteorológica en vivo. Cambiar su fecha modifica el calendario, no aporta clima de esa fecha. La temperatura de módulo se estima con un modelo ajustado solo sobre entrenamiento + validación; la evaluación del modelo de producción utiliza temperatura medida. Por eso sus errores no representan por sí solos el desempeño operativo de un pronóstico climático completo.

La banda por intervalo usa un cuantil absoluto de residuos de calibración con cobertura nominal 90%. Dependencia temporal y cambios de distribución impiden garantizar esa cobertura en el futuro. Se publica la cobertura empírica de prueba. No sumar los extremos como si fueran un intervalo de confianza de energía diaria.

La API permite estimar temperatura con `pvlib.temperature.faiman` solo cuando se suministran explícitamente irradiancia POA y viento. Usa coeficientes genéricos u0=25 y u1=6.84, identificados como supuestos. No se confunde GHI con POA ni se calculan PR/eficiencia sin datos técnicos.

Los timestamps locales del dataset se interpretan como `America/Guayaquil`. La carga SQL anterior etiquetó fechas ingenuas como UTC y los resúmenes existentes pueden conservar esa convención. La plataforma no desplaza automáticamente esos registros: auditar los archivos originales antes de migrar la base. El dataset limpio legado también puede contener interpolación de energía sin banderas de procedencia; la nueva limpieza evita agregarla, pero entrenar sobre el archivo existente no elimina ese antecedente.

## API local

- `GET /health`: estado del artefacto.
- `GET /model`: reporte completo de evaluación.
- `POST /predict/auto`: `{}` o `{"date":"2025-07-01"}` para escenario.
- `POST /predict`: `timestamp`, `irradiacion` (W/m²), `temperatura_ambiente` (°C), opcional `temperatura_modulo` (°C). Sin temperatura de módulo se usa el estimador histórico. Para Faiman suministrar además `poa_wm2` y `wind_speed_ms`.

Rechaza valores no finitos o fuera de rangos de plausibilidad. No reemplaza entradas ausentes por cero. Escucha únicamente en loopback. Para producción, desplegar detrás de un servidor con autenticación, TLS y límites de acceso; configurar `VITE_PREDICTION_API_URL` y los orígenes permitidos con `FRONTEND_ORIGINS`.

## Verificar

```bash
.venv-linux/bin/python -m unittest discover -s tests -v
npm test --prefix frontend
npm run lint --prefix frontend
npm run build --prefix frontend
```

Las pruebas de integración Python necesitan el modelo generado. Comprueban unidades, zona horaria, separación temporal, validación de entradas, suma de intervalos, temperatura pvlib y contrato HTTP. Las pruebas del frontend verifican cobertura, huecos, nulos, ceros y procedencia de promedios.
