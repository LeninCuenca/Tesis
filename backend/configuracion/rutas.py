"""Rutas absolutas compartidas, independientes del directorio de ejecución."""
from pathlib import Path
import os

RAIZ_PROYECTO = Path(__file__).resolve().parents[2]
BACKEND = RAIZ_PROYECTO / 'backend'
BASE_DATOS = RAIZ_PROYECTO / 'base_datos'
CONFIGURACION = BACKEND / 'configuracion'
ARTEFACTOS = Path(os.environ.get('SOLAR_ARTIFACT_DIR', BACKEND / 'artefactos')).resolve()
DATOS_LEGADOS = BASE_DATOS / 'datos/legados'
DATOS_HISTORICOS = BASE_DATOS / 'datos/historicos'
AUDITORIA = BASE_DATOS / 'datos/auditoria'
