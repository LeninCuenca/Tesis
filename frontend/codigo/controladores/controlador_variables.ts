import { procedenciaCentral, type CentralSolar } from "../modelos/centrales";
import { useEffect, useState } from "react";
import type { Period } from "../modelos/energia";
import { SELECCION_INICIAL, variablesElegidas, type HistoricoVariables } from "../modelos/variables";
import { consultarVariables } from "../servicios/servicio_variables";
import { downloadCsv } from "../utilidades/exportar_csv";

export function useControladorVariables(periodo: Period, actualizacion: number | undefined, central: CentralSolar) {
  const [seleccion, setSeleccion] = useState<string[]>(SELECCION_INICIAL);
  const [resultado, setResultado] = useState<{ clave: string; datos: HistoricoVariables } | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [intento, setIntento] = useState(0);
  const codigos = [...seleccion].sort().join(",");
  const clave = `${central.id}:${periodo}:${codigos}`;
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Sincroniza una consulta externa cancelable con la selección.
    setCargando(true);
    setError("");
    void consultarVariables(periodo, codigos ? codigos.split(",") : [], controller.signal, central)
      .then((datos) => { if (!controller.signal.aborted) setResultado({ clave, datos }); })
      .catch((razon: unknown) => {
        if (!controller.signal.aborted) setError(razon instanceof Error ? razon.message : "No se pudieron consultar las variables. Revisa la conexión y los permisos de lectura.");
      })
      .finally(() => { if (!controller.signal.aborted) setCargando(false); });
    return () => controller.abort();
  }, [periodo, codigos, clave, actualizacion, intento, central]);
  const datos = resultado?.clave === clave ? resultado.datos : null;
  const variables = variablesElegidas(seleccion);
  const alternar = (codigo: string) => setSeleccion((previas) => previas.includes(codigo) ? previas.filter((v) => v !== codigo) : [...previas, codigo]);
  const exportar = () => {
    if (!datos?.lecturas.length) return;
    downloadCsv(datos.lecturas.map((lectura) => ({ ...procedenciaCentral(central), fecha_hora: lectura.fecha, ...Object.fromEntries(variables.map((v) => [`${v.nombre} (${v.unidad})`, lectura.valores[v.codigo]])) })), `variables-${central.id}.csv`);
  };
  return { seleccion, setSeleccion, variables, alternar, datos, cargando, error, exportar, reintentar: () => setIntento((v) => v + 1) };
}
