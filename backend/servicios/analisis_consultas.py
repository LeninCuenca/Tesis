"""Cálculos verificables para consultas sobre lecturas energéticas."""
from collections import defaultdict
from datetime import datetime
from math import isfinite
from zoneinfo import ZoneInfo

ZONA = ZoneInfo('America/Guayaquil')


def resumir_mediciones(lecturas, variables):
    """Resume únicamente valores válidos, conservando huecos y fechas originales."""
    resumen = {}
    for codigo, unidad in variables.items():
        validos = []
        horas = defaultdict(list)
        for lectura in lecturas:
            try:
                fecha = datetime.fromisoformat(lectura['fecha'].replace('Z', '+00:00'))
                if fecha.tzinfo is None:
                    continue
                valor = lectura['valores'].get(codigo)
                if isinstance(valor, bool) or not isinstance(valor, (int, float)) or not isfinite(valor):
                    continue
                if codigo in ('consumo', 'produccion_fotovoltaica') and valor < 0:
                    continue
                validos.append((fecha, valor))
                horas[fecha.astimezone(ZONA).hour].append(valor)
            except (KeyError, ValueError, TypeError):
                continue
        if not validos:
            resumen[codigo] = {'unidad': unidad, 'muestras_validas': 0}
            continue
        maximo = max(v for _, v in validos)
        minimo = min(v for _, v in validos)
        por_hora = [
            {'hora': f'{hora:02d}:00', 'media': sum(valores) / len(valores), 'muestras': len(valores)}
            for hora, valores in sorted(horas.items())
        ]
        resumen[codigo] = {
            'unidad': unidad,
            'muestras_validas': len(validos),
            'media': sum(v for _, v in validos) / len(validos),
            'maximo': maximo,
            'horas_maximo': [f.astimezone(ZONA).isoformat() for f, v in validos if v == maximo][:20],
            'minimo': minimo,
            'perfil_horario_media': por_hora,
        }
        if codigo in ('consumo', 'produccion_fotovoltaica'):
            resumen[codigo]['energia_total_kwh'] = sum(v for _, v in validos) / 1000
    return resumen
