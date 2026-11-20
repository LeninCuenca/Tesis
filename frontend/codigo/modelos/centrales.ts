export type CentralSolar = {
  id: string;
  nombre: string;
  ubicacion: string;
  fuenteId: number;
  desfaseDias: number;
  demostracion: boolean;
};

export const CENTRAL_PRINCIPAL: CentralSolar = {
  id: "edificio-central", nombre: "Edificio Central UTPL", ubicacion: "Loja, Ecuador",
  fuenteId: 1, desfaseDias: 0, demostracion: false,
};

// Escenarios de interfaz. No representan instalaciones ni mediciones adicionales.
export const CENTRALES: CentralSolar[] = [CENTRAL_PRINCIPAL, ...Array.from({ length: 5 }, (_, indice) => ({
  id: `central-demo-${indice + 2}`, nombre: `Central solar ${indice + 2}`,
  ubicacion: "Ubicación por confirmar", fuenteId: 1, desfaseDias: (indice + 1) * 7, demostracion: true,
}))];

export function desplazarFecha(fecha: string, dias: number): string {
  return new Date(Date.parse(fecha) - dias * 86_400_000).toISOString();
}

export function procedenciaCentral(central: CentralSolar) {
  return {
    central_vista: central.nombre,
    modo_datos: central.demostracion ? "demostracion_historica" : "historico_medido",
    central_fuente_id: central.fuenteId,
    central_fuente: "Edificio Central UTPL",
    desfase_dias: central.desfaseDias,
  };
}
