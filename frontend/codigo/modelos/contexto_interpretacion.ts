// Reduce la serie de 5 minutos a resúmenes horarios sin inventar datos faltantes.
export function resumirContextoInterpretacion(contexto: Record<string, unknown>): Record<string, unknown> {
  const resultado = { ...contexto };
  for (const campo of ["prediccion_por_intervalo", "intervalos_de_prueba_mostrados"]) {
    const serie = resultado[campo];
    if (!Array.isArray(serie)) continue;
    const resumen = new Map<string, { previstos: number[]; medidos: number[] }>();
    for (const punto of serie) {
      if (!punto || typeof punto !== "object") continue;
      const fecha = typeof punto.hora === "string" ? punto.hora : typeof punto.timestamp === "string"
        ? new Date(punto.timestamp).toLocaleTimeString("en-GB", { timeZone: "America/Guayaquil", hour: "2-digit", hourCycle: "h23" }) : "";
      const hora = fecha.slice(0, 2);
      if (!/^\d{2}$/.test(hora)) continue;
      if (!resumen.has(hora)) resumen.set(hora, { previstos: [], medidos: [] });
      const grupo = resumen.get(hora)!;
      const previsto = punto.prediccion_wh ?? punto.predicted_wh;
      const medido = punto.medicion_wh ?? punto.actual_wh;
      if (typeof previsto === "number" && Number.isFinite(previsto)) grupo.previstos.push(previsto);
      if (typeof medido === "number" && Number.isFinite(medido)) grupo.medidos.push(medido);
    }
    resultado[campo] = Array.from(resumen, ([hora, g]) => ({
      hora: `${hora}:00`, prevista_media_wh_5min: g.previstos.length ? g.previstos.reduce((a, b) => a + b, 0) / g.previstos.length : null,
      medida_media_wh_5min: g.medidos.length ? g.medidos.reduce((a, b) => a + b, 0) / g.medidos.length : null,
      intervalos_previstos: g.previstos.length, intervalos_medidos: g.medidos.length,
    }));
    resultado.aviso_resumen_horario = "Los valores horarios son promedios por intervalo, no energía total por hora. Los intervalos sin lectura no se cuentan.";
  }
  return resultado;
}
