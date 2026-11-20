import { Fragment } from "react";

function enfasis(texto: string) {
  return texto.split(/(\*\*[^*]+\*\*)/g).map((parte, i) =>
    parte.startsWith("**") && parte.endsWith("**")
      ? <strong key={i}>{parte.slice(2, -2)}</strong>
      : <Fragment key={i}>{parte}</Fragment>);
}

// Se representa como texto React, sin interpretar HTML proveniente del modelo.
export function TextoInterpretacion({ texto }: { texto: string }) {
  const lineas = texto.replace(/\r\n/g, "\n").split("\n");
  const bloques: { tipo: "lista" | "parrafo"; lineas: string[] }[] = [];
  for (const linea of lineas) {
    const limpia = linea.trim();
    if (!limpia) continue;
    const esLista = /^[-*•]\s+/.test(limpia);
    if (esLista && bloques.at(-1)?.tipo === "lista") bloques.at(-1)!.lineas.push(limpia.replace(/^[-*•]\s+/, ""));
    else bloques.push({ tipo: esLista ? "lista" : "parrafo", lineas: [limpia.replace(esLista ? /^[-*•]\s+/ : /^#{1,4}\s+/, "")] });
  }
  return <div className="texto-interpretacion">{bloques.map((bloque, i) => bloque.tipo === "lista"
    ? <ul key={i}>{bloque.lineas.map((linea, j) => <li key={j}>{enfasis(linea)}</li>)}</ul>
    : <p key={i}>{enfasis(bloque.lineas[0])}</p>)}</div>;
}
