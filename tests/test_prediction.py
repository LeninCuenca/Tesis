"""Pruebas de invariantes físicos, fechas y contrato HTTP; no requieren red externa."""
import json
import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import numpy as np
import pandas as pd

from api_prediccion import PredictionHandler, automatic_forecast, bundle, predict_one
from solar_model import FEATURES, WEATHER, bounded_predict, energy_to_power_kw, features, interval_bounds, local_index


class PhysicalContractTests(unittest.TestCase):
    def test_five_minute_energy_conversion(self):
        # 100 Wh en 5 min = 1.2 kW medios; 288 intervalos = 28.8 kWh/día.
        self.assertAlmostEqual(float(energy_to_power_kw(100)), 1.2)
        self.assertAlmostEqual(sum([100] * 288) / 1000, 28.8)

    def test_utc_and_local_features_match(self):
        a = pd.DataFrame([[500, 20, 35]], columns=WEATHER, index=['2025-06-01T12:05:00-05:00'])
        b = a.copy(); b.index = ['2025-06-01T17:05:00Z']
        np.testing.assert_allclose(features(a), features(b))
        self.assertEqual(features(a).columns.tolist(), FEATURES)
        self.assertAlmostEqual(features(a)['hora'].iloc[0], 12 + 5 / 60)

    def test_unknown_timestamp_is_rejected(self):
        with self.assertRaises(ValueError): local_index([None])

    def test_nonnegative_interval_bounds(self):
        low, high = interval_bounds([0, 100], 30)
        np.testing.assert_allclose(low, [0, 70]); np.testing.assert_allclose(high, [30, 130])

    def test_no_production_when_irradiance_zero(self):
        class Dummy:
            def predict(self, matrix): return np.full(len(matrix), 100.)
        matrix = pd.DataFrame({'Irradiación': [0, 400]})
        np.testing.assert_allclose(bounded_predict(Dummy(), matrix), [0, 100])


class TrainedModelTests(unittest.TestCase):
    def test_ordered_disjoint_partitions(self):
        parts = bundle()['report']['partitions']
        for left, right in zip(['train', 'validation', 'calibration'], ['validation', 'calibration', 'test']):
            self.assertLess(pd.Timestamp(parts[left]['end']), pd.Timestamp(parts[right]['start']))

    def test_daily_scenario_is_complete_and_sums_actual_intervals(self):
        scenario = automatic_forecast({'date': '2025-07-02'})
        points = scenario['forecast']
        self.assertEqual(len(points), 288)
        self.assertAlmostEqual(scenario['total_kwh'], sum(point['prediction_wh'] for point in points) / 1000)
        timestamps = pd.DatetimeIndex([point['timestamp'] for point in points])
        self.assertTrue((timestamps[1:] - timestamps[:-1] == pd.Timedelta(minutes=5)).all())
        self.assertEqual(timestamps[0].hour, 0)
        self.assertEqual(timestamps[-1].strftime('%H:%M'), '23:55')
        for point in points:
            self.assertLessEqual(point['lower_wh'], point['prediction_wh'])
            self.assertGreaterEqual(point['upper_wh'], point['prediction_wh'])
            self.assertAlmostEqual(point['mean_power_kw'], point['prediction_wh'] * .012)
        json.dumps(scenario, allow_nan=False)

    def test_reject_invalid_and_nonfinite_weather(self):
        for value in [float('nan'), float('inf'), -1, 1601, True]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                predict_one({'timestamp': '2025-07-01T12:00:00-05:00', 'irradiacion': value, 'temperatura_ambiente': 20})

    def test_zero_and_estimated_temperature(self):
        result = predict_one({'timestamp': '2025-07-01T00:00:00-05:00', 'irradiacion': 0, 'temperatura_ambiente': 20})
        self.assertEqual(result['prediction_wh'], 0)
        self.assertIn('Estimada', result['temperature_source'])

    def test_pvlib_requires_explicit_poa_and_wind(self):
        result = predict_one({'timestamp': '2025-07-01T12:00:00-05:00', 'irradiacion': 800,
                              'poa_wm2': 800, 'wind_speed_ms': 1, 'temperatura_ambiente': 20})
        self.assertAlmostEqual(result['module_temperature_c'], 20 + 800 / (25 + 6.84))
        self.assertIn('Faiman', result['temperature_source'])


class HttpContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), PredictionHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown(); cls.server.server_close(); cls.thread.join()

    def test_health_and_model_report(self):
        with urlopen(self.base + '/health') as response:
            self.assertEqual(json.load(response)['status'], 'ready')
        with urlopen(self.base + '/model') as response:
            self.assertIn('test', json.load(response))

    def test_bad_json_and_missing_fields_return_400(self):
        for body in [b'{', b'[]', b'{}']:
            with self.assertRaises(HTTPError) as caught:
                urlopen(Request(self.base + '/predict', data=body, headers={'Content-Type': 'application/json'}))
            self.assertEqual(caught.exception.code, 400)
            caught.exception.close()

    def test_preflight_allows_post(self):
        with urlopen(Request(self.base + '/predict', method='OPTIONS', headers={'Origin': 'http://127.0.0.1:5176'})) as response:
            self.assertIn('POST', response.headers['Access-Control-Allow-Methods'])
            self.assertEqual(response.headers['Access-Control-Allow-Origin'], 'http://127.0.0.1:5176')


if __name__ == '__main__':
    unittest.main()
