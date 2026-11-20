import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { programarActualizacion } from "../utilidades/actualizacion_periodica";

let pestaña: EventTarget & { visibilityState: string };
let detener: (() => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  pestaña = Object.assign(new EventTarget(), { visibilityState: "visible" });
  vi.stubGlobal("document", pestaña);
});
afterEach(() => {
  detener?.();
  detener = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("actualización de las mediciones", () => {
  it("consulta cada cinco minutos sin disparar otra carga inicial", () => {
    const consultar = vi.fn();
    detener = programarActualizacion(consultar);
    vi.advanceTimersByTime(299_999);
    expect(consultar).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(consultar).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(300_000);
    expect(consultar).toHaveBeenCalledTimes(2);
  });

  it("consulta al regresar después de una suspensión del navegador", () => {
    const consultar = vi.fn();
    detener = programarActualizacion(consultar);
    // Avanza el reloj sin ejecutar temporizadores, como una pestaña suspendida.
    vi.setSystemTime(Date.now() + 600_000);
    pestaña.visibilityState = "hidden";
    pestaña.dispatchEvent(new Event("visibilitychange"));
    expect(consultar).not.toHaveBeenCalled();
    pestaña.visibilityState = "visible";
    pestaña.dispatchEvent(new Event("visibilitychange"));
    expect(consultar).toHaveBeenCalledTimes(1);
    pestaña.dispatchEvent(new Event("visibilitychange"));
    expect(consultar).toHaveBeenCalledTimes(1);
  });

  it("no vuelve a consultar por cambiar de pestaña antes de cinco minutos", () => {
    const consultar = vi.fn();
    detener = programarActualizacion(consultar);
    vi.advanceTimersByTime(60_000);
    pestaña.dispatchEvent(new Event("visibilitychange"));
    expect(consultar).not.toHaveBeenCalled();
  });

  it("retira el temporizador y el evento al desmontar o cambiar de periodo", () => {
    const consultar = vi.fn();
    detener = programarActualizacion(consultar);
    detener();
    vi.advanceTimersByTime(600_000);
    pestaña.dispatchEvent(new Event("visibilitychange"));
    expect(consultar).not.toHaveBeenCalled();
  });
});
