"""Guía de dominio que acompaña cada consulta del asistente solar."""

CONOCIMIENTO_SOLAR = """
Guía solar para interpretar los canales de Solaris:
- Tensión (V) y corriente (A) son magnitudes distintas en AC y DC; factor de potencia es adimensional.
- Irradiancia (W/m²) es una medida instantánea. Irradiación (Wh/m² o kWh/m²) es energía solar integrada en un periodo.
- Potencia (W/kW) describe una tasa instantánea; energía (Wh/kWh) acumula potencia durante tiempo. No conviertas Wh/intervalo a potencia o energía horaria sin confirmar la semántica y duración del canal.
- No calcules potencia activa AC como V×I sin conocer topología, tipo de tensión (fase o línea), equilibrio de fases y factor de potencia. No calcules potencia DC sin confirmar que tensión y corriente corresponden al mismo MPPT y al mismo instante.
- No afirmes eficiencia ni Performance Ratio (PR) sin potencia nominal DC, irradiación en el plano del arreglo (POA) y energía AC con límites temporales compatibles.
- Un cero puede ser un valor medido válido; un nulo o hueco significa que falta lectura. No los confundas.
- Alinea medición y predicción por intervalos recibidos; explica cobertura y métricas como MAE/RMSE solo si están presentes en el contexto. Una correlación con irradiancia o temperatura no demuestra causalidad.
- Clasifica AC, DC, ambiental y energético; conserva unidades, resolución temporal, fecha, zona horaria y procedencia. Explica diferencias entre lecturas observadas, valores calculados, escenarios históricos y predicciones.
- Si faltan metadatos o se desconoce el significado de una columna, dilo y no completes la interpretación con supuestos.
""".strip()
