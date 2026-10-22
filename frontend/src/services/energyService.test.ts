import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  reading: null as Record<string, unknown> | null,
  latestError: null as { message: string } | null,
}));
vi.mock("../lib/supabase", () => ({
  supabaseConfigured: true,
  supabase: {
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        gte: () => chain,
        lte: () => chain,
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
        ) => Promise.resolve({ data: fixture.rows, error: null }).then(resolve),
      };
      return chain;
    },
  },
}));
import { fetchDashboardData } from "./energyService";

describe("calidad y unidades del resumen", () => {
  beforeEach(() => {
    fixture.rows = [];
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
    expect(result.warnings).toHaveLength(2);
  });
});
