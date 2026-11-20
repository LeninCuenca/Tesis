import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  filas: [] as Record<string, unknown>[],
  ultima: { fecha_hora: "2025-07-01T12:00:00Z" } as { fecha_hora: string } | null,
  falloPagina: -1,
  consultas: [] as string[],
  paginas: [] as number[],
  limites: [] as [string, string][],
  señales: [] as AbortSignal[],
}));
vi.mock("../configuracion/cliente_supabase", () => ({
  supabaseConfigured: true,
  supabase: { from: () => {
    let desde = 0;
    let hasta = 999;
    let signal: AbortSignal;
    const chain = {
      select: (columnas: string) => { fixture.consultas.push(columnas); return chain; },
      eq: () => chain,
      gte: (_: string, valor: string) => { fixture.limites.push(["inicio", valor]); return chain; },
      lte: (_: string, valor: string) => { fixture.limites.push(["fin", valor]); return chain; },
      order: () => chain,
      limit: () => chain,
      abortSignal: (valor: AbortSignal) => { signal = valor; fixture.señales.push(valor); return chain; },
      maybeSingle: async () => ({ data: fixture.ultima, error: null }),
      range: (inicio: number, fin: number) => { desde = inicio; hasta = fin; fixture.paginas.push(inicio); return chain; },
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
        if (signal.aborted) return Promise.reject(new Error("Consulta cancelada")).then(resolve, reject);
        return Promise.resolve({ data: fixture.filas.slice(desde, hasta + 1), error: desde === fixture.falloPagina ? new Error("No se pudo leer la página") : null }).then(resolve, reject);
      },
    };
    return chain;
  } },
}));
import { CENTRALES } from "../modelos/centrales";
import { consultarVariables } from "../servicios/servicio_variables";
import { puntosVariable } from "../modelos/variables";

beforeEach(() => {
  fixture.filas = [];
  fixture.ultima = { fecha_hora: "2025-07-01T12:00:00Z" };
  fixture.falloPagina = -1;
  fixture.consultas = [];
  fixture.paginas = [];
  fixture.limites = [];
  fixture.señales = [];
});

describe("exploración de variables medidas", () => {
  it("consulta solo columnas permitidas y mantiene ceros y datos faltantes", async () => {
    fixture.filas = [{ fecha_hora: "2025-07-01T12:00:00Z", irradiacion: "0", temperatura_ambiente: null, temperatura_modulo: "no numérico" }];
    const resultado = await consultarVariables("day", ["irradiacion", "temperatura_ambiente", "temperatura_modulo", "columna_no_permitida"], new AbortController().signal);
    expect(resultado.lecturas[0].valores).toEqual({ irradiacion: 0, temperatura_ambiente: null, temperatura_modulo: null });
    expect(fixture.consultas).toEqual(["fecha_hora", "fecha_hora,irradiacion,temperatura_ambiente,temperatura_modulo"]);
    expect(fixture.limites).toEqual([["inicio", "2025-06-30T12:05:00.000Z"], ["fin", "2025-07-01T12:00:00.000Z"]]);
  });

  it("recupera más de una página sin truncar la ventana de treinta días", async () => {
    fixture.filas = Array.from({ length: 1001 }, (_, i) => ({ fecha_hora: new Date(Date.parse("2025-06-20T00:00:00Z") + i * 300_000).toISOString(), tension_ca_l1: 220 }));
    const resultado = await consultarVariables("month", ["tension_ca_l1"], new AbortController().signal);
    expect(resultado.lecturas).toHaveLength(1001);
    expect(fixture.paginas).toEqual([0, 1000]);
    expect(resultado.lecturas.at(-1)?.fecha).toBe(fixture.filas.at(-1)?.fecha_hora);
  });

  it("no publica una serie parcial cuando falla una página posterior", async () => {
    fixture.filas = Array.from({ length: 1001 }, () => ({ fecha_hora: "2025-07-01T12:00:00Z", irradiacion: 20 }));
    fixture.falloPagina = 1000;
    await expect(consultarVariables("week", ["irradiacion"], new AbortController().signal)).rejects.toThrow("No se pudo leer la página");
  });

  it("propaga la cancelación para retirar consultas al cambiar la selección", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(consultarVariables("day", ["irradiacion"], controller.signal)).rejects.toThrow("Consulta cancelada");
    expect(fixture.señales.every((signal) => signal === controller.signal)).toBe(true);
  });

  it("no consulta si se limpia la selección o si no hay registros", async () => {
    expect((await consultarVariables("day", [], new AbortController().signal)).lecturas).toEqual([]);
    expect(fixture.consultas).toEqual([]);
    fixture.ultima = null;
    expect((await consultarVariables("day", ["irradiacion"], new AbortController().signal)).lecturas).toEqual([]);
    expect(fixture.paginas).toEqual([]);
  });

  it("interrumpe la curva ante intervalos ausentes sin alterar los valores observados", () => {
    const base = Date.parse("2025-07-01T12:00:00Z");
    const puntos = puntosVariable([
      { fecha: new Date(base).toISOString(), valores: { irradiacion: 0 } },
      { fecha: new Date(base + 900_000).toISOString(), valores: { irradiacion: 300 } },
      { fecha: new Date(base + 1_200_000).toISOString(), valores: { irradiacion: null } },
    ], "irradiacion");
    expect(puntos).toEqual([[base, 0], [base + 300_000, null], [base + 900_000, 300], [base + 1_200_000, null]]);
  });
  it("cambia las fechas de las variables al seleccionar otra central de demostración", async () => {
    const referencia = await consultarVariables("day", ["irradiacion"], new AbortController().signal, CENTRALES[0]);
    fixture.limites = [];
    const demo = await consultarVariables("day", ["irradiacion"], new AbortController().signal, CENTRALES[3]);
    expect(Date.parse(referencia.fin!) - Date.parse(demo.fin!)).toBe(21 * 86_400_000);
    expect(fixture.limites).toEqual([["inicio", "2025-06-09T12:05:00.000Z"], ["fin", "2025-06-10T12:00:00.000Z"]]);
  });

});
