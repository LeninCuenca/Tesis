# Revisión del escenario predictivo — 17 de noviembre de 2026

Se reprodujo el escenario servido por `automatic_forecast` en los 55 días completos del conjunto de prueba (7 de mayo a 30 de junio de 2025), utilizando solo antecedentes anteriores al día objetivo. No se reajustó el modelo ni se cambiaron las mediciones. Resultados numéricos por día en `revision_escenario_predictivo.json`.

| Evaluación | MAE Wh/5 min | RMSE Wh/5 min | R² |
|---|---:|---:|---:|
| Modelo con meteorología observada | 44,07 | 101,01 | 0,815 |
| Escenario servido con medianas históricas | 72,67 | 150,52 | 0,589 |

La referencia de media histórica por franja del reporte publicado tiene RMSE de 137,68 Wh en esos mismos 15.840 intervalos. El escenario servido tiene aproximadamente 9,3 % más RMSE que esa referencia. Las métricas condicionadas al clima observado no describen la precisión del escenario de 24 horas.

## Día mostrado: 30 de junio de 2025

- Energía medida del día completo: 52,01 kWh; escenario: 44,21 kWh (subestimación de 15,0 %).
- Pico medido: 12,97 kW a las 12:10; pico previsto: 6,82 kW a las 13:15.
- Con meteorología observada de ese mismo día, el modelo estima 47,34 kWh. Esto es una reconstrucción condicionada a observaciones y no una previsión disponible desde el inicio del día.

## Diagnóstico y límites

La curva servida introduce medianas históricas de irradiancia y temperatura, y estima temperatura del módulo. Esas entradas no reproducen las condiciones particulares del día. El modelo se evaluó originalmente con las tres variables meteorológicas observadas. Esta diferencia de entradas explica una parte importante de la pérdida de precisión, aunque no elimina el error propio del modelo.

El historial empaquetado está limitado a los últimos 90 días: las primeras fechas de prueba disponen de menos antecedentes. La energía por intervalo y la zona horaria de origen aún necesitan confirmación documental, y la potencia dibujada depende del supuesto Wh por cinco minutos. Por ello, los valores anteriores son válidos bajo la convención actual de la aplicación.

## Acciones recomendadas

1. Mostrar las métricas del escenario histórico separadas de la evaluación con clima observado.
2. Para pronóstico de 24 horas, incorporar previsiones meteorológicas y evaluar con pronósticos archivados emitidos antes del día objetivo.
3. Para seguimiento a 5–30 minutos, evaluar un modelo con rezagos de mediciones disponibles al emitir cada predicción, comparado con persistencia y sin información futura.
4. Confirmar unidades, temporización y características técnicas antes de interpretar potencia, eficiencia o PR.

Ollama redacta las interpretaciones; la curva se calcula con HistGradientBoosting. No se debe corregir la curva usando las mediciones futuras del mismo día.

## Ejemplo seleccionado para la interfaz

Por solicitud del usuario, la reproducción de la interfaz abre el 25 de mayo de 2025. Es el menor RMSE diario del escenario entre los 55 días examinados: 58,59 Wh/5 min. Energía prevista 32,53 kWh frente a 31,79 kWh medida (diferencia +2,31 %). Su pico previsto es 4,35 kW y el medido 7,34 kW: el ajuste diario no implica coincidencia de todos los picos. Los antecedentes terminan el 24 de mayo a las 23:55. La selección se hizo después de observar los errores de prueba, exclusivamente como ejemplo ilustrativo favorable; no es una evaluación independiente ni representa la precisión general. Se conservan los resultados de los 55 días y el modelo permanece sin reajustes.
