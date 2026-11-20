# Solaris UTPL

Plataforma de tesis para explorar mediciones fotovoltaicas, consumo del edificio, calidad del registro y modelos predictivos. Interfaz React + TypeScript + Vite con Apache ECharts; datos históricos en Supabase y modelos locales en Python.

## Organización en tres partes y MVC

El código está dividido en `base_datos/`, `backend/` y `frontend/`, con carpetas y archivos propios en español. Los modelos y controladores Python están en el backend; las vistas, los contratos TypeScript y los controladores React están en `frontend/codigo/`.

Consultar [ESTRUCTURA.md](ESTRUCTURA.md) para el árbol de carpetas, el flujo MVC y las equivalencias de archivos anteriores. Los datos originales y los artefactos conservan su contenido; los documentos académicos permanecen en su ubicación actual.

Desde la raíz, ejecutar `npm run dev` para iniciar juntos el backend y el frontend en una sola terminal. `npm run pruebas:backend`, `npm test`, `npm run lint` y `npm run build` ejecutan las verificaciones.

## Evaluación de objetivos y repositorio auditado

Ejecutar `.venv-linux/bin/python -m backend.procesos.evaluar_objetivos` para guardar todos los canales auditados en `base_datos/datos/auditoria/audited-by-device/history.sqlite` y generar `backend/artefactos/objectives_report.json` y `backend/artefactos/daily_test_evaluation.csv`. El repositorio conserva fechas de origen, unidades en los nombres de canal, identificador de central, manifiesto de archivos y faltantes como SQL NULL. Se comprueba integridad y recarga exacta de todos los valores antes de publicarlo mediante reemplazo atómico. Esta operación local no modifica Supabase.

La evaluación diaria reutiliza el conjunto de prueba y el modelo final sin reajustar ni elegir hiperparámetros. Exige la rejilla exacta de cinco minutos para cada día, compara contra la media por franja y la persistencia y conserva los días incompletos excluidos del cálculo. Los resultados mantienen el supuesto legado de energía de intervalo y meteorología observada. `GET /evaluation` entrega estos resultados y rechaza un reporte que corresponda a otro dataset o artefacto. La vista Rendimiento muestra las curvas y permite exportar la evaluación.

`backend/modelos/rendimiento_fotovoltaico.py` implementa rendimiento específico, PR y eficiencia solar a AC con requisitos separados. `backend/configuracion/sistema_fotovoltaico.json` contiene únicamente parámetros confirmados; actualmente sus campos técnicos están pendientes porque los archivos Excel no incluyen ficha de módulos, área ni confirmación de POA y semántica energética. El módulo devuelve resultados nulos y requisitos explícitos cuando falta información; no usa la potencia del inversor como STC DC. No debe declararse cumplida la evaluación física completa ni la validación de otras centrales hasta disponer de esa evidencia. Las pruebas usan parámetros sintéticos solo para verificar las fórmulas, nunca como características de la UTPL.


## Ejecutar en Linux

La primera vez, prepara el entorno y las dependencias:

```bash
python -m venv .venv-linux
.venv-linux/bin/python -m pip install -r backend/requirements.txt
npm ci --prefix frontend
```

Desde la raíz o desde la carpeta `frontend`, inicia ambos servicios con un solo comando:

```bash
npm run dev
```

Abre http://127.0.0.1:5176. Mantén la terminal abierta; Ctrl+C detiene la interfaz y la API. Los puertos 5176 y 8000 deben estar libres. La API necesita el modelo predictivo entrenado; si falta, genera los artefactos con `npm run entrenar`.

El entrenamiento usa `base_datos/datos/auditoria/audited-by-device/cleaned.pkl`, generado por `backend/procesos/limpiar_consolidar.py`, y su auditoría. El pronóstico diario aprovecha la producción aunque falten sensores meteorológicos. El diagnóstico con clima observado requiere además los tres canales de Sensor Card / Box (1). Ambos excluyen los días identificados con cadencia de diez minutos. La limpieza por sí sola no reentrena ni actualiza Supabase. Para reentrenar, ejecutar `npm run entrenar`. El dataset legado se conserva sin cambios.

Copiar `frontend/.env.example` a `frontend/.env.local` y configurar las claves públicas de Supabase si se instala en otro equipo. Nunca poner claves secretas en variables `VITE_`. La vista predictiva funciona independientemente de Supabase, siempre que existan el dataset local y el modelo generado. El iniciador conjunto usa específicamente `.venv-linux/bin/python`; para Windows requiere adaptación y un entorno Python creado allí. El entorno `.venv/` legado del proyecto fue creado en Windows y no funciona como entorno Linux.

