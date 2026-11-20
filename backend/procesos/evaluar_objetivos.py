"""Almacenamiento auditado y evaluación energética diaria sin reajustar el modelo."""
from datetime import datetime, timezone
import json
import hashlib
import argparse
import joblib
import numpy as np
import pandas as pd
from backend.modelos.modelo_solar import AUDITED_DATA_PATH, BUNDLE_PATH, TARGET, features, load_data, bounded_predict
from base_datos.repositorios.repositorio_auditado import write_snapshot
from backend.modelos.rendimiento_fotovoltaico import evaluate_physical

from backend.configuracion.rutas import ARTEFACTOS, CONFIGURACION


def daily_evaluation(index, actual, predicted):
    frame=pd.DataFrame({'actual_wh':actual,'predicted_wh':predicted},index=index)
    if frame.index.has_duplicates:raise ValueError('Fechas repetidas')
    frame=frame.sort_index()
    frame['valid']=np.isfinite(frame[['actual_wh','predicted_wh']]).all(axis=1)
    complete=frame.loc[frame.valid]
    daily=complete.resample('D').agg(actual_wh=('actual_wh','sum'),predicted_wh=('predicted_wh','sum'),rows=('actual_wh','size'))
    # A complete day requires the exact expected five-minute grid, not just 288 arbitrary timestamps.
    daily['complete']=[pd.DatetimeIndex(complete.loc[complete.index.normalize()==day].index).equals(
        pd.date_range(day,day+pd.DateOffset(days=1),freq='5min',inclusive='left')) for day in daily.index]
    eligible=daily[daily.complete]
    error=(eligible.predicted_wh-eligible.actual_wh)/1000
    return {'complete_days':len(eligible),'excluded_days':int((~daily.complete).sum()),
            'mae_kwh':float(error.abs().mean()) if len(error) else None,
            'rmse_kwh':float(np.sqrt((error**2).mean())) if len(error) else None,
            'bias_kwh':float(error.mean()) if len(error) else None,
            'actual_kwh':float(eligible.actual_wh.sum()/1000) if len(error) else None,
            'predicted_kwh':float(eligible.predicted_wh.sum()/1000) if len(error) else None,
            'days':[{'date':day.date().isoformat(),'actual_kwh':float(row.actual_wh/1000),
                     'predicted_kwh':float(row.predicted_wh/1000),'rows':int(row.rows),
                     'complete':bool(row.complete)} for day,row in daily.iterrows()]}


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--skip-store',action='store_true');args=parser.parse_args()
    metadata=json.loads((CONFIGURACION/'sistema_fotovoltaico.json').read_text())
    summary=json.loads((AUDITED_DATA_PATH.parent/'summary.json').read_text())
    manifest=json.loads((AUDITED_DATA_PATH.parent/'source_manifest.json').read_text())
    source_sha=hashlib.sha256(AUDITED_DATA_PATH.read_bytes()).hexdigest()
    if not args.skip_store:
        storage=write_snapshot(pd.read_pickle(AUDITED_DATA_PATH),AUDITED_DATA_PATH.parent/'history.sqlite',
                               central_id=metadata['central_id'],source_sha256=source_sha,
                               provenance={'source_manifest':manifest,'cleaning_version':summary['cleaning_version']})
        (AUDITED_DATA_PATH.parent/'storage_report.json').write_text(json.dumps(storage,ensure_ascii=False,indent=2))
    else:storage=json.loads((AUDITED_DATA_PATH.parent/'storage_report.json').read_text())
    if storage['source_sha256']!=source_sha:raise ValueError('Repositorio desactualizado')
    artifact=joblib.load(BUNDLE_PATH);report=artifact['report']
    if report['data_quality']['source_sha256']!=source_sha:raise ValueError('El modelo no procede del mismo dataset')
    data,_=load_data();part=report['partitions']['test'];test=data.loc[part['start']:part['end']]
    if len(test)!=part['rows']:raise ValueError('El conjunto de prueba ha cambiado')
    predicted=bounded_predict(artifact['model'],features(test))
    # Reproduce the published test RMSE before adding descriptive daily results.
    rmse=float(np.sqrt(np.mean((predicted-test[TARGET].to_numpy())**2)))
    if not np.isclose(rmse,report['test']['rmse_wh'],rtol=0,atol=1e-8):raise ValueError('El RMSE no coincide con el reporte')
    daily=daily_evaluation(test.index,test[TARGET].to_numpy(),predicted)
    slots=test.index.hour*60+test.index.minute
    baseline=artifact['baseline_profile'].reindex(slots).to_numpy()
    daily_baseline=daily_evaluation(test.index,test[TARGET].to_numpy(),baseline)
    persistence=data[TARGET].copy()
    persistence.index=persistence.index+pd.Timedelta(days=1)
    daily_persistence=daily_evaluation(test.index,test[TARGET].to_numpy(),persistence.reindex(test.index).to_numpy())
    # Only turn irradiance into irradiation after its plane AND averaging convention
    # have been confirmed. Point samples cannot silently become measured irradiation.
    physical_inputs=dict(metadata)
    exact_period=(daily['complete_days']>0 and daily['excluded_days']==0
                  and len(test)==daily['complete_days']*288)
    physical_inputs['same_period_complete']=bool(metadata.get('same_period_complete') is True and exact_period)
    energy=(daily['actual_kwh'] if metadata.get('energy_semantics')=='interval_ac_energy_confirmed' else None)
    poa=(float(test['Irradiación'].sum()*5/60/1000)
         if metadata.get('irradiance_plane')=='POA_confirmed'
         and metadata.get('irradiance_sampling')=='interval_mean_confirmed' and exact_period else None)
    physical=evaluate_physical(energy,poa,physical_inputs)
    result={'created_at':datetime.now(timezone.utc).isoformat(),'central':metadata['name'],
            'source_sha256':source_sha,'model_bundle_sha256':hashlib.sha256(BUNDLE_PATH.read_bytes()).hexdigest(),
            'storage':storage,'daily_test':daily,'daily_baseline':daily_baseline,
            'daily_persistence':daily_persistence,'physical':physical,
            'test_period':part,'interval_test_rmse_wh':rmse,
            'evaluation_mode':'observed_weather_conditional_estimation',
            'energy_semantics':'legacy_interval_assumption_unconfirmed',
            'technical_metadata':metadata,
            'physical_inputs':{'energy_ac_kwh':energy,'poa_kwh_m2':poa,
                               'same_period_complete':physical_inputs['same_period_complete']},
            'limitations':['La energía diaria conserva la interpretación previa de Wh por intervalo, pendiente de confirmación.',
                           'La meteorología es observada; estos errores no validan un pronóstico futuro.',
                           'El repositorio conserva la hora de origen y no cambia la base Supabase.',
                           'La validación empírica corresponde a una central; el identificador permite otras sin demostrar su desempeño.']}
    out=ARTEFACTOS/'objectives_report.json';out.write_text(json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False))
    pd.DataFrame(daily['days']).to_csv(ARTEFACTOS/'daily_test_evaluation.csv',index=False)
    print(json.dumps({'report':str(out),'storage_rows':storage['rows'],'channels':storage['channels'],
                      'daily':{k:v for k,v in daily.items() if k!='days'},'physical_status':{k:v['status'] for k,v in physical.items()}},ensure_ascii=False))


if __name__=='__main__':main()
