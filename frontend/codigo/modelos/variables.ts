export type CategoriaVariable = "Eléctricas AC" | "Eléctricas DC" | "Ambientales" | "Energéticas";
export type VariableMedida = { codigo: string; nombre: string; unidad: string; categoria: CategoriaVariable };

// Solo columnas y unidades identificadas en el esquema y los metadatos del proyecto.
export const VARIABLES: VariableMedida[] = [
  ...[1, 2, 3].map((fase) => ({ codigo: `tension_ca_l${fase}`, nombre: `Tensión AC · L${fase}`, unidad: "V", categoria: "Eléctricas AC" as const })),
  ...[1, 2, 3].map((fase) => ({ codigo: `corriente_ca_l${fase}`, nombre: `Corriente AC · L${fase}`, unidad: "A", categoria: "Eléctricas AC" as const })),
  { codigo: "factor_potencia", nombre: "Factor de potencia", unidad: "adimensional", categoria: "Eléctricas AC" },
  ...[1, 2].map((canal) => ({ codigo: `tension_cc_mpp${canal}`, nombre: `Tensión DC · MPP${canal}`, unidad: "V", categoria: "Eléctricas DC" as const })),
  ...[1, 2].map((canal) => ({ codigo: `corriente_cc_mpp${canal}`, nombre: `Corriente DC · MPP${canal}`, unidad: "A", categoria: "Eléctricas DC" as const })),
  { codigo: "irradiacion", nombre: "Irradiancia solar", unidad: "W/m²", categoria: "Ambientales" },
  { codigo: "temperatura_ambiente", nombre: "Temperatura ambiente", unidad: "°C", categoria: "Ambientales" },
  { codigo: "temperatura_modulo", nombre: "Temperatura de módulo", unidad: "°C", categoria: "Ambientales" },
  { codigo: "produccion_fotovoltaica", nombre: "Producción fotovoltaica", unidad: "Wh / intervalo", categoria: "Energéticas" },
  { codigo: "consumo", nombre: "Consumo del edificio", unidad: "Wh / intervalo", categoria: "Energéticas" },
];
export const CATEGORIAS: CategoriaVariable[] = ["Eléctricas AC", "Eléctricas DC", "Ambientales", "Energéticas"];
export const SELECCION_INICIAL = ["irradiacion", "temperatura_ambiente", "temperatura_modulo", "produccion_fotovoltaica"];
export type LecturaVariables = { fecha: string; valores: Record<string, number | null> };
export type HistoricoVariables = { lecturas: LecturaVariables[]; inicio: string | null; fin: string | null };

export function variablesElegidas(codigos: string[]): VariableMedida[] {
  return VARIABLES.filter((variable) => codigos.includes(variable.codigo));
}

// Corta las líneas cuando faltan intervalos; nunca completa un hueco con cero.
export function puntosVariable(lecturas: LecturaVariables[], codigo: string): [number, number | null][] {
  const puntos: [number, number | null][] = [];
  let anterior: number | undefined;
  for (const lectura of lecturas) {
    const fecha = Date.parse(lectura.fecha);
    if (anterior !== undefined && fecha - anterior > 300_000) puntos.push([anterior + 300_000, null]);
    puntos.push([fecha, lectura.valores[codigo] ?? null]);
    anterior = fecha;
  }
  return puntos;
}