## Qué calcula cada vista

- **Resumen y rendimiento:** energía diaria en kWh; generación/consumo sin confundirla con autoconsumo; exportación de mediciones y resumen.
- **Variables:** lecturas AC, DC y ambientales con sus unidades; irradiancia diaria separada de temperatura.
- **Calidad:** registros válidos sobre días solicitados × 288. Los días ausentes permanecen en el denominador; nulo y cero tienen significados diferentes.
- **Asistente IA:** consultas solares y explicaciones de escenarios con Ollama local por defecto; los datos resumidos respetan la central y el periodo elegidos. Groq y OpenRouter quedan como alternativas remotas.
- **Predicción IA:** escenario histórico de 24 horas con 288 intervalos, potencia media derivada de energía, comparación medido/predicho sobre prueba reservada, métricas, bandas históricas y CSV.

## Modelo reproducible

`backend/procesos/entrenar_pronostico.py` compara Ridge, HistGradientBoosting y XGBoost con días completos ordenados. Las particiones son aproximadamente 60% entrenamiento, 15% validación, 10% calibración y 15% prueba, por número de días disponibles. Se selecciona por RMSE de validación, se ajusta de nuevo con entrenamiento + validación y se calibra el error en una partición posterior independiente. La prueba final no selecciona modelos ni hiperparámetros. No se ajusta nuevamente sobre toda la historia después de publicar las métricas.

Artefactos:

- `backend/artefactos/forecast_bundle.joblib`: modelo servido, perfiles horarios, coeficientes meteorológicos, archivo de radiación y antecedentes de producción para reproducir los días de prueba. Se verifica la recarga antes de reemplazar el artefacto servido; la API recarga el bundle cuando cambia.
- `backend/artefactos/model_report.json`: fechas, métricas, limitaciones, versiones, número final de entrenamiento, hash del dataset, manifiesto de los archivos Excel incorporados y comparación sobre el último día de prueba.
- `backend/artefactos/comparacion_pronostico_diario.csv` contiene la energía prevista, la medida y la del método anterior para cada día de prueba.
- `backend/artefactos/comparacion_modelos_pronostico.csv`: puntuaciones de validación, no de prueba.
- `backend/artefactos/model_xgboost.ubj`: se genera únicamente cuando XGBoost es el seleccionado.

`backend/artefactos/legados/modelo_pronostico_final.joblib` y `backend/artefactos/legados/metadata_modelo_pronostico.json` pertenecen al experimento anterior. Se conservan como referencia; **la API nueva no los utiliza**. No comparar directamente sus métricas 80/20 con las nuevas: difieren las particiones y el protocolo de selección.

El paquete XGBoost CPU evita descargar componentes GPU innecesarios. Las versiones usadas en el experimento están en el reporte; `backend/requirements.lock.txt` registra el entorno de esta ejecución (Python 3.14, Linux).

## Contrato y límites científicos

La producción histórica se interpreta como Wh por intervalo de cinco minutos según el metadata previo. La potencia mostrada es **media**, calculada como `P_kW = E_Wh × 12 / 1000`. La energía diaria es la suma de los 288 intervalos dividida por 1000. El nombre legado `Irradiación` se conserva en el dataset, pero su unidad W/m² corresponde a **irradiancia**.

El pronóstico de 24 horas se calcula con la información disponible al inicio del día local. El entrenamiento compara el perfil anterior de 180 días, un perfil por jornada laboral o descanso y una corrección por radiación prevista. Los feriados nacionales se incluyen en los años documentados del histórico. El informe publica el método elegido, las fechas de selección y el error por intervalo y por día. La API rechaza fechas anteriores al cierre de la calibración.

