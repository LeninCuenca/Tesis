import { describe, expect, it } from "vitest";
import { resumirContextoInterpretacion } from "../modelos/contexto_interpretacion";

describe("resumen para la interpretación automática", () => {
  it("agrupa por hora y no cuenta las mediciones pendientes como cero", () => {
    const entrada = { prediccion_por_intervalo: [
      { hora: "08:00", prediccion_wh: 100, medicion_wh: 0 },
      { hora: "08:05", prediccion_wh: 200, medicion_wh: null },
      { hora: "09:00", prediccion_wh: 300, medicion_wh: 200 },
    ] };
    const r = resumirContextoInterpretacion(entrada);
    expect(r.prediccion_por_intervalo).toEqual([
      { hora: "08:00", prevista_media_wh_5min: 150, medida_media_wh_5min: 0, intervalos_previstos: 2, intervalos_medidos: 1 },
      { hora: "09:00", prevista_media_wh_5min: 300, medida_media_wh_5min: 200, intervalos_previstos: 1, intervalos_medidos: 1 },
    ]);
    expect(entrada.prediccion_por_intervalo).toHaveLength(3);
  });
});
