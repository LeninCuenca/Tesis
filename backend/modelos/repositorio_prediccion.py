"""Acceso al modelo entrenado, al histórico y a los informes auditados."""
import hashlib
import json
from functools import lru_cache
import joblib
from backend.configuracion.rutas import ARTEFACTOS
from backend.modelos.modelo_solar import BUNDLE_PATH, load_data


def objectives_report():
    path = ARTEFACTOS / 'objectives_report.json'
    if not path.exists():
        raise FileNotFoundError('Ejecuta python -m backend.procesos.evaluar_objetivos para evaluar el histórico auditado')
    result = json.loads(path.read_text())
    # Never serve daily metrics as if they described a newer, different model.
    if result['source_sha256'] != bundle()['report']['data_quality']['source_sha256']:
        raise FileNotFoundError('La evaluación no corresponde al dataset del modelo actual; regenera el reporte')
    if result['model_bundle_sha256'] != hashlib.sha256(BUNDLE_PATH.read_bytes()).hexdigest():
        raise FileNotFoundError('El modelo cambió; regenera la evaluación diaria')
    return result


def dataset():
    artifact = bundle()
    if 'scenario_history' in artifact:
        return artifact['scenario_history']
    return load_data()[0]


@lru_cache(maxsize=1)
def _load_bundle(modified):
    return joblib.load(BUNDLE_PATH)


def bundle():
    if not BUNDLE_PATH.exists():
        raise FileNotFoundError('Ejecuta primero python -m backend.procesos.entrenar_pronostico para generar el modelo validado')
    return _load_bundle(BUNDLE_PATH.stat().st_mtime_ns)