La radiación horaria procede de GFS, ICON y ECMWF para la celda del campus de Loja (coordenadas aproximadas −3,986 y −79,198). Se usan previsiones archivadas con plazos de 24 y 48 horas y un margen mínimo de nueve horas antes del inicio del día. Se alinean las medias horarias, se interpolan las anomalías a cinco minutos y se ajusta su efecto sobre el perfil de producción usando solo días anteriores a la selección. Cuando faltan horas previstas se sirve el perfil de calendario con su propia banda. La aplicación indica el método efectivo. [Archivo de previsiones Open-Meteo](https://open-meteo.com/en/docs/previous-runs-api) · [Licencia CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

El archivo local permite reproducir los resultados sin conexión. Para incorporar fechas nuevas se puede ampliar con `.venv-linux/bin/python -m backend.procesos.descargar_radiacion AAAA-MM-DD AAAA-MM-DD`. Conviene incluir el día siguiente al último que se quiere pronosticar para disponer de su última media horaria. Al reentrenar con `npm run entrenar`, el archivo y su hash quedan asociados al modelo. El comando `npm run evaluar -- --skip-store` regenera la evaluación del diagnóstico cuando la base auditada sigue siendo la misma.

La banda del pronóstico diario usa un cuantil absoluto de los errores por hora local calculado en fechas posteriores a la selección, con cobertura nominal del 90 %. Dependencia temporal y cambios de distribución impiden garantizar esa cobertura en el futuro. Se publica la cobertura empírica de prueba. No sumar los extremos como si fueran un intervalo de confianza de energía diaria.

La API permite estimar temperatura con `pvlib.temperature.faiman` solo cuando se suministran explícitamente irradiancia POA y viento. Usa coeficientes genéricos u0=25 y u1=6.84, identificados como supuestos. No se confunde GHI con POA ni se calculan PR/eficiencia sin datos técnicos.

Los timestamps locales del dataset se interpretan como `America/Guayaquil`. La carga SQL anterior etiquetó fechas ingenuas como UTC y los resúmenes existentes pueden conservar esa convención. La plataforma no desplaza automáticamente esos registros: auditar los archivos originales antes de migrar la base. El reentrenamiento usa la limpieza auditada sin imputación. La hora registrada se mantiene y se etiqueta con la convención de la aplicación sin desplazar valores; la zona de origen, el significado de producción (contador o intervalo) y el inicio/fin del intervalo siguen pendientes de confirmación del fabricante. Estas limitaciones se publican en el reporte del modelo.

## API local

- `GET /health`: estado del artefacto.
- `GET /model`: reporte completo de evaluación.
- `GET /evaluation`: evaluación diaria y física del histórico auditado.
- `POST /predict/auto`: `{}` o `{"date":"2025-07-01"}` para escenario.
- `POST /predict/replay`: reproducción explícita de un día completo de prueba, construido con antecedentes anteriores.
- `POST /asistente`: pregunta y contexto de la vista al modelo configurado. Ollama local es el predeterminado; Groq y OpenRouter son opciones remotas.
- `GET /asistente/estado`: proveedor y modelo configurados, sin exponer credenciales.
- `POST /predict`: `timestamp`, `irradiacion` (W/m²), `temperatura_ambiente` (°C), opcional `temperatura_modulo` (°C). Sin temperatura de módulo se usa el estimador histórico. Para Faiman suministrar además `poa_wm2` y `wind_speed_ms`.

Rechaza valores no finitos o fuera de rangos de plausibilidad. No reemplaza entradas ausentes por cero. Escucha únicamente en loopback. Para producción, desplegar detrás de un servidor con autenticación, TLS y límites de acceso; configurar `VITE_PREDICTION_API_URL` y los orígenes permitidos con `FRONTEND_ORIGINS`.

## Verificar

```bash
.venv-linux/bin/python -m unittest discover -s backend/pruebas -p "prueba_*.py" -v
npm test --prefix frontend
npm run lint --prefix frontend
npm run build --prefix frontend
```

Las pruebas de integración Python necesitan el modelo generado. Comprueban unidades, zona horaria, separación temporal, validación de entradas, suma de intervalos, temperatura pvlib y contrato HTTP. Las pruebas del frontend verifican cobertura, huecos, nulos, ceros y procedencia de promedios.

## Limpieza auditable de datos

```bash
.venv-linux/bin/python -m backend.procesos.limpiar_consolidar
# También acepta archivos CSV, XLSX o XLSM individuales:
.venv-linux/bin/python -m backend.procesos.limpiar_consolidar --input base_datos/datos/historicos --output base_datos/datos/auditoria/mi-ejecucion
# Si no se necesitan los gráficos:
.venv-linux/bin/python -m backend.procesos.limpiar_consolidar --input archivo.csv --no-plots
```

La salida debe ser un directorio nuevo, separado de los originales. La ejecución guarda primero diagnóstico y plan; luego consolida canales por canal (variable, dispositivo, unidad normalizada) y timestamp. Los equipos se mantienen separados incluso si sus valores coinciden. Cuando hay valores incompatibles, deja ausente la celda canónica y guarda todos los candidatos en `conflicts.csv`, con archivo, hash y fila. **Nunca promedia dispositivos distintos ni versiones discordantes de una medición**. Las señales de batería, constantes y digitales se conservan; `Digital 2` con unidades distintas permanece separado.

El motor está en `backend/servicios/limpieza_fotovoltaica.py` y la política en `backend/configuracion/limpieza.json`. Los valores por defecto corresponden al formato observado en los Excel del proyecto: frecuencia nominal de cinco minutos, fechas `dd.MM.yyyy HH:mm` o ISO 8601, zona horaria sin confirmar e imputación desactivada. Los campos `timezone` y `timestamp_position` se dejan pendientes en lugar de suponerlos. No se desplazan registros ni se inventan ubicación, capacidad o límites instrumentales.

Los límites de factor de potencia se aplican solo a su unidad adimensional verificada; irradiancia y consumo negativos se conservan y marcan para revisión. Las reglas estadísticas de temperatura usan únicamente la historia previa, generan sospechas para revisión manual y no corrigen valores. No se etiqueta la variabilidad de irradiancia por nubes como picos por defecto. Para CSV, el lector considera BOM, UTF-8/latin-1, separador, comillas y decimal; los formatos ambiguos requieren configuración explícita. `9999` y `-9999` no son sentinelas universales: se declaran por variable en `numeric_sentinels`.

Archivos de cada ejecución:

- `cleaned.csv` / `cleaned.pkl`: valores observados consolidados y huecos preservados; sin imputación.
- `quality_flags.csv`: máscara de bits por timestamp y variable; códigos en `quality_flag_definitions.json`.
- `data_dictionary.csv`: nombres originales, equipos, unidades, factores de conversión, semántica pendiente y conteos por canal/archivo.
- `change_log.csv`: cambios con motivo, valor previo/posterior y referencia de origen.
- `ingestion_flags.csv`, `rejected_rows.csv`, `conflicts.csv`: incidencias, filas rechazadas completas y candidatos en conflicto.
- `source_manifest.json`, `config_used.json`, `diagnostic.json`, `cleaning_plan.md`: fuentes SHA-256, configuración exacta y diagnóstico previo.
- `quality_summary.csv`, `statistics_before_after.csv`, `missing_by_month.csv`, `missing_by_hour.csv`, `gaps.csv`: métricas reproducibles.
- `comparison.png` y `cleaning_report.md`: comparación visual y explicación de decisiones y límites.

Las ausencias declaradas (`n/a`, vacíos, etc.) se interpretan como ausencia, no como mediciones alteradas: sus conteos quedan en el diccionario y los huecos finales en las banderas. No se produce `model_ready.csv` automáticamente: primero hay que definir exclusiones, significado de la energía y particiones temporales.

La imputación opcional requiere `imputation.enabled=true` y una lista explícita de magnitudes eléctricas instantáneas. Solo rellena huecos interiores completos de hasta `max_steps`, con extremos válidos y sin atravesar conflictos ni anomalías. Escribe exclusivamente `visualization_imputed.csv` y sus banderas; conserva `cleaned.csv` observado. No se permite interpolar energía ni meteorología, ni usar la interpolación no causal para evaluar predicción.

Para decodificar banderas:

```python
flags = pd.read_csv("quality_flags.csv", index_col=0)
conflictos = (flags["Producción fotovoltaica"] & 512) != 0
faltantes = (flags["Producción fotovoltaica"] & 1) != 0
```

Las salidas incompletas quedan identificadas con `failure.json` y conservan la auditoría parcial. No se reutilizan ni sobrescriben directorios existentes.

## Reentrenamiento del 30 de octubre de 2026

Se incorporaron los tres archivos nuevos de `base_datos/datos/historicos/`: `2025.xlsx`, `2025 limpio.xlsx` y `UTPL_Edificio_Central_01012020-31122020.xlsx`. La nueva limpieza auditó nueve fuentes, con 458.749 filas de entrada y 326.123 timestamps observados únicos. La rejilla de 578.304 filas también contiene intervalos ausentes; estos no son mediciones nuevas. Los originales no se modificaron, los solapamientos se consolidaron por canal y dispositivo y los 13.628 conflictos se conservaron para revisión, sin imputación.

Las filas utilizables para el modelo permanecen en **95.945**, idénticas a la ejecución anterior: 2020 aporta histórico eléctrico sin las variables meteorológicas requeridas y las dos versiones de 2025 repiten el periodo enero–junio ya incorporado. Se reentrenaron los tres candidatos con las mismas particiones temporales. HistGradientBoosting volvió a ser seleccionado: MAE de prueba 44,07 Wh, RMSE 101,01 Wh y R² 0,8151. Estas métricas son iguales a las anteriores; la incorporación no añade evidencia de mayor precisión.

La evaluación diaria se regeneró y se comprobó la integridad del repositorio SQLite y la recarga del modelo. El resumen de la operación, las rutas de auditoría y los respaldos están en [reentrenamiento_20261030.json](backend/artefactos/reentrenamiento_20261030.json). El modelo activo conserva su ruta habitual. No se modificó Supabase ni se atribuyeron los archivos a otras centrales.
