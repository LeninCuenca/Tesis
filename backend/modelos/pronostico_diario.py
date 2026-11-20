"""Pronósticos de 24 horas y evaluación con el mismo corte que utiliza la API."""
from typing import NamedTuple

import numpy as np
import pandas as pd

from backend.modelos.modelo_solar import TARGET, WEATHER, bounded_predict, features
from backend.modelos.perfil_calendario import DIAS_HISTORIA, perfil_calendario
from backend.modelos.radiacion_prevista import ajustar_radiacion, variables_radiacion

METODOS = {
    'clima_mediano': 'Modelo con mediana meteorológica de los últimos 90 días',
    'referencia': 'Media de producción por franja del conjunto de desarrollo',
    'media_reciente': 'Media de producción por franja de los últimos 30 días',
    'media_90_dias': 'Media de producción por franja de los últimos 90 días',
    'media_14_dias': 'Media de producción por franja de los últimos 14 días',
    'media_180_dias': 'Media de producción por franja de los últimos 180 días',
    'calendario': 'Perfil de producción por horario, jornada laboral y descanso',
    'radiacion_calendario': 'Producción por calendario y pronóstico regional de radiación',
}

VENTANAS = {'media_reciente': 30, 'media_14_dias': 14, 'media_180_dias': 180}


class PlanDiario(NamedTuple):
    index: pd.DatetimeIndex
    estimacion: np.ndarray
    clima: pd.DataFrame
    desde: str
    hasta: str
    metodo: str


def franjas(index):
    return index.hour * 60 + index.minute


def pronosticar_dia(artefacto, datos, inicio, metodo):
    antecedentes = datos.loc[datos.index < inicio]
    if antecedentes.empty:
        raise ValueError('No hay antecedentes anteriores al día elegido')
    index = pd.date_range(inicio, periods=288, freq='5min')
    slots = franjas(index)
    clima = pd.DataFrame(index=index)
    referencia = artefacto['baseline_profile'].reindex(slots)
    if metodo in ('calendario', 'radiacion_calendario'):
        ultimo = antecedentes.index.max()
        historia = antecedentes.loc[antecedentes.index >= ultimo.normalize() - pd.Timedelta(days=DIAS_HISTORIA - 1)]
        estimacion = perfil_calendario(historia[TARGET], inicio)
        if metodo == 'radiacion_calendario':
            x = variables_radiacion(artefacto['archivo_radiacion'], inicio, estimacion)
            if x is None:
                metodo = 'calendario'
            else:
                estimacion = np.maximum(0, estimacion + x @ artefacto['coef_radiacion'])
    else:
        # Reproduce las entradas de los métodos anteriores, incluido su filtro meteorológico.
        antecedentes = antecedentes.dropna(subset=WEATHER)
        if antecedentes.empty:
            raise ValueError('Faltan antecedentes con meteorología para el método histórico')
        ultimo = antecedentes.index.max()
        historia = antecedentes.loc[antecedentes.index >= ultimo - pd.Timedelta(days=VENTANAS.get(metodo, 90))]
        if metodo == 'clima_mediano':
            clima = historia[WEATHER[:2]].groupby(franjas(historia.index)).median().reindex(slots).set_axis(index)
            if clima.isna().any().any():
                raise ValueError('Perfil histórico incompleto para la mediana meteorológica')
            clima[WEATHER[2]] = artefacto['thermal_model'].predict(clima[WEATHER[:2]])
            estimacion = bounded_predict(artefacto['model'], features(clima))
        elif metodo == 'referencia':
            estimacion = referencia.to_numpy()
        elif metodo in METODOS:
            promedio = historia[TARGET].groupby(franjas(historia.index)).mean().reindex(slots)
            if promedio.isna().any():
                previo = antecedentes[TARGET].groupby(franjas(antecedentes.index)).mean()
                promedio = promedio.fillna(previo)
            estimacion = promedio.to_numpy()
        else:
            raise ValueError(f'Método diario desconocido: {metodo}')
    if not np.isfinite(estimacion).all():
        raise ValueError('Faltan franjas para construir el pronóstico diario')
    desde, hasta = historia.index.min().isoformat(), ultimo.isoformat()
    if metodo == 'referencia':
        partes = artefacto['report']['partitions']
        desde, hasta = partes['train']['start'], partes['validation']['end']
    return PlanDiario(index, estimacion, clima, desde, hasta, metodo)


def dias_completos(datos):
    return [(fecha, grupo[TARGET].to_numpy()) for fecha, grupo in datos.groupby(datos.index.normalize())
            if grupo.index.equals(pd.date_range(fecha, periods=288, freq='5min'))]


def entrenar_radiacion(archivo, produccion, inicio_seleccion):
    if archivo.empty:
        return None, 0
    matrices, residuos = [], []
    historia = produccion.loc[produccion.index < inicio_seleccion]
    for dia, observaciones in dias_completos(historia.loc[historia.index >= archivo.index.min()]):
        if not (historia.index < dia).any():
            continue
        try:
            perfil = perfil_calendario(historia[TARGET], dia)
        except ValueError:
            continue  # P. ej. primeros días de un archivo sin historia anterior suficiente.
        x = variables_radiacion(archivo, dia, perfil)
        if x is not None:
            matrices.append(x)
            residuos.append(observaciones - perfil)
    return ajustar_radiacion(matrices, residuos), len(matrices)


