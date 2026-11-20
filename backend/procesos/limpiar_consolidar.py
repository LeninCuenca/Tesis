"""Limpieza auditable de históricos UTPL, sin sobrescribir fuentes ni dataset activo.

Uso: python -m backend.procesos.limpiar_consolidar [--input archivos_o_directorio]
                                        [--config backend/configuracion/limpieza.json]
                                        [--output directorio_nuevo]

Cada ejecución conserva un manifiesto SHA-256, diagnóstico, banderas de calidad,
diccionario, conflictos, cambios e informe. La interpolación está desactivada.
"""

import argparse
from datetime import datetime, timezone
from pathlib import Path

from backend.servicios.limpieza_fotovoltaica import load_config, run_pipeline

from backend.configuracion.rutas import AUDITORIA, CONFIGURACION, DATOS_HISTORICOS


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input",
        type=Path,
        nargs="+",
        default=[DATOS_HISTORICOS],
        help="CSV/XLSX/XLSM o directorios; se ignoran los temporales ~$ de Excel",
    )
    parser.add_argument("--config", type=Path, default=CONFIGURACION / "limpieza.json")
    parser.add_argument(
        "--output", type=Path, help="Directorio nuevo. Nunca se reutiliza una salida existente"
    )
    parser.add_argument("--no-plots", action="store_true", help="Omitir gráficos de comparación")
    args = parser.parse_args(argv)
    config = load_config(args.config)
    if args.no_plots:
        config["plots"] = False
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    output = args.output or AUDITORIA / stamp
    report = run_pipeline(args.input, output, config)
    print(f"\nLimpieza completada: {output.resolve()}")
    print(
        f"Filas de entrada: {report['input_rows']:,}; timestamps: {report['observed_timestamps']:,}; "
        f"huecos insertados: {report['inserted_timestamps']:,}"
    )
    print(
        f"Celdas con conflictos: {report['conflict_cells']:,}. "
        "Revisar cleaning_report.md antes de integrar estos datos."
    )


if __name__ == "__main__":
    main()
