# Reentrenamiento del 30 de octubre de 2026

Estado: activado y comprobado en la API local.

## Archivos incorporados

- `2025 limpio.xlsx`
- `2025.xlsx`
- `UTPL_Edificio_Central_01012020-31122020.xlsx`

La auditoría actual contiene nueve archivos de origen. Se conservaron los originales y sus hashes SHA-256.

## Qué cambió en los datos

- Filas de entrada de las nueve fuentes: 458,749.
- Timestamps observados únicos: 326,123.
- Rejilla auditada: 578,304 filas y 103 canales. Incluye 252,181 intervalos ausentes, que no son mediciones nuevas.
- Celdas con conflicto: 13,628. Se conservan candidatos y procedencia; no se promedian ni se imputan.
- Filas válidas del modelo: 95,945, frente a 95,945 anteriormente.
- Nuevas filas válidas para el modelo: 0; filas válidas modificadas: 0.

El histórico de 2020 añade 105.408 registros eléctricos, pero no contiene las variables meteorológicas requeridas por el modelo actual. Las dos versiones nuevas de 2025 repiten observaciones de enero a junio de 2025 ya incorporadas. El último registro sigue siendo del 30 de junio de 2025. No se modificó Supabase.

## Modelo y resultados

Se compararon Ridge, HistGradientBoosting y XGBoost usando particiones cronológicas de entrenamiento, validación, calibración y prueba. La selección se hizo por RMSE de validación, sin usar la prueba final para elegir el modelo.

Seleccionado: **HistGradientBoosting**.

| Métrica de prueba | Resultado |
| --- | ---: |
| MAE | 44.07 Wh por intervalo de 5 minutos |
| RMSE | 101.01 Wh por intervalo de 5 minutos |
| R² | 0.8151 |

Las métricas son iguales a las anteriores porque las entradas válidas del modelo no cambiaron. La evaluación utiliza meteorología observada; no valida por sí sola un pronóstico meteorológico futuro. Se mantienen documentados los supuestos pendientes sobre semántica energética y convención temporal.

## Verificación y recuperación

- 46 pruebas Python correctas sobre el candidato y las rutas activas.
- Recarga del modelo con igualdad de predicciones comprobada.
- Integridad SQLite y recuperación exacta de valores y nulos comprobadas.
- API `/model`, `/predict` y `/evaluation` comprobadas con el artefacto actualizado.
- Modelo activo: `backend/artefactos/forecast_bundle.joblib`.
- Datos activos: `base_datos/datos/auditoria/audited-by-device/`.
- Auditoría y respaldos: `/home/lenin/Documentos/LENIN WINDOWS/TESIS/base_datos/datos/auditoria/revision-20261030T185954Z`.

El registro detallado de hashes, particiones y rutas está en `reentrenamiento_20261030.json`.