def metricas(errores):
    error_dia_kwh = errores.sum(axis=1) / 1000
    # Franja de interés fija, evaluable sin un sensor de irradiancia.
    horas_centrales = errores[:, 8 * 12:17 * 12]
    return {
        'rmse_wh': float(np.sqrt(np.mean(errores ** 2))), 'mae_wh': float(np.abs(errores).mean()),
        'rmse_08_17_wh': float(np.sqrt(np.mean(horas_centrales ** 2))),
        'mae_diario_kwh': float(np.abs(error_dia_kwh).mean()), 'sesgo_diario_kwh': float(error_dia_kwh.mean()),
    }


def banda_por_hora(errores):
    grupos = np.abs(errores).reshape(-1, 24, 12).transpose(1, 0, 2).reshape(24, -1)
    rango = min(1, np.ceil((grupos.shape[1] + 1) * .9) / grupos.shape[1])
    return np.quantile(grupos, rango, axis=1, method='higher')


def evaluar_metodos(artefacto, datos, inicio_seleccion, inicio_calibracion, inicio_prueba):
    cal = dias_completos(datos.loc[(datos.index >= inicio_calibracion) & (datos.index < inicio_prueba)])
    prueba = dias_completos(datos.loc[datos.index >= inicio_prueba])
    if len(cal) < 2 or not prueba:
        raise ValueError('Se requieren días completos de calibración y prueba')
    banda = cal[len(cal) // 2:]
    seleccion = dias_completos(datos.loc[(datos.index >= inicio_seleccion) & (datos.index < banda[0][0])])
    if not seleccion:
        raise ValueError('Faltan días completos de selección temporal')

    def residuos(metodo, dias):
        planes = [pronosticar_dia(artefacto, datos, fecha, metodo) for fecha, _ in dias]
        errores = np.stack([plan.estimacion - real for plan, (_, real) in zip(planes, dias)])
        return errores, np.array([plan.metodo != metodo for plan in planes])

    metodos = ['media_180_dias', 'calendario']
    if artefacto['coef_radiacion'] is not None:
        metodos.append('radiacion_calendario')
    candidatos = {}
    for metodo in metodos:
        errores, respaldo = residuos(metodo, seleccion)
        candidatos[metodo] = {**metricas(errores), 'dias_con_respaldo': int(respaldo.sum())}
    # Exigir mejora en energía diaria frente al método desplegado y minimizar RMSE.
    # Para añadir clima regional, exigir que mejore también el MAE diario del calendario.
    aptos = [m for m in metodos if candidatos[m]['mae_diario_kwh'] <= candidatos['media_180_dias']['mae_diario_kwh']]
    if 'radiacion_calendario' in aptos and candidatos['radiacion_calendario']['mae_diario_kwh'] >= candidatos['calendario']['mae_diario_kwh']:
        aptos.remove('radiacion_calendario')
    elegido = min(aptos, key=lambda m: candidatos[m]['rmse_wh'])
    errores_prueba, dias_respaldo = residuos(elegido, prueba)
    radios = banda_por_hora(residuos(elegido, banda)[0])
    radios_respaldo = banda_por_hora(residuos('calendario', banda)[0])
    limites = np.repeat(np.where(dias_respaldo[:, None], radios_respaldo, radios), 12, axis=1)
    anterior = residuos('media_180_dias', prueba)[0]
    calendario = residuos('calendario', prueba)[0]
    por_dia = []
    for (dia, observado), error, previo, respaldo in zip(prueba, errores_prueba, anterior, dias_respaldo):
        por_dia.append({
            'fecha': dia.date().isoformat(), 'intervalos': len(observado),
            'medido_kwh': float(observado.sum() / 1000),
            'previsto_kwh': float((observado + error).sum() / 1000),
            'metodo_anterior_kwh': float((observado + previo).sum() / 1000),
            'error_absoluto_diario_kwh': float(abs(error.sum()) / 1000),
            'error_absoluto_anterior_kwh': float(abs(previo.sum()) / 1000),
            'rmse_wh': float(np.sqrt(np.mean(error ** 2))), 'uso_respaldo': bool(respaldo),
        })
    return {
        'metodo': elegido, 'nombre': METODOS[elegido], 'seleccion': candidatos,
        'criterio': 'Menor RMSE por intervalo con control del error absoluto diario en selección cronológica.',
        'inicio_seleccion': seleccion[0][0].date().isoformat(), 'fin_seleccion': seleccion[-1][0].date().isoformat(),
        'fin_calibracion': banda[-1][0].date().isoformat(),
        'dias_seleccion': len(seleccion), 'dias_calibracion': len(banda), 'dias_prueba': len(prueba),
        'dias_con_respaldo_prueba': int(dias_respaldo.sum()), 'prueba': metricas(errores_prueba),
        'calendario_prueba': metricas(calendario), 'por_dia_prueba': por_dia,
        'cobertura_calendario_prueba': float((np.abs(calendario) <= np.repeat(radios_respaldo, 12)).mean()),
        'referencia_prueba': metricas(residuos('referencia', prueba)[0]),
        'media_180_dias_prueba': metricas(anterior),
        'dias_con_menor_error_diario': int((np.abs(errores_prueba.sum(axis=1)) < np.abs(anterior.sum(axis=1))).sum()),
        'periodo_prueba_examinado_previamente': any('2025-05-07' <= d.date().isoformat() <= '2025-06-30' for d, _ in prueba),
        'radios_horarios_wh': radios.tolist(), 'radios_respaldo_wh': radios_respaldo.tolist(),
        'cobertura_prueba': float((np.abs(errores_prueba) <= limites).mean()),
    }
