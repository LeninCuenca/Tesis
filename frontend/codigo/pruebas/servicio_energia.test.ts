import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  filtros: [] as [string, string, unknown][],
  rows: [] as Record<string, unknown>[],
  pares: [] as Record<string, unknown>[],
  reading: null as Record<string, unknown> | null,
  latestError: null as { message: string } | null,
}));
vi.mock("../configuracion/cliente_supabase", () => ({
  supabaseConfigured: true,
  supabase: {
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: (campo: string, valor: unknown) => { fixture.filtros.push([table, campo, valor]); return chain; },
        gte: (campo: string, valor: string) => { fixture.filtros.push([table, `desde:${campo}`, valor]); return chain; },
        lte: (campo: string, valor: string) => { fixture.filtros.push([table, `hasta:${campo}`, valor]); return chain; },
        range: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () =>
          table === "resumen_diario"
            ? { data: { fecha: "2025-06-30" }, error: null }
            : { data: fixture.reading, error: fixture.latestError },
        then: (
          resolve: (result: {
            data: Record<string, unknown>[];
            error: null;
          }) => unknown,
        ) => Promise.resolve({ data: table === "mediciones_energeticas" ? fixture.pares : fixture.rows, error: null }).then(resolve),
      };
      return chain;
    },
  },
}));
import { CENTRALES, procedenciaCentral } from "../modelos/centrales";
import { fetchDashboardData, fetchMeasurementExport } from "../servicios/servicio_energia";

describe("calidad y unidades del resumen", () => {
  beforeEach(() => {
    fixture.filtros = [];
    fixture.rows = [];
    fixture.pares = [];
    fixture.reading = null;
    fixture.latestError = null;
  });
  it("cuenta días completamente ausentes en el denominador y conserva huecos", async () => {
    fixture.rows = [
      {
        fecha: "2025-06-30",
        registros_validos: 288,
        produccion_fotovoltaica_wh: 1000,
        consumo_wh: 2000,
      },
    ];
    const result = await fetchDashboardData("week");
    expect(result.expectedRecords).toBe(7 * 288);
    expect(result.records).toBe(288);
    expect(result.totals.dataCoverage).toBeCloseTo(100 / 7);
    expect(result.points).toHaveLength(7);
    expect(result.points[0].generation).toBeNull();
    expect(result.totals.generationWh).toBe(1000);
  });
  it("diferencia cero medido de nulo y no cuenta días como mediciones", async () => {
    fixture.rows = [
      {
        fecha: "2025-06-30",
        registros_validos: 288,
        produccion_fotovoltaica_wh: 0,
        consumo_wh: null,
      },
    ];
    fixture.reading = {
      temperatura_ambiente: null,
      irradiacion: 0,
      fecha_hora: "2025-06-30T23:55:00Z",
    };
    const result = await fetchDashboardData("day");
    expect(result.totals.generationWh).toBe(0);
    expect(result.totals.consumptionWh).toBeNull();
    expect(result.totals.coverage).toBeNull();
    expect(result.latest.temperature).toBeNull();
    expect(result.latest.irradiance).toBe(0);
    expect(result.records).toBe(288);
  });
  it("no limita generación/consumo a 100 ni lo denomina autoconsumo", async () => {
    fixture.rows = [
      {
        fecha: "2025-06-30",
        registros_validos: 288,
        produccion_fotovoltaica_wh: 3000,
        consumo_wh: 1000,
      },
    ];
    fixture.pares = [{ fecha_hora: "2025-06-30T10:00:00Z", produccion_fotovoltaica: 3000, consumo: 1000 }, { fecha_hora: "2025-06-30T10:05:00Z", produccion_fotovoltaica: 500, consumo: null }];
    const result = await fetchDashboardData("day");
    expect(result.totals.coverage).toBe(300);
    expect(result.points[0].solarCoverage).toBe(300);
  });
  it("identifica un promedio diario cuando falla la consulta puntual", async () => {
    fixture.rows = [
      {
        fecha: "2025-06-30",
        registros_validos: 100,
        irradiacion_promedio: 120,
        temperatura_promedio: 20,
      },
    ];
    fixture.latestError = { message: "lectura no disponible" };
    const result = await fetchDashboardData("day");
    expect(result.latest.source).toBe("Promedio del último día");
    expect(result.latest.timestamp).toBeNull();
    expect(result.latest.irradiance).toBe(120);
    expect(result.warnings).toHaveLength(3);
  });
  it("asigna seis ventanas diferentes y mantiene la fuente real identificada", async () => {
    const finales = [];
    for (const central of CENTRALES) {
      fixture.filtros = [];
      const resultado = await fetchDashboardData("week", central);
      finales.push(resultado.endDate);
      expect(fixture.filtros).toContainEqual(["resumen_diario", "central_id", central.fuenteId]);
      expect(fixture.filtros).toContainEqual(["mediciones_energeticas", "hasta:fecha_hora", `${resultado.endDate}T23:59:59Z`]);
    }
    expect(finales).toEqual(["2025-06-30", "2025-06-23", "2025-06-16", "2025-06-09", "2025-06-02", "2025-05-26"]);
    expect(new Set(finales).size).toBe(6);
  });

  it("exporta mediciones del mismo periodo histórico elegido para la demostración", async () => {
    await fetchMeasurementExport("day", CENTRALES[2]);
    expect(fixture.filtros).toContainEqual(["mediciones_energeticas", "desde:fecha_hora", "2025-06-16T00:00:00Z"]);
    expect(fixture.filtros).toContainEqual(["mediciones_energeticas", "hasta:fecha_hora", "2025-06-16T23:59:59Z"]);
  });

  it("conserva la atribución de la fuente en los CSV de demostración", () => {
    expect(procedenciaCentral(CENTRALES[5])).toMatchObject({ central_vista: "Central solar 6", modo_datos: "demostracion_historica", central_fuente_id: 1, central_fuente: "Edificio Central UTPL", desfase_dias: 35 });
    expect(procedenciaCentral(CENTRALES[0]).modo_datos).toBe("historico_medido");
  });

});
