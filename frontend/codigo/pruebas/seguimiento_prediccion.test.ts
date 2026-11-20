import { beforeEach, describe, expect, it, vi } from "vitest";
import { evaluacionDelPronostico, type ForecastResult } from "../modelos/prediccion";
import { compararPrediccion, lecturasHastaIntervalo } from "../modelos/seguimiento_prediccion";

const fixture = vi.hoisted(() => ({ filas: [] as { fecha_hora: string; produccion_fotovoltaica: unknown }[], limites: [] as string[] }));
vi.mock("../configuracion/cliente_supabase", () => ({ supabaseConfigured: true, supabase: { from: () => {
  const chain = { select: () => chain, eq: () => chain, gte: (_: string, fecha: string) => { fixture.limites.push(fecha); return chain; }, lte: (_: string, fecha: string) => { fixture.limites.push(fecha); return chain; }, order: () => chain, abortSignal: () => chain,
    then: (resolve: (r: unknown) => unknown) => Promise.resolve({ data: fixture.filas, error: null }).then(resolve) };
  return chain;
} } }));
import { consultarMedicionesPrediccion } from "../servicios/servicio_seguimiento";

const inicio = Date.parse("2025-07-01T08:00:00-05:00");
const plan = { forecast: [100, 200, 300].map((prediction_wh, i) => ({ timestamp: new Date(inicio + i * 300_000).toISOString(), prediction_wh, hora: `08:${String(i * 5).padStart(2,"0")}`, mean_power_kw: prediction_wh * .012, lower_wh: 0, upper_wh: 500, baseline_wh: 100, irradiacion: 600, temperatura_ambiente: 20 })), date: "2025-07-01", interval_minutes: 5 } as ForecastResult;
beforeEach(() => { fixture.filas = []; fixture.limites = []; });

