"""Selección de evidencia para consultas sobre estadísticas calculadas por la vista."""
import math
import re
import unicodedata


def normalizar(texto):
    return ''.join(c for c in unicodedata.normalize('NFD', texto.lower()) if unicodedata.category(c) != 'Mn')


def preparar_consulta(pregunta, contexto):
    texto = normalizar(pregunta)
    variables = contexto.get('variables')
    if not isinstance(variables, list):
        return contexto, None
    terminos = [('consumo', ['consumo']), ('produccion', ['produccion', 'generacion', 'fotovoltaica']),
                ('temperatura', ['temperatura']), ('irradiancia', ['irradiancia', 'irradiacion']),
                ('tension', ['tension', 'voltaje']), ('corriente', ['corriente']), ('factor', ['factor'])]
    buscados = [palabra for _, palabras in terminos if any(p in texto for p in palabras) for palabra in palabras]
    elegidas = [v for v in variables if isinstance(v, dict) and any(p in normalizar(str(v.get('variable', ''))) for p in buscados)]
    if not elegidas:
        return contexto, None
    reducido = {k: v for k, v in contexto.items() if k != 'variables'}
    reducido['variables'] = elegidas
    # Las preguntas de máximo puntual se contestan con el máximo ya calculado,
    # sin pedir al modelo que vuelva a deducirlo a partir de cientos de cifras.
    maximo = bool(re.search(r'\b(mas|mayor|maximo|maxima|pico)\b', texto))
    puntual = maximo and len(elegidas) == 1 and not re.search(r'\b(promedio|media|horario|habitual|dia|dias|comparar|compara|por que|causa)\b', texto)
    if not puntual:
        return reducido, None
    variable = elegidas[0]
    punto = variable.get('maximo')
    if not isinstance(punto, dict):
        return reducido, f"No hay mediciones válidas de {variable.get('variable', 'esta variable')} en el periodo seleccionado."
    valor, fecha = punto.get('valor'), punto.get('fecha')
    if not isinstance(valor, (int, float)) or isinstance(valor, bool) or not math.isfinite(valor) or not isinstance(fecha, str):
        return reducido, None
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2} \d{2}:\d{2}', fecha):
        return reducido, None
    numero = f'{valor:,.2f}'.replace(',', '_').replace('.', ',').replace('_', '.')
    respuesta = (f"El máximo registrado de {variable['variable'].lower()} fue el {fecha[:10]} a las {fecha[11:]} "
                 f"(hora de Ecuador): **{numero} {variable.get('unidad', '')}**. "
                 "Es el máximo de las lecturas disponibles del periodo seleccionado; no es un promedio horario.")
    aviso = contexto.get('aviso')
    if isinstance(aviso, str):
        respuesta += f'\n\n{aviso}'
    return reducido, respuesta
