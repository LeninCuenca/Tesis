import { afterEach, describe, expect, it, vi } from "vitest";
import { intervalosHastaHoraEcuador, sincronizarRelojHistorico } from "../utilidades/reloj_historico";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("histórico sincronizado con el reloj de Ecuador", () => {
  it("ignora el año y revela solo hasta el último intervalo de cinco minutos", () => {
    expect(intervalosHastaHoraEcuador(new Date("2026-10-30T17:03:00-05:00"))).toBe(205);
    expect(intervalosHastaHoraEcuador(new Date("2025-06-30T17:03:00-05:00"))).toBe(205);
    expect(intervalosHastaHoraEcuador(new Date("2026-10-30T17:05:00-05:00"))).toBe(206);
    expect(intervalosHastaHoraEcuador(new Date("2026-10-31T00:00:00-05:00"))).toBe(1);
    expect(intervalosHastaHoraEcuador(new Date("2026-10-30T23:59:00-05:00"))).toBe(288);
  });
  it("actualiza al abrir, al límite del reloj y al volver; cancela al desmontar", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-30T17:03:00-05:00"));
    const doc = new EventTarget();
    Object.assign(doc, { visibilityState: "visible" });
    vi.stubGlobal("document", doc);
    const actualizar = vi.fn();
    const detener = sincronizarRelojHistorico(actualizar);
    expect(actualizar).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(119999);
    expect(actualizar).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(actualizar).toHaveBeenCalledTimes(2);
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(actualizar).toHaveBeenCalledTimes(3);
    detener();
    vi.advanceTimersByTime(300000);
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(actualizar).toHaveBeenCalledTimes(3);
  });
});
