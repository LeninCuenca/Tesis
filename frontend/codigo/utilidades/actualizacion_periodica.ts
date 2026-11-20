// Consulta periódica y recuperación al volver a una pestaña suspendida.
export const INTERVALO_ACTUALIZACION_MS = 5 * 60 * 1000;

export function programarActualizacion(actualizar: () => void): () => void {
  let ultimaConsulta = Date.now();
  const consultar = () => {
    ultimaConsulta = Date.now();
    actualizar();
  };
  const alVolver = () => {
    if (
      document.visibilityState === "visible" &&
      Date.now() - ultimaConsulta >= INTERVALO_ACTUALIZACION_MS
    ) consultar();
  };
  const temporizador = setInterval(consultar, INTERVALO_ACTUALIZACION_MS);
  document.addEventListener("visibilitychange", alVolver);
  return () => {
    clearInterval(temporizador);
    document.removeEventListener("visibilitychange", alVolver);
  };
}
