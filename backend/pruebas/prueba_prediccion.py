"""Pruebas de invariantes físicos, fechas y contrato HTTP; no requieren red externa."""
import json
import threading
import unittest
import tempfile
from pathlib import Path
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import numpy as np
import pandas as pd

from backend.controladores.controlador_prediccion import ControladorPrediccion
from backend.servicios.servicio_prediccion import automatic_forecast, predict_one, historical_replay
from backend.modelos.repositorio_prediccion import bundle
from backend.modelos.modelo_solar import (AUDITED_CHANNELS, AUDITED_DATA_PATH, FEATURES, TARGET, WEATHER, bounded_predict,
                         energy_to_power_kw, features, interval_bounds, load_data, load_production,
                         load_training_data, local_index)


class PhysicalContractTests(unittest.TestCase):
    def test_audited_channels_keep_observations_without_imputation(self):
        index = pd.date_range('2025-01-01', periods=4, freq='5min')
        frame = pd.DataFrame({AUDITED_CHANNELS[TARGET]: [10, 20, 30, 40],
                              AUDITED_CHANNELS[WEATHER[0]]: [100, np.nan, 1700, 200],
                              AUDITED_CHANNELS[WEATHER[1]]: [20] * 4,
                              AUDITED_CHANNELS[WEATHER[2]]: [30] * 4}, index=index)
        # Un equipo distinto no debe completar ni reemplazar el sensor elegido.
        frame['Irradiación | PowerMeter [W/m²]'] = 900
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'cleaned.pkl'
            frame.to_pickle(path)
            data, quality = load_data(path)
        self.assertEqual(data[TARGET].tolist(), [10, 40])
        self.assertEqual(data[WEATHER[0]].tolist(), [100, 200])
        self.assertEqual(quality['rows_missing_or_nonfinite'], 1)
        self.assertEqual(quality['rows_complete_outside_bounds'], 1)
        self.assertEqual(quality['rows_valid'], 2)

    def test_five_minute_energy_conversion(self):
        # 100 Wh en 5 min = 1.2 kW medios; 288 intervalos = 28.8 kWh/día.
        self.assertAlmostEqual(float(energy_to_power_kw(100)), 1.2)
        self.assertAlmostEqual(sum([100] * 288) / 1000, 28.8)

    def test_production_ignores_missing_weather_and_excludes_ten_minute_days(self):
        coarse = pd.date_range('2024-04-01', periods=144, freq='10min')
        fine = pd.date_range('2024-04-02', periods=5, freq='5min')
        index = coarse.append(fine)
        frame = pd.DataFrame({TARGET: [90.] * 144 + [0., 45., -1., np.nan, np.inf]}, index=index)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'cleaned.pkl'
            frame.to_pickle(path)
            production, quality = load_production(path)
            for name, value in zip(WEATHER, [100., 15., 20.]):
                frame[AUDITED_CHANNELS[name]] = value
                frame.loc[fine[0], AUDITED_CHANNELS[name]] = np.nan
            frame.to_pickle(path)
            weather, weather_quality, same_production, same_quality = load_training_data(path)
        self.assertEqual(production[TARGET].tolist(), [0., 45.])
        self.assertEqual(weather[TARGET].tolist(), [45.])
        self.assertEqual(quality['rows_ten_minute_days'], 144)
        self.assertEqual(weather_quality['rows_ten_minute_days'], 144)
        self.assertEqual(weather_quality['partition_anchor_days'], ['2024-04-01', '2024-04-02'])
        self.assertEqual(same_quality['days_ten_minute'], 1)
        pd.testing.assert_frame_equal(production, same_production)

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
    def test_report_and_scenario_use_same_audited_training_source(self):
        artifact = bundle()
        report = artifact['report']
        self.assertEqual(report['final_training_rows'],
                         report['partitions']['train']['rows'] + report['partitions']['validation']['rows'])
        self.assertEqual(report['data_quality']['imputed_observed_cells'], 0)
        manifest = json.loads((AUDITED_DATA_PATH.parent / 'source_manifest.json').read_text())
        self.assertEqual(report['data_quality']['source_manifest'], manifest)
        self.assertEqual(len({source['sha256'] for source in manifest}), len(manifest))
        self.assertTrue(np.isfinite(artifact['scenario_history'][TARGET]).all())
        self.assertTrue(np.isfinite(artifact['scenario_history'][WEATHER].dropna()).all().all())

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


class ReplayTests(unittest.TestCase):
    def test_replay_uses_a_complete_test_day_and_only_prior_weather(self):
        replay = historical_replay()
        self.assertEqual(replay['mode'], 'historical_replay')
        self.assertEqual(len(replay['observations']), 288)
        self.assertEqual([p['timestamp'] for p in replay['observations']],
                         [p['timestamp'] for p in replay['forecast']['forecast']])
        self.assertLess(pd.Timestamp(replay['forecast']['source_end']), pd.Timestamp(replay['observations'][0]['timestamp']))
        self.assertGreater(pd.Timestamp(replay['observations'][0]['timestamp']),
                           pd.Timestamp(bundle()['report']['partitions']['calibration']['end']))
        json.dumps(replay, allow_nan=False)

    def test_replay_rejects_training_days(self):
        with self.assertRaises(ValueError):
            historical_replay({'date': bundle()['report']['partitions']['train']['start']})

    def test_scenario_historico_no_usa_datos_del_dia_ni_futuros(self):
        scenario = automatic_forecast({'date': '2025-06-30'})
        self.assertLess(pd.Timestamp(scenario['source_end']), pd.Timestamp(scenario['forecast'][0]['timestamp']))

    def test_forecast_unchanged_when_target_day_measurements_change(self):
        from unittest.mock import patch
        from backend.modelos.repositorio_prediccion import dataset
        original = automatic_forecast({'date': '2025-06-30'})
        changed = dataset().copy()
        mask = changed.index >= pd.Timestamp('2025-06-30', tz='America/Guayaquil')
        changed.loc[mask, [TARGET] + WEATHER] = 0
        with patch('backend.servicios.servicio_prediccion.dataset', return_value=changed):
            forecast = automatic_forecast({'date': '2025-06-30'})
        self.assertEqual(original['forecast'], forecast['forecast'])

    def test_scenario_rechaza_fecha_durante_entrenamiento(self):
        with self.assertRaisesRegex(ValueError, 'posterior al entrenamiento'):
            automatic_forecast({'date': '2025-02-01'})

    def test_replay_does_not_modify_observed_history(self):
        from backend.modelos.repositorio_prediccion import dataset
        original = dataset().copy()
        historical_replay()
        pd.testing.assert_frame_equal(original, dataset())


class HttpContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), ControladorPrediccion)
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

    def test_replay_endpoint_is_explicitly_historical(self):
        with urlopen(Request(self.base + '/predict/replay', data=b'{}', headers={'Content-Type': 'application/json'})) as response:
            result = json.load(response)
        self.assertEqual(result['mode'], 'historical_replay')
        self.assertEqual(result['source'], 'local_audited_history')
        self.assertEqual(len(result['observations']), 288)

    def test_preflight_allows_post(self):
        with urlopen(Request(self.base + '/predict', method='OPTIONS', headers={'Origin': 'http://127.0.0.1:5176'})) as response:
            self.assertIn('POST', response.headers['Access-Control-Allow-Methods'])
            self.assertEqual(response.headers['Access-Control-Allow-Origin'], 'http://127.0.0.1:5176')


if __name__ == '__main__':
    unittest.main()
