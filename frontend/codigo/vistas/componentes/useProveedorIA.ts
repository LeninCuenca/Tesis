import { useEffect, useState } from "react";

const API = (import.meta.env.VITE_PREDICTION_API_URL || "/api").replace(/\/$/, "");
type Estado = { proveedor: "ollama" | "groq" | "openrouter"; modelo: string; local: boolean };

export function useProveedorIA() {
  const [estado, setEstado] = useState<Estado | null>(null);
  useEffect(() => {
    const controlador = new AbortController();
    void fetch(`${API}/asistente/estado`, { signal: controlador.signal })
      .then(r => r.ok ? r.json() as Promise<Estado> : null)
      .then(valor => { if (valor && !controlador.signal.aborted) setEstado(valor); })
      .catch(() => undefined);
    return () => controlador.abort();
  }, []);
  const nombre = estado?.proveedor === "ollama"
    ? estado.local ? "Ollama local" : "Ollama remoto"
    : estado?.proveedor === "groq" ? "Groq · remoto"
      : estado?.proveedor === "openrouter" ? "OpenRouter · remoto" : "Asistente de energía";
  const descripcion = estado?.local
    ? "El modelo procesa aquí la pregunta y el resumen de datos."
    : estado ? "La pregunta y el resumen de datos se envían al proveedor remoto configurado."
      : "Consulta los resúmenes de datos de la vista seleccionada.";
  return { nombre, descripcion };
}
