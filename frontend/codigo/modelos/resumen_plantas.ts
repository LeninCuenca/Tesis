import type { Period } from "./energia";
import { CENTRALES, desplazarFecha, type CentralSolar } from "./centrales";

export type FilaResumen = { fecha: string; produccion_fotovoltaica_wh: unknown; consumo_wh: unknown; registros_validos: unknown };
export type GraficaPlanta = {
  central: CentralSolar;
  inicio: string;
  fin: string;
  puntos: { fecha: string; generacionKwh: number | null; consumoKwh: number | null }[];
};
export const DIAS_RESUMEN: Record<Period, number> = { day: 1, week: 7, month: 30 };
const energiaKwh = (valor: unknown) => {
  if (valor === null || valor === undefined || valor === "") return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero / 1000 : null;
};

export function crearGraficasPlantas(filas: FilaResumen[], ultimaFecha: string, periodo: Period): GraficaPlanta[] {
  const porFecha = new Map(filas.map((fila) => [fila.fecha, fila]));
  return CENTRALES.map((central) => {
    const fin = desplazarFecha(`${ultimaFecha}T00:00:00Z`, central.desfaseDias).slice(0, 10);
    const inicio = desplazarFecha(`${fin}T00:00:00Z`, DIAS_RESUMEN[periodo] - 1).slice(0, 10);
    const puntos = Array.from({ length: DIAS_RESUMEN[periodo] }, (_, i) => {
      const fecha = desplazarFecha(`${inicio}T00:00:00Z`, -i).slice(0, 10);
      const fila = porFecha.get(fecha);
      return { fecha,
        generacionKwh: fila && Number(fila.registros_validos) > 0 ? energiaKwh(fila.produccion_fotovoltaica_wh) : null,
        consumoKwh: fila ? energiaKwh(fila.consumo_wh) : null };
    });
    return { central, inicio, fin, puntos };
  });
}