describe("seguimiento de la predicción", () => {
  it("usa los errores y la cobertura del método que generó la curva", () => {
    const prueba = { mae_wh: 40, rmse_wh: 80 };
    const calendario = { mae_wh: 60, rmse_wh: 95 };
    const diario = { nombre: "Calendario y clima", dias_prueba: 55, prueba, referencia_prueba: prueba,
      calendario_prueba: calendario, cobertura_prueba: .91, cobertura_calendario_prueba: .88 };
    const escenario = { ...plan, report: { ...plan.report, pronostico_diario: diario } };
    expect(evaluacionDelPronostico(escenario)).toMatchObject({ metodo: diario.nombre, errores: prueba, cobertura: .91 });
    const respaldo = { ...escenario, method_label: "Calendario", fallback: true };
    expect(evaluacionDelPronostico(respaldo)).toMatchObject({ metodo: "Calendario", errores: calendario, cobertura: .88 });
    const legado = { ...diario, calendario_prueba: undefined, cobertura_calendario_prueba: undefined };
    expect(evaluacionDelPronostico({ ...respaldo, report: { ...escenario.report, pronostico_diario: legado } }))
      .toMatchObject({ errores: undefined, cobertura: undefined });
  });

  it("muestra la previsión acumulada completa sin esperar lecturas y la mantiene fija al recibirlas", () => {
    const vacio = compararPrediccion(plan, []);
    const parcial = compararPrediccion(plan, [{ timestamp: plan.forecast[1].timestamp, actual_wh: 150 }]);
    expect(vacio.puntos.map(p => p.full_predicted_cumulative_kwh)).toEqual([.1, .3, .6]);
    expect(parcial.puntos.map(p => p.full_predicted_cumulative_kwh)).toEqual([.1, .3, .6]);
    expect(vacio.puntos.every(p => p.actual_cumulative_kwh === null)).toBe(true);
    expect(vacio.predictedKwh).toBeNull();
    expect(parcial.predictedKwh).toBe(.2);
    expect(parcial.actualKwh).toBe(.15);
  });

  it("compara únicamente los intervalos recibidos y conserva un cero medido", () => {
    const resultado = compararPrediccion(plan, [{ timestamp: plan.forecast[0].timestamp, actual_wh: 0 }, { timestamp: plan.forecast[1].timestamp, actual_wh: 100 }]);
    expect(resultado.recibidos).toBe(2);
    expect(resultado.actualKwh).toBe(.1);
    expect(resultado.predictedKwh).toBe(.3);
    expect(resultado.maeWh).toBe(100);
    expect(resultado.rmseWh).toBe(100);
    expect(resultado.relacionPct).toBeCloseTo(100 / 3);
    expect(resultado.puntos[0].actual_wh).toBe(0);
    expect(resultado.puntos[2].actual_cumulative_kwh).toBeNull();
    expect(resultado.puntos[2].error_wh).toBeNull();
  });

  it("no usa datos ausentes o inválidos como ceros ni redondea timestamps", () => {
    const resultado = compararPrediccion(plan, [{ timestamp: plan.forecast[0].timestamp, actual_wh: -1 }, { timestamp: plan.forecast[1].timestamp, actual_wh: NaN }, { timestamp: new Date(inicio + 1000).toISOString(), actual_wh: 20 }]);
    expect(resultado.recibidos).toBe(0);
    expect(resultado.maeWh).toBeNull();
    expect(resultado.relacionPct).toBeNull();
    expect(resultado.fueraDeRejilla).toBe(1);
  });

  it("alinea instantes ISO equivalentes y mantiene la curva prevista fija", () => {
    const previo = JSON.stringify(plan);
    const resultado = compararPrediccion(plan, [{ timestamp: "2025-07-01T08:00:00-05:00", actual_wh: 150 }]);
    expect(resultado.recibidos).toBe(1);
    expect(resultado.relacionPct).toBe(150);
    expect(JSON.stringify(plan)).toBe(previo);
  });

  it("preserva huecos y acumula ambas curvas en los mismos intervalos", () => {
    const resultado = compararPrediccion(plan, [{ timestamp: plan.forecast[0].timestamp, actual_wh: 50 }, { timestamp: plan.forecast[2].timestamp, actual_wh: 200 }]);
    expect(resultado.puntos[1].predicted_cumulative_kwh).toBeNull();
    expect(resultado.puntos[2].predicted_cumulative_kwh).toBe(.4);
    expect(resultado.puntos[2].actual_cumulative_kwh).toBe(.25);
  });

  it("la reproducción no revela lecturas posteriores al cursor", () => {
    const lecturas = plan.forecast.map((p) => ({ timestamp: p.timestamp, actual_wh: 100 }));
    expect(lecturasHastaIntervalo(plan, lecturas, 0)).toHaveLength(0);
    expect(lecturasHastaIntervalo(plan, lecturas, 1)).toEqual([lecturas[0]]);
    expect(lecturasHastaIntervalo(plan, lecturas, 2)).toHaveLength(2);
  });

  it("incorpora nuevas lecturas de Supabase sin recalcular la previsión", async () => {
    fixture.filas = [{ fecha_hora: plan.forecast[0].timestamp, produccion_fotovoltaica: 0 }];
    const inicial = compararPrediccion(plan, await consultarMedicionesPrediccion(plan, new AbortController().signal));
    fixture.filas.push({ fecha_hora: plan.forecast[1].timestamp, produccion_fotovoltaica: "200" });
    const siguiente = compararPrediccion(plan, await consultarMedicionesPrediccion(plan, new AbortController().signal));
    expect(inicial.recibidos).toBe(1);
    expect(siguiente.recibidos).toBe(2);
    expect(siguiente.puntos[1].actual_wh).toBe(200);
    expect(siguiente.puntos[2].actual_wh).toBeNull();
    expect(fixture.limites.slice(0,2)).toEqual([plan.forecast[0].timestamp,plan.forecast[2].timestamp]);
  });
});
