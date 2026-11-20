"""Regresiones de ingesta, física, trazabilidad y ausencia de imputación implícita."""

import contextlib
import copy
import io
import json
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd
from openpyxl import Workbook

from backend.servicios.limpieza_fotovoltaica import (
    FLAG_DEFINITIONS,
    Audit,
    apply_quality_rules,
    load_config,
    load_source,
    parse_numeric,
    run_pipeline,
    visualization_imputation,
)

from backend.configuracion.rutas import CONFIGURACION


class CleaningTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.base = Path(self.temporary.name)
        self.inputs = self.base / "inputs"
        self.inputs.mkdir()
        self.config = load_config(CONFIGURACION / "limpieza.json")
        self.config["plots"] = False
        self.config["anomalies"] = {}

    def tearDown(self):
        self.temporary.cleanup()

    def csv(self, text, filename="input.csv", encoding="utf-8"):
        file = self.inputs / filename
        file.write_text(text, encoding=encoding)
        return file

    def run_cleaning(self, config=None):
        output = self.base / "result"
        with contextlib.redirect_stdout(io.StringIO()):
            report = run_pipeline([self.inputs], output, config or self.config)
        data = pd.read_pickle(output / "cleaned.pkl")
        flags = pd.read_csv(output / "quality_flags.csv", index_col=0)
        return output, report, data, flags

    def test_csv_bom_semicolon_decimal_units_and_non_numeric(self):
        self.csv(
            "Fecha y hora;Potencia AC [kW];Temperatura ambiente [°C]\n"
            "2025-01-01T00:00:00;1,5;20\n2025-01-01T00:05:00;texto;21\n",
            encoding="utf-8-sig",
        )
        output, report, data, _ = self.run_cleaning()
        self.assertEqual(data["Potencia AC"].iloc[0], 1500)
        self.assertTrue(pd.isna(data["Potencia AC"].iloc[1]))
        changes = pd.read_csv(output / "change_log.csv")
        self.assertIn("unit_conversion", changes["rule"].tolist())
        self.assertIn("invalid_numeric", changes["rule"].tolist())
        self.assertEqual(report["output_rows"], 2)

    def test_devices_are_separate_even_when_their_values_agree(self):
        self.csv(
            "timestamp,A [V] | inversor,A [V] | medidor\n"
            "2025-01-01T00:00:00,220,230\n2025-01-01T00:05:00,221,221\n"
        )
        _, report, data, _ = self.run_cleaning()
        self.assertEqual(data["A | inversor [V]"].tolist(), [220, 221])
        self.assertEqual(data["A | medidor [V]"].tolist(), [230, 221])
        self.assertEqual(report["conflict_cells"], 0)

    def test_overlapping_files_conflicts_duplicates_and_complementary_values(self):
        self.csv(
            "timestamp,Potencia [W],Temperatura [°C]\n"
            "2025-01-01T00:00:00,10,20\n2025-01-01T00:05:00,11,\n",
            "a.csv",
        )
        self.csv(
            "timestamp,Potencia [W],Temperatura [°C]\n"
            "2025-01-01T00:00:00,10,20\n2025-01-01T00:05:00,12,22\n",
            "b.csv",
        )
        _, report, data, _ = self.run_cleaning()
        self.assertEqual(report["exact_duplicate_rows"], 1)
        self.assertEqual(report["repeated_timestamp_rows"], 2)
        self.assertEqual(data["Temperatura"].iloc[1], 22)
        self.assertTrue(pd.isna(data["Potencia"].iloc[1]))

    def test_time_gaps_no_silent_interpolation_or_timezone_assumption(self):
        self.csv(
            "timestamp,Producción fotovoltaica [Wh],Tensión [V]\n"
            "2025-01-01T00:00:00,10,220\n2025-01-01T00:15:00,40,223\n"
        )
        _, report, data, flags = self.run_cleaning()
        self.assertEqual(report["inserted_timestamps"], 2)
        self.assertIsNone(data.index.tz)
        self.assertTrue(data.iloc[1:3].isna().all().all())
        self.assertTrue(flags["Producción fotovoltaica"].iloc[1] & FLAG_DEFINITIONS["time_gap"])
        self.assertFalse(data.attrs["target_imputed"])

    def test_unknown_units_are_not_merged_with_known_units(self):
        self.csv("timestamp,Digital 2\n2025-01-01T00:00:00,1\n", "a.csv")
        self.csv("timestamp,Digital 2 [m/s]\n2025-01-01T00:00:00,2\n", "b.csv")
        _, _, data, _ = self.run_cleaning()
        self.assertEqual(
            set(data.columns),
            {"Digital 2 | sin_dispositivo [unknown]", "Digital 2 | sin_dispositivo [m/s]"},
        )

    def test_no_drop_of_battery_constant_columns_or_negative_consumption(self):
        self.csv(
            "timestamp,Energía guardada en la batería [Wh],Consumo [Wh],Factor de potencia [1]\n"
            "2025-01-01T00:00:00,0,-5,1.2\n"
        )
        _, _, data, flags = self.run_cleaning()
        self.assertEqual(data["Consumo"].iloc[0], -5)
        self.assertEqual(data["Energía guardada en la batería"].iloc[0], 0)
        self.assertTrue(flags["Consumo"].iloc[0] & FLAG_DEFINITIONS["out_of_range"])
        self.assertTrue(flags["Factor de potencia"].iloc[0] & FLAG_DEFINITIONS["out_of_range"])

    def test_units_prevent_applying_dimensionless_limits_to_percentages(self):
        self.csv("timestamp,Factor de potencia [%]\n2025-01-01T00:00:00,95\n")
        _, _, data, flags = self.run_cleaning()
        self.assertAlmostEqual(data["Factor de potencia"].iloc[0], 0.95)
        self.assertFalse(flags["Factor de potencia"].iloc[0] & FLAG_DEFINITIONS["out_of_range"])

    def test_numeric_sentinels_are_only_configured_per_column(self):
        numbers, _, _, _, _ = parse_numeric(pd.Series(["9999", "-9999"]), ".", None, {""}, [])
        self.assertEqual(numbers.tolist(), [9999, -9999])
        self.csv("timestamp,Medida [V]\n2025-01-01T00:00:00,-9999\n")
        self.config["numeric_sentinels"] = {"Medida": [-9999]}
        _, _, data, _ = self.run_cleaning()
        self.assertTrue(pd.isna(data["Medida"].iloc[0]))

    def test_ambiguous_thousands_decimal_is_not_guessed(self):
        numbers, _, invalid, _, ambiguous = parse_numeric(
            pd.Series(["1,234"]), "auto", None, {""}, []
        )
        self.assertTrue(pd.isna(numbers.iloc[0]))
        self.assertTrue(invalid.iloc[0])
        self.assertTrue(ambiguous.iloc[0])

    def test_repeated_headers_invalid_dates_and_truncated_rows_preserved(self):
        self.config["csv"]["delimiter"] = ";"
        self.csv(
            "timestamp;V [V]\n2025-01-01T00:00:00;220\n"
            "timestamp;V [V]\nfecha_invalida;221\n2025-01-01T00:05:00\n"
        )
        output, _, data, _ = self.run_cleaning()
        rejected = pd.read_csv(output / "rejected_rows.csv")
        self.assertEqual(
            set(rejected["rule"]), {"repeated_header", "invalid_timestamp", "malformed_row"}
        )
        self.assertEqual(len(data), 1)
        self.assertTrue(rejected["raw_row_json"].notna().all())

    def test_excel_detects_units_without_hardcoded_skiprows(self):
        book = Workbook()
        sheet = book.active
        sheet.append(["Exportado de la central"])
        sheet.append(["Fecha y hora", "Temperatura ambiente | sensor", "Energía | inversor"])
        sheet.append(["[dd.MM.yyyy HH:mm]", "[K]", "[kWh]"])
        sheet.append(["01.01.2025 00:00", 293.15, 1.5])
        book.save(self.inputs / "source.xlsx")
        _, _, data, _ = self.run_cleaning()
        self.assertAlmostEqual(data["Temperatura ambiente"].iloc[0], 20)
        self.assertEqual(data["Energía"].iloc[0], 1500)

    def test_off_grid_timestamps_are_retained(self):
        self.csv("timestamp,V [V]\n2025-01-01T00:00:00,220\n2025-01-01T00:06:00,221\n")
        _, report, data, flags = self.run_cleaning()
        self.assertEqual(report["off_grid_timestamps"], 1)
        self.assertIn(pd.Timestamp("2025-01-01T00:06:00"), data.index)
        self.assertTrue(flags["V"].iloc[-1] & FLAG_DEFINITIONS["off_grid"])

    def test_original_source_and_existing_outputs_are_never_overwritten(self):
        source = self.csv("timestamp,V [V]\n2025-01-01T00:00:00,220\n")
        original = source.read_bytes()
        output, *_ = self.run_cleaning()
        with self.assertRaises(FileExistsError):
            run_pipeline([self.inputs], output, self.config)
        self.assertEqual(source.read_bytes(), original)
        manifest = json.loads((output / "source_manifest.json").read_text())
        self.assertEqual(len(manifest[0]["sha256"]), 64)

    def test_mixed_naive_and_aware_sources_require_explicit_timezone(self):
        self.csv("timestamp,V [V]\n2025-01-01T00:00:00,220\n", "a.csv")
        self.csv("timestamp,V [V]\n2025-01-01T00:05:00Z,221\n", "b.csv")
        with self.assertRaisesRegex(ValueError, "zonas horarias"):
            self.run_cleaning()
        self.assertTrue((self.base / "result/failure.json").exists())

    def test_visualization_imputation_only_complete_short_gaps_and_no_conflicts(self):
        self.csv(
            "timestamp,Tensión [V],Producción fotovoltaica [Wh]\n"
            "2025-01-01T00:00:00,1,1\n2025-01-01T00:15:00,4,4\n"
            "2025-01-01T00:45:00,10,10\n"
        )
        self.config["imputation"] = {"enabled": True, "max_steps": 2, "columns": ["Tensión"]}
        output, _, data, _ = self.run_cleaning()
        visual = pd.read_csv(output / "visualization_imputed.csv")
        self.assertEqual(visual["Tensión"].iloc[1:3].tolist(), [2.0, 3.0])
        self.assertTrue(visual["Tensión"].iloc[4:9].isna().all())
        self.assertTrue(data["Tensión"].iloc[1:3].isna().all())
        self.assertTrue(visual["Producción fotovoltaica"].iloc[1:3].isna().all())

    def test_imputation_energy_is_rejected(self):
        self.csv(
            "timestamp,Producción fotovoltaica [Wh]\n2025-01-01T00:00:00,1\n2025-01-01T00:15:00,4\n"
        )
        self.config["imputation"] = {
            "enabled": True,
            "max_steps": 2,
            "columns": ["Producción fotovoltaica"],
        }
        with self.assertRaisesRegex(ValueError, "No se permite interpolar"):
            self.run_cleaning()

    def test_statistical_flags_use_only_history_and_do_not_alter_values(self):
        index = pd.date_range("2025-01-01", periods=20, freq="5min")
        column = "Temperatura ambiente"
        data = pd.DataFrame({column: [20.0] * 10 + [50.0] + [20.0] * 9}, index=index)
        metadata = {column: {"variable": column, "unit": "°C"}}
        config = copy.deepcopy(self.config)
        config["anomalies"] = {
            column: {"window": 8, "min_periods": 8, "sigma": 8, "absolute_floor": 3}
        }
        output = self.base / "audit"
        output.mkdir()
        audit = Audit(output)
        try:
            result_flags = []
            for frame in [data, data.iloc[:11]]:
                flags = pd.DataFrame(0, index=frame.index, columns=frame.columns, dtype="uint16")
                _, cleaned, flags, _ = apply_quality_rules(
                    frame.copy(), flags, metadata, config, audit
                )
                self.assertEqual(cleaned[column].iloc[10], 50)
                result_flags.append(int(flags[column].iloc[10]))
            self.assertEqual(result_flags[0], result_flags[1])
            self.assertTrue(result_flags[0] & FLAG_DEFINITIONS["spike"])
        finally:
            audit.close()

    def test_csv_metadata_rows_do_not_break_delimiter_detection(self):
        self.csv("Exportación de laboratorio\ntimestamp;Medida [V]\n2025-01-01T00:00:00;220\n")
        output, _, data, _ = self.run_cleaning()
        self.assertEqual(data["Medida"].iloc[0], 220)
        rejected = pd.read_csv(output / "rejected_rows.csv")
        self.assertIn("metadata_row", rejected["rule"].tolist())

    def test_unit_normalization_overflow_and_infinity_are_audited(self):
        self.csv("timestamp,Potencia [kW]\n2025-01-01T00:00:00,1e308\n2025-01-01T00:05:00,inf\n")
        output, _, data, _ = self.run_cleaning()
        self.assertTrue(data["Potencia"].isna().all())
        changes = pd.read_csv(output / "change_log.csv")
        self.assertIn("normalization_overflow", changes["rule"].tolist())
        self.assertIn("invalid_numeric", changes["rule"].tolist())

    def test_visualization_imputation_never_crosses_a_conflict(self):
        self.csv(
            "timestamp,Tensión [V]\n2025-01-01T00:00:00,220\n"
            "2025-01-01T00:05:00,221\n2025-01-01T00:10:00,222\n",
            "a.csv",
        )
        self.csv("timestamp,Tensión [V]\n2025-01-01T00:05:00,240\n", "b.csv")
        self.config["imputation"] = {"enabled": True, "max_steps": 2, "columns": ["Tensión"]}
        output, _, _, _ = self.run_cleaning()
        visual = pd.read_csv(output / "visualization_imputed.csv")
        self.assertTrue(pd.isna(visual["Tensión"].iloc[1]))

    def test_unknown_unit_does_not_activate_physical_bound(self):
        self.csv("timestamp,Factor de potencia\n2025-01-01T00:00:00,95\n")
        _, _, data, flags = self.run_cleaning()
        self.assertEqual(data["Factor de potencia"].iloc[0], 95)
        self.assertTrue(flags["Factor de potencia"].iloc[0] & FLAG_DEFINITIONS["unit_uncertain"])
        self.assertFalse(flags["Factor de potencia"].iloc[0] & FLAG_DEFINITIONS["out_of_range"])

    def test_ambiguous_day_month_string_is_rejected_instead_of_guessed(self):
        self.csv("timestamp,V [V]\n01/02/2025 12:00,220\n2025-02-01T12:05:00,221\n")
        output, _, data, _ = self.run_cleaning()
        self.assertEqual(len(data), 1)
        rejected = pd.read_csv(output / "rejected_rows.csv")
        self.assertIn("invalid_timestamp", rejected["rule"].tolist())


if __name__ == "__main__":
    unittest.main()
