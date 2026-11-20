import { describe, expect, it } from "vitest";
import { crearGraficasPlantas, type FilaResumen } from "../modelos/resumen_plantas";

describe("gráficas del resumen de plantas", () => {
  it("usa seis ventanas y valores distintos sin desplazar las fechas originales", () => {
    const filas: FilaResumen[] = Array.from({ length: 90 }, (_, indice) => ({
      fecha: new Date(Date.parse("2025-04-02T00:00:00Z") + indice * 86_400_000).toISOString().slice(0, 10),
      produccion_fotovoltaica_wh: indice * 1000,
      consumo_wh: (indice + 10) * 1000,
      registros_validos: 288,
    }));
    const graficas = crearGraficasPlantas(filas, "2025-06-30", "week");
    expect(graficas).toHaveLength(6);
    expect(graficas.map((g) => g.fin)).toEqual(["2025-06-30", "2025-06-23", "2025-06-16", "2025-06-09", "2025-06-02", "2025-05-26"]);
    expect(new Set(graficas.map((g) => g.puntos.at(-1)?.generacionKwh)).size).toBe(6);
    expect(graficas.every((g) => g.puntos.length === 7)).toBe(true);
    expect(graficas[1].puntos[0].fecha).toBe("2025-06-17");
    expect(graficas.filter((g) => g.central.demostracion)).toHaveLength(5);
  });

  it("conserva los ceros medidos y deja los días ausentes sin barras", () => {
    const graficas = crearGraficasPlantas([{ fecha: "2025-06-30", produccion_fotovoltaica_wh: 0, consumo_wh: null, registros_validos: 288 }], "2025-06-30", "week");
    expect(graficas[0].puntos.at(-1)).toEqual({ fecha: "2025-06-30", generacionKwh: 0, consumoKwh: null });
    expect(graficas[0].puntos[0].generacionKwh).toBeNull();
    expect(graficas[1].puntos.every((p) => p.generacionKwh === null && p.consumoKwh === null)).toBe(true);
  });

  it("no publica producción como válida cuando no hay intervalos registrados", () => {
    const graficas = crearGraficasPlantas([{ fecha: "2025-06-30", produccion_fotovoltaica_wh: 5000, consumo_wh: 10000, registros_validos: 0 }], "2025-06-30", "day");
    expect(graficas[0].puntos[0]).toEqual({ fecha: "2025-06-30", generacionKwh: null, consumoKwh: 10 });
    expect(graficas.every((g) => g.puntos.length === 1)).toBe(true);
    expect(crearGraficasPlantas([], "2025-06-30", "month").every((g) => g.puntos.length === 30)).toBe(true);
  });
});
