import type { ForecastResult } from "./prediccion";
export type ObservacionPrediccion = { timestamp: string; actual_wh: number | null };
export type ReproduccionHistorica = { mode: "historical_replay"; source: string; forecast: ForecastResult; observations: ObservacionPrediccion[]; notice: string };

export function compararPrediccion(plan: ForecastResult, observaciones: ObservacionPrediccion[]) {
  const porFecha = new Map(observaciones.map((lectura) => [Date.parse(lectura.timestamp), lectura.actual_wh]));
  let real = 0, prevista = 0, absoluto = 0, cuadrados = 0, recibidos = 0, previstaCompleta = 0;
  const puntos = plan.forecast.map((punto) => {
    previstaCompleta += punto.prediction_wh;
    const valor = porFecha.get(Date.parse(punto.timestamp));
    const medida = typeof valor === "number" && Number.isFinite(valor) && valor >= 0 ? valor : null;
    if (medida !== null) {
      recibidos++; real += medida; prevista += punto.prediction_wh;
      absoluto += Math.abs(medida - punto.prediction_wh);
      cuadrados += (medida - punto.prediction_wh) ** 2;
    }
    return { ...punto, actual_wh: medida, error_wh: medida === null ? null : medida - punto.prediction_wh,
      full_predicted_cumulative_kwh: previstaCompleta / 1000,
      actual_cumulative_kwh: medida === null ? null : real / 1000,
      predicted_cumulative_kwh: medida === null ? null : prevista / 1000 };
  });
  const esperadas = new Set(plan.forecast.map((p) => Date.parse(p.timestamp)));
  return { puntos, recibidos, pendientes: plan.forecast.length - recibidos,
    actualKwh: recibidos ? real / 1000 : null, predictedKwh: recibidos ? prevista / 1000 : null,
    maeWh: recibidos ? absoluto / recibidos : null, rmseWh: recibidos ? Math.sqrt(cuadrados / recibidos) : null,
    relacionPct: recibidos && prevista > 0 ? real / prevista * 100 : null,
    fueraDeRejilla: observaciones.filter((p) => !esperadas.has(Date.parse(p.timestamp))).length };
}

export function lecturasHastaIntervalo(plan: ForecastResult, lecturas: ObservacionPrediccion[], cursor: number) {
  const visibles = new Set(plan.forecast.slice(0, Math.max(0, Math.min(plan.forecast.length, Math.floor(cursor)))).map((p) => Date.parse(p.timestamp)));
  return lecturas.filter((p) => visibles.has(Date.parse(p.timestamp)));
}
