import { useCallback, useRef, useState } from "react";
import { SunMedium, X, ChevronDown } from "lucide-react";
import type { CentralSolar } from "../../modelos/centrales";
import type { Period } from "../../modelos/energia";
import { VARIABLES } from "../../modelos/variables";
import { contextoVariables } from "../../modelos/contexto_asistente";
import { consultarVariables } from "../../servicios/servicio_variables";
import { AsistenteIA } from "./AsistenteIA";

const periodos = { day: "Último día disponible", week: "Últimos 7 días disponibles", month: "Últimos 30 días disponibles" };

export function ChatSolaris({ central, periodo }: { central: CentralSolar; periodo: Period }) {
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const obtenerContexto = useCallback(async () => contextoVariables(
    await consultarVariables(periodo, VARIABLES.map(v => v.codigo), new AbortController().signal, central), central,
  ), [central, periodo]);
  function cerrar() { setAbierto(false); boton.current?.focus(); }
  return <aside className="chat-solaris" aria-label="Chat de Solaris">
    <section id="chat-solaris-ventana" className="chat-solaris-ventana" hidden={!abierto}
      aria-label="Consulta tus mediciones" onKeyDown={e => { if (e.key === "Escape") cerrar(); }}>
      <header className="chat-solaris-cabecera">
        <span className="chat-avatar"><SunMedium size={26} strokeWidth={1.5} /></span>
        <div><strong>Solaris</strong><span>Asistente de energía</span></div>
        <button type="button" onClick={cerrar} aria-label="Cerrar chat"><X size={20} /></button>
      </header>
      <div className="chat-solaris-contexto"><strong>{central.nombre}</strong><span>{periodos[periodo]}{central.demostracion ? " · Demostración histórica" : " · Histórico medido"}</span></div>
      <div className="chat-solaris-contenido">
        <AsistenteIA chat key={central.id + periodo} titulo="Pregunta sobre tus mediciones" ejemplo="¿A qué hora hubo más consumo?" obtenerContexto={obtenerContexto} />
      </div>
    </section>
    <button ref={boton} type="button" className="chat-solaris-boton" aria-expanded={abierto}
      aria-controls="chat-solaris-ventana" onClick={() => abierto ? cerrar() : setAbierto(true)}>
      {abierto ? <ChevronDown size={23} /> : <SunMedium size={25} strokeWidth={1.6} />}<span>{abierto ? "Minimizar" : "Solaris"}</span>
    </button>
  </aside>;
}
