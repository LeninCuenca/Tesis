import { CENTRAL_PRINCIPAL, desplazarFecha, type CentralSolar } from "../modelos/centrales";
import { supabase, supabaseConfigured } from "../configuracion/cliente_supabase";
import type { Period } from "../modelos/energia";
import { variablesElegidas, type HistoricoVariables } from "../modelos/variables";

const DIAS = { day: 1, week: 7, month: 30 };
const numero = (valor: unknown): number | null => {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
};

export async function consultarVariables(periodo: Period, seleccion: string[], signal: AbortSignal, central: CentralSolar = CENTRAL_PRINCIPAL): Promise<HistoricoVariables> {
  const variables = variablesElegidas(seleccion);
  if (!variables.length) return { lecturas: [], inicio: null, fin: null };
  if (!supabaseConfigured || !supabase) throw new Error("Configura la conexión pública de Supabase para consultar las variables.");
  const { data: ultima, error: errorFecha } = await supabase.from("mediciones_energeticas")
    .select("fecha_hora").eq("central_id", central.fuenteId).order("fecha_hora", { ascending: false }).limit(1).abortSignal(signal).maybeSingle();
  if (errorFecha) throw errorFecha;
  if (!ultima) return { lecturas: [], inicio: null, fin: null };
  const fin = desplazarFecha(ultima.fecha_hora, central.desfaseDias);
  const inicio = new Date(Date.parse(fin) - DIAS[periodo] * 86_400_000 + 300_000).toISOString();
  const lecturas: HistoricoVariables["lecturas"] = [];
  // Supabase limita las respuestas: recuperar todas las páginas del periodo.
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from("mediciones_energeticas")
      .select(["fecha_hora", ...variables.map((v) => v.codigo)].join(","))
      .eq("central_id", central.fuenteId).gte("fecha_hora", inicio).lte("fecha_hora", fin)
      .order("fecha_hora", { ascending: true }).range(offset, offset + 999).abortSignal(signal);
    if (error) throw error;
    const filas = (data ?? []) as unknown as Record<string, unknown>[];
    for (const fila of filas) lecturas.push({ fecha: String(fila.fecha_hora), valores: Object.fromEntries(variables.map((v) => [v.codigo, numero(fila[v.codigo])])) });
    if (filas.length < 1000) break;
  }
  return { lecturas, inicio, fin };
}
