import { useRef, useState } from "react";
import { TextoInterpretacion } from "./TextoInterpretacion";
import { ArrowUp, Sparkles, SunMedium } from "lucide-react";
import { useProveedorIA } from "./useProveedorIA";

const API = (import.meta.env.VITE_PREDICTION_API_URL || "/api").replace(/\/$/, "");
type Props = { obtenerContexto: () => Promise<Record<string, unknown>>; ejemplo: string; titulo?: string; chat?: boolean };

export function AsistenteIA({ obtenerContexto, ejemplo, titulo = "Pregunta sobre los datos con IA", chat = false }: Props) {
  const [pregunta, setPregunta] = useState("");
  const [respuesta, setRespuesta] = useState("");
  const [calculada, setCalculada] = useState(false);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [ultimaPregunta, setUltimaPregunta] = useState("");
  const proveedor = useProveedorIA();
  const contextoCache = useRef<{ obtener: Props["obtenerContexto"]; hasta: number; valor: Record<string, unknown> } | null>(null);
  const respuestasCache = useRef(new Map<string, { respuesta: string; origen?: string }>());
  const preguntar = async (texto: string) => {
    if (!texto.trim() || cargando) return;
    setUltimaPregunta(texto.trim());
    if (chat) setPregunta("");
    setCargando(true); setError(""); setRespuesta("");
    try {
      const guardado = contextoCache.current;
      const contexto = guardado && guardado.obtener === obtenerContexto && guardado.hasta > Date.now()
        ? guardado.valor : await obtenerContexto();
      contextoCache.current = { obtener: obtenerContexto, hasta: guardado?.valor === contexto ? guardado.hasta : Date.now() + 300000, valor: contexto };
      const solicitud = JSON.stringify({ pregunta: texto.trim(), contexto });
      const previa = respuestasCache.current.get(solicitud);
      if (previa) {
        setRespuesta(previa.respuesta); setCalculada(previa.origen === "estadisticas");
        return;
      }
      const r = await fetch(`${API}/asistente`, { method: "POST", headers: { "Content-Type": "application/json" }, body: solicitud, signal: AbortSignal.timeout(110000) });
      const cuerpo = await r.json();
      if (!r.ok) throw new Error(cuerpo.error || "No se pudo consultar el asistente local.");
      setRespuesta(cuerpo.respuesta);
      setCalculada(cuerpo.origen === "estadisticas");
      if (respuestasCache.current.size >= 10) respuestasCache.current.delete(respuestasCache.current.keys().next().value!);
      respuestasCache.current.set(solicitud, cuerpo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo consultar el asistente.");
    } finally { setCargando(false); }
  };
  if (chat) return <div className="chat-dialogo">
    <div className="chat-mensajes" aria-live="polite" aria-busy={cargando}>
      {!ultimaPregunta && <div className="chat-bienvenida">
        <span className="chat-sol"><SunMedium size={30} strokeWidth={1.5} /></span>
        <h2>Entiende tu energía.</h2>
        <p>Consulta tus mediciones y descubre lo que cuentan los datos.</p>
        <div className="chat-sugerencias">
          {[ejemplo, "¿Cuál fue la producción total?"].map(texto => <button key={texto} type="button" onClick={() => void preguntar(texto)}>{texto}<ArrowUp size={15} /></button>)}
        </div>
      </div>}
      {ultimaPregunta && <div className="chat-turno">
        <div className="chat-mensaje-usuario">{ultimaPregunta}</div>
        {cargando && <div className="chat-pensando" role="status"><span className="chat-puntos">•••</span> Consultando tus datos…</div>}
        {respuesta && <div className="chat-mensaje-solaris"><span className="chat-autor"><SunMedium size={15} /> Solaris {calculada && <small>· Mediciones</small>}</span><TextoInterpretacion texto={respuesta} /></div>}
        {error && <p role="alert" className="notice">{error}</p>}
      </div>}
    </div>
    <form className="chat-compositor" onSubmit={e => { e.preventDefault(); void preguntar(pregunta); }}>
      <div className="chat-campo"><input aria-label="Mensaje para Solaris" value={pregunta} maxLength={2000} onChange={e => setPregunta(e.target.value)} placeholder="Pregunta sobre tus datos…" required /><button type="submit" disabled={cargando || !pregunta.trim()} aria-label="Enviar mensaje"><ArrowUp size={20} /></button></div>
      <p>{proveedor.nombre} · Revisa las cifras antes de usarlas.</p>
    </form>
  </div>;
  return <section className="panel asistente-ia">
    <h2><Sparkles size={18} /> {titulo}</h2>
    <p className="chart-description"><strong>{proveedor.nombre}.</strong> {proveedor.descripcion}</p>
    <form onSubmit={e => { e.preventDefault(); void preguntar(pregunta); }}>
      <label htmlFor={titulo}>Tu consulta</label>
      <div className="asistente-fila"><input id={titulo} value={pregunta} maxLength={2000} onChange={e => setPregunta(e.target.value)} placeholder={ejemplo} required /><button className="primary-button" disabled={cargando}>{cargando ? "Consultando…" : "Preguntar"}</button></div>
    </form>
    <button className="text-button" disabled={cargando} onClick={() => { setPregunta(ejemplo); void preguntar(ejemplo); }}>Probar: {ejemplo}</button>
    {error && <p role="alert" className="notice">{error}</p>}
    {respuesta && <div className="respuesta-asistente" role="status"><strong>{calculada ? "Resultado de las mediciones" : `Respuesta de ${proveedor.nombre}`}</strong><TextoInterpretacion texto={respuesta} /></div>}
  </section>;
}
