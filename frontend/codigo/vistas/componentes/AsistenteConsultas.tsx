import { Activity, BrainCircuit } from "lucide-react";
import type { CentralSolar } from "../../modelos/centrales";
import type { Period } from "../../modelos/energia";
import { VARIABLES } from "../../modelos/variables";
import { contextoVariables } from "../../modelos/contexto_asistente";
import { consultarVariables } from "../../servicios/servicio_variables";
import { AsistenteIA } from "./AsistenteIA";

export function AsistenteConsultas({ central, periodo }: { central: CentralSolar; periodo: Period }) {
  return <div className="asistente-pagina">
    <div className="asistente-introduccion">
      <span className="asistente-icono"><BrainCircuit size={25} /></span>
      <div><strong>Tu asistente para entender la energía</strong><p>Selecciona la central y el periodo en la parte superior. Pregunta sobre las mediciones, las variables o el consumo del periodo seleccionado.</p></div>
    </div>
    <div className="asistente-tarjetas">
      <div><div className="asistente-categoria"><Activity size={16} /> MEDICIONES Y CONSUMO</div>
        <AsistenteIA titulo="Consulta las variables" ejemplo="¿A qué hora hubo más consumo?" obtenerContexto={async () => contextoVariables(await consultarVariables(periodo, VARIABLES.map(v => v.codigo), new AbortController().signal, central), central)} />
      </div>
    </div>
    <p className="nota-seguimiento">El asistente recibe resúmenes de las mediciones del periodo seleccionado. Revisa las cifras y fechas antes de usarlas en tu tesis.</p>
  </div>;
}
