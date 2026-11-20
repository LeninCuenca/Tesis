import { resumirContextoInterpretacion } from "../../modelos/contexto_interpretacion";
import { useEffect, useState } from "react";
import { TextoInterpretacion } from "./TextoInterpretacion";
import { Sparkles } from "lucide-react";
import { useProveedorIA } from "./useProveedorIA";

const API = (import.meta.env.VITE_PREDICTION_API_URL || "/api").replace(/\/$/, "");
const cache = new Map<string, string>();
const PREGUNTA = "Explica brevemente la predicción y las mediciones visibles. Indica la fecha, energía prevista, comparación únicamente en los intervalos recibidos, y si se trata de una reproducción histórica. Si faltan mediciones, dilo sin inventar cifras. Escribe en español natural, máximo 120 palabras, con dos o tres párrafos breves; redondea a dos decimales y evita repetir cifras exactas, títulos, tablas y detalles técnicos innecesarios.";

export function InterpretacionAutomatica({ contexto, pregunta = PREGUNTA, titulo, lateral = false }: { contexto: Record<string, unknown>; pregunta?: string; titulo?: string; lateral?: boolean }) {
  const contenido = JSON.stringify(resumirContextoInterpretacion(contexto));
  const claveCache = pregunta + contenido;
  const [resultado, setResultado] = useState<{ clave: string; respuesta?: string; error?: string } | null>(null);
  const vigente = resultado?.clave === claveCache ? resultado : null;
  const [revision, setRevision] = useState(0);
  const proveedor = useProveedorIA();

  useEffect(() => {
    const controlador = new AbortController();
    const previa = cache.get(claveCache);
    if (previa && revision === 0) {
      const temporizadorCache = window.setTimeout(() => setResultado({ clave: claveCache, respuesta: previa }), 0);
      return () => window.clearTimeout(temporizadorCache);
    }
    // Espera un instante para agrupar cambios rápidos del deslizador.
    const temporizador = window.setTimeout(() => {
      void fetch(`${API}/asistente`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pregunta, contexto: JSON.parse(contenido) }),
        signal: AbortSignal.any([controlador.signal, AbortSignal.timeout(110000)]),
      }).then(async r => {
        const resultado = await r.json();
        if (!r.ok) throw new Error(resultado.error || "No se pudo obtener la interpretación.");
        if (!controlador.signal.aborted) {
          if (cache.size >= 10) cache.delete(cache.keys().next().value!);
          cache.set(claveCache, resultado.respuesta);
          setResultado({ clave: claveCache, respuesta: resultado.respuesta });
        }
      }).catch((e: unknown) => {
        if (!controlador.signal.aborted) setResultado({ clave: claveCache, error: e instanceof Error && e.name === "TimeoutError" ? "El modelo tardó demasiado. Inténtalo de nuevo." : e instanceof Error ? e.message : "No se pudo obtener la interpretación." });
      });
    }, 800);
    return () => { window.clearTimeout(temporizador); controlador.abort(); };
  }, [contenido, claveCache, pregunta, revision]);

  return <section className={`panel asistente-ia${lateral ? " interpretacion-lateral" : ""}`} aria-label={titulo || "Interpretación automática de la predicción"}>
    <h2><Sparkles size={18} /> {titulo || `Interpretación automática con ${proveedor.nombre}`}</h2>
    <p className="chart-description">{lateral ? `${proveedor.nombre} · Interpretación automática` : `Se actualiza al cambiar la predicción o las lecturas visibles. ${proveedor.descripcion}`}</p>
    {!vigente && <p role="status">Actualizando la interpretación…</p>}
    {vigente?.error && <p role="alert" className="notice">{vigente.error} <button className="text-button" onClick={() => { setResultado(null); setRevision(n => n + 1); }}>Reintentar</button></p>}
    {vigente?.respuesta && <div className="respuesta-asistente" role="status"><span className="interpretacion-etiqueta">Análisis del escenario</span><TextoInterpretacion texto={vigente.respuesta} /></div>}
  </section>;
}
