"""Comparación temporal, calibración separada y prueba final sin selección sobre test."""
import hashlib
import json
import platform
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
import sklearn
import xgboost
from sklearn.base import clone
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBRegressor

from backend.configuracion.rutas import ARTEFACTOS
from backend.modelos.modelo_solar import (BUNDLE_PATH, FEATURES, INTERVAL_MINUTES, REPORT_PATH,
                         TARGET, TIMEZONE, bounded_predict, features, interval_bounds, load_training_data)


from backend.modelos.pronostico_diario import evaluar_metodos, entrenar_radiacion, pronosticar_dia
from backend.modelos.radiacion_prevista import ARCHIVO, FUENTE, URL_DOCUMENTACION, cargar_archivo


def metrics(actual, predicted):
    actual, predicted = np.asarray(actual), np.asarray(predicted)
    return {'mae_wh': float(mean_absolute_error(actual, predicted)),
            'rmse_wh': float(mean_squared_error(actual, predicted) ** .5),
            'r2': float(r2_score(actual, predicted)),
            'bias_wh': float(np.mean(predicted - actual))}


def seasonal_profile(data):
    return data.groupby(data.index.hour * 60 + data.index.minute)[TARGET].mean()


def baseline(data, profile):
    slots = data.index.hour * 60 + data.index.minute
    return np.array([profile.get(slot, np.nan) for slot in slots])


