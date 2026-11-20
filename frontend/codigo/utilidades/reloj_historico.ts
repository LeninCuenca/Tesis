// Revela marcas históricas hasta la hora actual, sin alterar sus fechas originales.
export function intervalosHastaHoraEcuador(ahora = new Date()): number {
  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Guayaquil", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(ahora);
  const hora = Number(partes.find(p => p.type === "hour")!.value);
  const minuto = Number(partes.find(p => p.type === "minute")!.value);
  return Math.floor((hora * 60 + minuto) / 5) + 1;
}

// Se alinea con :00, :05, :10... y recupera el reloj al volver a la pestaña.
export function sincronizarRelojHistorico(actualizar: () => void): () => void {
  let temporizador: ReturnType<typeof setTimeout>;
  const programar = () => {
    clearTimeout(temporizador);
    actualizar();
    temporizador = setTimeout(programar, 300_000 - Date.now() % 300_000);
  };
  const alVolver = () => { if (document.visibilityState === "visible") programar(); };
  programar();
  document.addEventListener("visibilitychange", alVolver);
  return () => { clearTimeout(temporizador); document.removeEventListener("visibilitychange", alVolver); };
}
