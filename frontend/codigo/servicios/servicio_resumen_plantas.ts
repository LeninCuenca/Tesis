import { supabase, supabaseConfigured } from "../configuracion/cliente_supabase";
import { CENTRAL_PRINCIPAL, CENTRALES, desplazarFecha } from "../modelos/centrales";
import type { Period } from "../modelos/energia";
import { DIAS_RESUMEN, crearGraficasPlantas, type FilaResumen } from "../modelos/resumen_plantas";

export async function consultarResumenPlantas(periodo: Period, signal: AbortSignal) {
  if (!supabaseConfigured || !supabase) throw new Error("Configura la conexión pública de Supabase para ver las gráficas.");
  const { data: ultima, error: errorFecha } = await supabase.from("resumen_diario").select("fecha")
    .eq("central_id", CENTRAL_PRINCIPAL.fuenteId).order("fecha", { ascending: false }).limit(1).abortSignal(signal).maybeSingle();
  if (errorFecha) throw errorFecha;
  if (!ultima) return [];
  const desfaseMaximo = Math.max(...CENTRALES.map((central) => central.desfaseDias));
  const desde = desplazarFecha(`${ultima.fecha}T00:00:00Z`, desfaseMaximo + DIAS_RESUMEN[periodo] - 1).slice(0, 10);
  // Todas las demostraciones comparten fuente: una consulta recupera sus ventanas.
  const { data, error } = await supabase.from("resumen_diario")
    .select("fecha,produccion_fotovoltaica_wh,consumo_wh,registros_validos")
    .eq("central_id", CENTRAL_PRINCIPAL.fuenteId).gte("fecha", desde).lte("fecha", ultima.fecha)
    .order("fecha", { ascending: true }).abortSignal(signal);
  if (error) throw error;
  return crearGraficasPlantas((data ?? []) as FilaResumen[], ultima.fecha, periodo);
}