def main():
    data, quality, produccion, calidad_produccion = load_training_data()
    days = pd.DatetimeIndex(quality.pop('partition_anchor_days')).tz_localize(TIMEZONE)
    if len(days) < 40:
        raise ValueError('Se requieren al menos 40 días para separar entrenamiento, validación, calibración y prueba')
    cuts = [days[int(len(days) * fraction)] for fraction in (.60, .75, .85)]
    train = data.loc[data.index < cuts[0]]
    validation = data.loc[(data.index >= cuts[0]) & (data.index < cuts[1])]
    calibration = data.loc[(data.index >= cuts[1]) & (data.index < cuts[2])]
    test = data.loc[data.index >= cuts[2]]
    partitions = dict(train=train, validation=validation, calibration=calibration, test=test)
    for name, part in partitions.items():
        if len(part) < 100:
            raise ValueError(f'Partición {name} insuficiente: {len(part)} filas')
    x_train, x_val = features(train), features(validation)
    candidates = {
        'Ridge': make_pipeline(StandardScaler(), Ridge(alpha=10)),
        'HistGradientBoosting': HistGradientBoostingRegressor(max_iter=200, max_leaf_nodes=15,
            l2_regularization=10, learning_rate=.05, early_stopping=False, random_state=42),
        'XGBoost': XGBRegressor(n_estimators=600, max_depth=4, learning_rate=.03,
            min_child_weight=20, subsample=.8, colsample_bytree=.9, reg_lambda=10,
            tree_method='hist', n_jobs=4, random_state=42, early_stopping_rounds=40),
    }
    validation_scores = []
    for name, model in candidates.items():
        if name == 'XGBoost':
            model.fit(x_train, train[TARGET], eval_set=[(x_val, validation[TARGET])], verbose=False)
        else:
            model.fit(x_train, train[TARGET])
        score = {'model': name, **metrics(validation[TARGET], bounded_predict(model, x_val))}
        validation_scores.append(score)
        print('Validación:', score, flush=True)
    validation_scores.sort(key=lambda item: item['rmse_wh'])
    winner = validation_scores[0]['model']
    selected = clone(candidates[winner])
    if winner == 'XGBoost':
        selected.set_params(n_estimators=candidates[winner].best_iteration + 1, early_stopping_rounds=None)
    development = pd.concat([train, validation])
    selected.fit(features(development), development[TARGET])
    cal_pred = bounded_predict(selected, features(calibration))
    errors = np.abs(calibration[TARGET].to_numpy() - cal_pred)
    # Cuantil conformal finito. La dependencia temporal impide prometer cobertura universal.
    rank = min(1, np.ceil((len(errors) + 1) * .9) / len(errors))
    radius = float(np.quantile(errors, rank, method='higher'))
    prediction = bounded_predict(selected, features(test))
    lower, upper = interval_bounds(prediction, radius)
    test_metrics = metrics(test[TARGET], prediction)
    daylight = test['Irradiación'] > 20
    daylight_metrics = metrics(test.loc[daylight, TARGET], prediction[daylight]) if daylight.any() else None
    profile = seasonal_profile(development)
    base_pred = baseline(test, profile)
    if not np.isfinite(base_pred).all():
        raise ValueError('Baseline incompleto: faltan franjas horarias en entrenamiento')
    baseline_metrics = metrics(test[TARGET], base_pred)
    # Predicción genuina a un día: misma franja del día anterior, solo donde existe.
    persistence = data[TARGET].reindex(test.index - pd.Timedelta(days=1)).to_numpy()
    matched = np.isfinite(persistence)
    persistence_metrics = metrics(test[TARGET].to_numpy()[matched], persistence[matched]) if matched.any() else None
    last_day = test.index.normalize().max()
    recent = test.loc[test.index.normalize() == last_day]
    recent_pred = bounded_predict(selected, features(recent))
    backtest = [{'timestamp': timestamp.isoformat(), 'actual_wh': float(row[TARGET]),
                 'predicted_wh': float(value)} for (timestamp, row), value in zip(recent.iterrows(), recent_pred)]
    # El estimador térmico nunca observa calibración ni test.
    thermal = Ridge(alpha=1).fit(development[['Irradiación', 'Temperatura ambiente']],
                                 development['Temperatura de módulo'])
    report = {
        'schema_version': 3, 'model': winner, 'created_at': datetime.now(timezone.utc).isoformat(),
        'target': TARGET, 'target_unit': 'Wh / 5 min', 'interval_minutes': INTERVAL_MINUTES,
        'timezone': TIMEZONE, 'features': FEATURES,
        'validation': validation_scores, 'test': test_metrics, 'daylight_test': daylight_metrics,
        'baseline': {'model': 'Media histórica por franja de 5 min', **baseline_metrics},
        'persistence': {'model': 'Misma franja del día anterior', 'matched_rows': int(matched.sum()),
                        'selected_model_on_matched': metrics(test[TARGET].to_numpy()[matched], prediction[matched]) if matched.any() else None,
                        'metrics': persistence_metrics},
        'skill_vs_baseline_pct': 100 * (1 - test_metrics['rmse_wh'] / baseline_metrics['rmse_wh']) if baseline_metrics['rmse_wh'] else None,
        'uncertainty': {'nominal_coverage': .9, 'radius_wh': radius,
                        'test_coverage': float(np.mean((test[TARGET] >= lower) & (test[TARGET] <= upper))),
                        'method': 'Cuantil absoluto sobre calibración temporal separada; cobertura empírica, no garantía futura'},
        'partitions': {name: {'rows': len(part), 'start': part.index.min().isoformat(),
                             'end': part.index.max().isoformat()} for name, part in partitions.items()},
        'final_training_rows': len(development),
        'data_quality': quality, 'production_quality': calidad_produccion, 'backtest': backtest,
        'limitations': [
            'Evaluación condicionada a meteorología observada, no a pronósticos meteorológicos archivados.',
            'La temperatura de módulo interviene en el diagnóstico con clima observado. El pronóstico anticipado tiene su propia evaluación en pronostico_diario.',
            'Limpieza auditada sin imputación: se excluyen filas incompletas y fuera de los límites declarados; las banderas estadísticas requieren revisión y no prueban fallas.',
            'Zona horaria de origen sin confirmar: se conserva la hora de reloj registrada y se etiqueta America/Guayaquil por compatibilidad con la aplicación, sin desplazar valores.',
            'Se conserva la interpretación previa de producción como Wh por 5 min; el fabricante debe confirmar que no es un contador acumulado y si la fecha indica inicio o fin del intervalo.',
            'No se dispone de potencia STC ni irradiación POA verificada para calcular PR o eficiencia.',
        ],
        'versions': {'python': platform.python_version(), 'sklearn': sklearn.__version__,
                     'xgboost': xgboost.__version__, 'pandas': pd.__version__},
    }
    BUNDLE_PATH.parent.mkdir(exist_ok=True)
    staged_bundle = BUNDLE_PATH.with_suffix('.pending.joblib')
    archivo = cargar_archivo()
    coeficientes, dias_ajuste = entrenar_radiacion(archivo, produccion, cuts[0])
    report['archivo_meteorologico'] = {
        'fuente': FUENTE, 'documentacion': URL_DOCUMENTACION,
        'coordenadas_aproximadas_campus': [-3.986, -79.198], 'unidad': 'W/m²',
        'plazos_horas': [24, 48], 'margen_minimo_horas': 9,
        'sha256': hashlib.sha256(ARCHIVO.read_bytes()).hexdigest() if ARCHIVO.is_file() else None,
        'dias_ajuste': dias_ajuste, 'ajuste_anterior_a': cuts[0].isoformat(),
    }
    historia = produccion.join(data.drop(columns=TARGET))
    artefacto = {'model': selected, 'thermal_model': thermal, 'report': report,
                 'baseline_profile': profile,
                 'archivo_radiacion': archivo, 'coef_radiacion': coeficientes,
                 'scenario_history': historia.loc[historia.index >= cuts[1] - pd.Timedelta(days=181)]}
    diario = evaluar_metodos(artefacto, historia, *cuts)
    report['pronostico_diario'] = diario
    joblib.dump(artefacto, staged_bundle)
    restaurado = joblib.load(staged_bundle)
    esperado = pronosticar_dia(artefacto, historia, last_day, diario['metodo'])
    servido = pronosticar_dia(restaurado, restaurado['scenario_history'], last_day, diario['metodo'])
    np.testing.assert_allclose(servido.estimacion, esperado.estimacion)
    np.testing.assert_allclose(bounded_predict(restaurado['model'], features(test.iloc[:100])), prediction[:100])
    staged_bundle.replace(BUNDLE_PATH)
    if winner == 'XGBoost':
        selected.save_model(ARTEFACTOS / 'model_xgboost.ubj')
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False), encoding='utf-8')
    pd.DataFrame(diario['por_dia_prueba']).to_csv(ARTEFACTOS / 'comparacion_pronostico_diario.csv', index=False)
    pd.DataFrame(validation_scores).to_csv(ARTEFACTOS / 'comparacion_modelos_pronostico.csv', index=False)
    print(f'Seleccionado: {winner}; test: {test_metrics}; mejora baseline: {report["skill_vs_baseline_pct"]:.1f}%', flush=True)
    print(f'Pronóstico de 24 h: {diario["nombre"]}. Prueba: {diario["prueba"]}', flush=True)
    print(f'Artefacto verificado: {BUNDLE_PATH}', flush=True)


if __name__ == '__main__':
    main()
