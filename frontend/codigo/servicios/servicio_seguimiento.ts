import { supabase, supabaseConfigured } from "../configuracion/cliente_supabase";
import type { ForecastResult } from "../modelos/prediccion";
import type { ObservacionPrediccion } from "../modelos/seguimiento_prediccion";

export async function consultarMedicionesPrediccion(plan: ForecastResult, signal: AbortSignal): Promise<ObservacionPrediccion[]> {
  if (!supabaseConfigured || !supabase) throw new Error("Configura Supabase para recibir las mediciones de la central.");
  const primera = plan.forecast[0], ultima = plan.forecast.at(-1);
  if (!primera || !ultima) return [];
  const { data, error } = await supabase.from("mediciones_energeticas")
    .select("fecha_hora,produccion_fotovoltaica").eq("central_id", 1)
    .gte("fecha_hora", new Date(primera.timestamp).toISOString())
    .lte("fecha_hora", new Date(ultima.timestamp).toISOString())
    .order("fecha_hora", { ascending: true }).abortSignal(signal);
  if (error) throw error;
  return ((data ?? []) as { fecha_hora: string; produccion_fotovoltaica: unknown }[]).map((fila) => {
    const valor = fila.produccion_fotovoltaica;
    const numero = valor === null || valor === undefined || valor === "" ? NaN : Number(valor);
    return { timestamp: fila.fecha_hora, actual_wh: Number.isFinite(numero) && numero >= 0 ? numero : null };
  });
}
