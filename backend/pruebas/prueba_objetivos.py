from pathlib import Path
import sqlite3
import tempfile
import unittest
from contextlib import closing
import numpy as np
import pandas as pd
from base_datos.repositorios.repositorio_auditado import write_snapshot
from backend.modelos.rendimiento_fotovoltaico import evaluate_physical

from backend.procesos import evaluar_objetivos as evaluation


class PhysicalMetricsTests(unittest.TestCase):
    def confirmed(self):
        return dict(dc_capacity_kwp=10,module_area_m2=50,irradiance_plane='POA_confirmed',
                    energy_semantics='interval_ac_energy_confirmed',same_period_complete=True,
                    source_reference='Ficha y convenciones verificadas para este ensayo')

    def test_energy_balance_units(self):
        result=evaluate_physical(40,5,self.confirmed())
        self.assertEqual(result['specific_yield']['value'],4)
        self.assertEqual(result['performance_ratio']['value'],80)
        self.assertEqual(result['solar_to_ac_efficiency']['value'],16)

    def test_do_not_confuse_inverter_capacity_with_dc_capacity(self):
        metadata=self.confirmed();metadata.pop('dc_capacity_kwp');metadata['inverter_kw']=15
        self.assertIsNone(evaluate_physical(40,5,metadata)['performance_ratio']['value'])

    def test_ghi_cannot_replace_poa(self):
        metadata=self.confirmed();metadata['irradiance_plane']='GHI'
        result=evaluate_physical(40,5,metadata)
        self.assertIsNone(result['performance_ratio']['value'])
        self.assertEqual(result['specific_yield']['value'],4)

    def test_unconfirmed_energy_and_incomplete_period_are_blocked(self):
        metadata=self.confirmed();metadata['energy_semantics']='unconfirmed';metadata['same_period_complete']=False
        self.assertTrue(all(v['value'] is None for v in evaluate_physical(40,5,metadata).values()))

    def test_zero_irradiation_and_nonfinite_never_generate_infinity(self):
        result=evaluate_physical(float('nan'),0,self.confirmed())
        self.assertTrue(all(v['value'] is None for v in result.values()))


class StorageAndDailyTests(unittest.TestCase):
    def test_snapshot_preserves_equipment_and_missing_values(self):
        frame=pd.DataFrame({'V equipo 1':[1,np.nan],'V equipo 2':[2,3]},index=pd.date_range('2025-01-01',periods=2,freq='5min'))
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'history.sqlite'
            report=write_snapshot(frame,path,central_id=7,source_sha256='example',provenance={})
            with closing(sqlite3.connect(path)) as conn:
                self.assertEqual(conn.execute('SELECT central_id,c000,c001 FROM measurements ORDER BY recorded_at').fetchall(),[(7,1.0,2.0),(7,None,3.0)])
                self.assertEqual(conn.execute('SELECT COUNT(*) FROM channels').fetchone()[0],2)
            self.assertEqual(report['clock_convention'],'unshifted_source_clock')

    def test_duplicates_cannot_overwrite_observations(self):
        frame=pd.DataFrame({'x':[1,2]},index=pd.to_datetime(['2025-01-01']*2))
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):write_snapshot(frame,Path(directory)/'h.sqlite',central_id=1,source_sha256='x',provenance={})

    def test_daily_errors_use_only_complete_days(self):
        index=pd.date_range('2025-01-01',periods=576,freq='5min',tz='America/Guayaquil').delete(300)
        result=evaluation.daily_evaluation(index,np.full(len(index),100.),np.full(len(index),110.))
        self.assertEqual(result['complete_days'],1);self.assertEqual(result['excluded_days'],1)
        self.assertAlmostEqual(result['mae_kwh'],2.88)
        self.assertAlmostEqual(result['actual_kwh'],28.8)

    def test_288_irregular_timestamps_are_not_a_complete_day(self):
        index=pd.date_range('2025-01-01 00:01',periods=288,freq='5min')
        result=evaluation.daily_evaluation(index,np.ones(288),np.ones(288))
        self.assertEqual(result['complete_days'],0);self.assertIsNone(result['mae_kwh'])


if __name__=='__main__':unittest.main()
