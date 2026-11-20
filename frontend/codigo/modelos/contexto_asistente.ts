import { VARIABLES, type HistoricoVariables } from "./variables";
import { procedenciaCentral, type CentralSolar } from "./centrales";

const formatoLocal = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function contextoVariables(datos: HistoricoVariables, central: CentralSolar) {
  // Formatear cada fecha una sola vez, en vez de recrear Intl para cada variable.
  const fechas = datos.lecturas.map(lectura => formatoLocal.format(new Date(lectura.fecha)));
  const variables = VARIABLES.map(v => {
    const validas = datos.lecturas.flatMap((lectura, indice) => {
      const valor = lectura.valores[v.codigo];
      return typeof valor === "number" && Number.isFinite(valor) && (!(v.codigo === "consumo" || v.codigo === "produccion_fotovoltaica") || valor >= 0) ? [{ fecha: fechas[indice], valor }] : [];
    });
    if (!validas.length) return { variable: v.nombre, unidad: v.unidad, muestras: 0 };
    let max = validas[0], min = validas[0];
    const horas = Array.from({ length: 24 }, () => ({ suma: 0, muestras: 0 }));
    const dias: Record<string, { suma: number; muestras: number }> = {};
    for (const punto of validas) {
      if (punto.valor > max.valor) max = punto;
      if (punto.valor < min.valor) min = punto;
      const hora = Number(punto.fecha.slice(11, 13));
      horas[hora].suma += punto.valor; horas[hora].muestras++;
      const dia = punto.fecha.slice(0,10);
      dias[dia] ??= { suma: 0, muestras: 0 };
      dias[dia].suma += punto.valor; dias[dia].muestras++;
    }
    const energetica = v.codigo === "consumo" || v.codigo === "produccion_fotovoltaica";
    return { variable: v.nombre, unidad: v.unidad, muestras: validas.length, maximo: max, minimo: min,
      media: validas.reduce((total, p) => total + p.valor, 0) / validas.length,
      energia_total_kwh: energetica ? validas.reduce((total, p) => total + p.valor, 0) / 1000 : null,
      perfil_horario: horas.map((h, hora) => ({ hora: `${String(hora).padStart(2,"0")}:00`, media: h.muestras ? h.suma / h.muestras : null, muestras: h.muestras })),
      dias: Object.entries(dias).map(([fecha, d]) => ({ fecha, media: d.suma / d.muestras, energia_kwh: energetica ? d.suma / 1000 : null, muestras: d.muestras })) };
  });
  return { central: procedenciaCentral(central), inicio: datos.inicio, fin: datos.fin, zona_horaria: "America/Guayaquil", aviso: "Datos históricos, no son mediciones en vivo. Energía Wh por intervalo sujeto a validación.", variables };
}
