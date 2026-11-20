"""Indicadores físicos con condiciones explícitas y sin parámetros inventados."""
import math


def evaluate_physical(energy_kwh, poa_kwh_m2, metadata):
    """Energía AC e irradiación POA del MISMO periodo, completos y no imputados.

    PR = (E_AC / P_STC) / (H_POA / 1 kW/m²)
    eta_sistema = E_AC / (H_POA * area)
    No confundir eficiencia solar a AC con eficiencia del inversor.
    """
    def positive(value):
        return (not isinstance(value, bool) and isinstance(value, (int, float))
                and math.isfinite(value) and value > 0)

    common = []
    if metadata.get('energy_semantics') != 'interval_ac_energy_confirmed':
        common.append('Confirmar que la producción es energía AC de cada intervalo')
    if metadata.get('same_period_complete') is not True:
        common.append('Confirmar cobertura completa y el mismo periodo para energía e irradiación')
    if not metadata.get('source_reference'):
        common.append('Documentar la fuente técnica de los parámetros y las convenciones')
    energy_valid = (not isinstance(energy_kwh, bool) and isinstance(energy_kwh, (int, float))
                    and math.isfinite(energy_kwh) and energy_kwh >= 0)
    if not energy_valid:
        common.append('Se necesita energía AC medida válida en kWh')
    irradiance_missing = []
    if metadata.get('irradiance_plane') != 'POA_confirmed':
        irradiance_missing.append('Confirmar irradiación en el plano del generador POA')
    if not positive(poa_kwh_m2):
        irradiance_missing.append('Se necesita irradiación POA positiva en kWh/m²')

    def metric(unit, missing, calculate):
        missing = list(dict.fromkeys(common + missing))
        return {'status': 'blocked' if missing else 'calculated', 'unit': unit,
                'value': None if missing else float(calculate()), 'requirements': missing}

    stc = metadata.get('dc_capacity_kwp')
    area = metadata.get('module_area_m2')
    capacity_missing = [] if positive(stc) else ['Potencia DC STC de los módulos verificada en kWp']
    area_missing = [] if positive(area) else ['Área total de módulos verificada en m²']
    result = {
        'specific_yield': metric('kWh/kWp', capacity_missing, lambda: energy_kwh / stc),
        'performance_ratio': metric('%', capacity_missing + irradiance_missing,
                                    lambda: 100 * energy_kwh / stc / poa_kwh_m2),
        'solar_to_ac_efficiency': metric('%', area_missing + irradiance_missing,
                                       lambda: 100 * energy_kwh / (poa_kwh_m2 * area)),
    }
    # Preserve out-of-range results for review, never clip them into a plausible range.
    for key, item in result.items():
        item['review_required'] = bool(key != 'specific_yield' and item['value'] is not None
                                       and item['value'] > 100)
    return result
