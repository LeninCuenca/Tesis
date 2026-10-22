"""Regresión: los huecos largos y la energía no deben rellenarse parcialmente."""
import contextlib
import importlib.util
import io
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd


class CleaningTests(unittest.TestCase):
    def test_only_complete_short_interior_electrical_gaps_are_filled(self):
        location = Path(__file__).resolve().parents[1] / '01_limpieza_consolidacion.py'
        spec = importlib.util.spec_from_file_location('cleaning', location)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        index = pd.date_range('2025-01-01', periods=12, freq='5min')
        values = [1, np.nan, np.nan, 4, 5, np.nan, np.nan, np.nan, np.nan, np.nan, 11, 12]
        source = pd.DataFrame({'Tensión CA L1': values, 'Producción fotovoltaica': values,
                               'Irradiación': values, 'Consumo': [1] * 11 + [-1]}, index=index)
        with tempfile.TemporaryDirectory() as directory:
            module.BASE_DIR = Path(directory)
            module.INPUT_DIR = Path(directory) / 'datos_historicos'
            module.INPUT_DIR.mkdir()
            (module.INPUT_DIR / 'input.xlsx').touch()
            module.cargar_y_homogeneizar = lambda path: source.copy()
            with contextlib.redirect_stdout(io.StringIO()):
                module.main()
            result = pd.read_pickle(Path(directory) / 'dataset_limpio.pkl')
        self.assertEqual(result['Tensión CA L1'].iloc[1:3].tolist(), [2., 3.])
        self.assertTrue(result['Tensión CA L1'].iloc[5:10].isna().all())
        self.assertTrue(result['Producción fotovoltaica'].iloc[1:3].isna().all())
        self.assertTrue(result['Irradiación'].iloc[1:3].isna().all())
        self.assertTrue(pd.isna(result['Consumo'].iloc[-1]))


if __name__ == '__main__':
    unittest.main()
