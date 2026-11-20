import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import net from "node:net";
import { setTimeout as esperar } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const python = path.join(raiz, ".venv-linux/bin/python");
const vite = path.join(raiz, "frontend/node_modules/.bin/vite");
const hijos = new Set();
let cerrando = false;

async function comprobarArchivo(archivo, instrucciones) {
  try { await access(archivo, constants.X_OK); }
  catch { throw new Error(instrucciones); }
}
async function comprobarPuerto(puerto) {
  await new Promise((resolve, reject) => {
    const servidor = net.createServer();
    servidor.once("error", error => reject(new Error(`El puerto ${puerto} ya está en uso. Si Solaris ya está funcionando, abre http://127.0.0.1:5176. Si necesitas reiniciarlo, detén su terminal anterior con Ctrl+C y vuelve a ejecutar npm run dev.`)));
    servidor.listen(puerto, "127.0.0.1", () => servidor.close(resolve));
  });
}
async function variableEntorno(nombre, predeterminado = "") {
  if (process.env[nombre]) return process.env[nombre];
  try {
    const lineas = (await readFile(path.join(raiz, "backend/.env"), "utf8")).split(/\r?\n/);
    const linea = lineas.find(x => x.trimStart().startsWith(`${nombre}=`));
    if (linea) return linea.slice(linea.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "");
  } catch {}
  return predeterminado;
}
async function consultarEtiquetasOllama(host) {
  try {
    const respuesta = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(1200) });
    if (!respuesta.ok) return null;
    return await respuesta.json();
  } catch { return null; }
}
async function asegurarOllama() {
  if (await variableEntorno("PROVEEDOR_IA", "ollama") !== "ollama") return;
  const host = (await variableEntorno("OLLAMA_HOST", "http://127.0.0.1:11434")).replace(/\/$/, "");
  const modelo = await variableEntorno("OLLAMA_MODEL", "llama3:latest");
  const url = new URL(host);
  const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  let etiquetas = await consultarEtiquetasOllama(host);
  if (!etiquetas && loopback) {
    console.log("Iniciando Ollama local…");
    iniciar("ollama", ["serve"], raiz, "Ollama");
    for (let intento = 0; intento < 30 && !cerrando; intento++) {
      await esperar(500);
      etiquetas = await consultarEtiquetasOllama(host);
      if (etiquetas) break;
    }
  }
  if (!etiquetas) throw new Error(`Ollama no responde en ${host}. Instálalo o inicia su servicio; luego vuelve a ejecutar npm run dev.`);
  const modelos = (etiquetas.models || []).map(item => item.name);
  if (!modelos.includes(modelo)) throw new Error(`Ollama está activo, pero falta el modelo ${modelo}. Descárgalo una vez con: ollama pull ${modelo}`);
  console.log(`Ollama listo · ${modelo}${loopback ? " (local)" : " (host configurado)"}.`);
}
function iniciar(comando, argumentos, cwd, nombre) {
  const hijo = spawn(comando, argumentos, { cwd, stdio: "inherit" });
  hijos.add(hijo);
  hijo.once("error", error => {
    console.error(`No se pudo iniciar ${nombre}: ${error.message}`);
    cerrar(1);
  });
  hijo.once("exit", (codigo, señal) => {
    hijos.delete(hijo);
    if (!cerrando) {
      console.error(`${nombre} se detuvo (${señal ?? codigo}). Cerrando el proyecto.`);
      cerrar(codigo || 1);
    }
  });
  return hijo;
}
function cerrar(codigo) {
  if (cerrando) return;
  cerrando = true;
  for (const hijo of hijos) hijo.kill("SIGTERM");
  const salida = setTimeout(() => {
    for (const hijo of hijos) hijo.kill("SIGKILL");
    process.exit(codigo);
  }, 3000);
  salida.unref();
  if (!hijos.size) process.exit(codigo);
  else Promise.all([...hijos].map(hijo => new Promise(resolve => hijo.once("exit", resolve)))).then(() => process.exit(codigo));
}
process.on("SIGINT", () => { console.log("\nCerrando interfaz y API…"); cerrar(0); });
process.on("SIGTERM", () => cerrar(0));

try {
  await comprobarArchivo(python, "Falta el entorno Python. Ejecuta: python -m venv .venv-linux && .venv-linux/bin/python -m pip install -r backend/requirements.txt");
  await comprobarArchivo(vite, "Faltan las dependencias del frontend. Ejecuta: npm ci --prefix frontend");
  await comprobarPuerto(8000);
  await comprobarPuerto(5176);
  await asegurarOllama();
  console.log("Iniciando API predictiva…");
  iniciar(python, ["-u", "-m", "backend.servidor"], raiz, "La API");
  let lista = false;
  for (let intento = 0; intento < 60 && !cerrando; intento++) {
    try {
      const respuesta = await fetch("http://127.0.0.1:8000/health", { signal: AbortSignal.timeout(1000) });
      if (respuesta.ok && (await respuesta.json()).status === "ready") { lista = true; break; }
      if (respuesta.status >= 500) throw new Error("La API no pudo cargar el modelo; revisa el mensaje del servidor y los artefactos.");
    } catch (error) {
      if (error.message?.startsWith("La API no pudo")) throw error;
    }
    await esperar(500);
  }
  if (!lista) throw new Error("La API no respondió a tiempo. Revisa que el modelo predictivo y sus dependencias estén instalados.");
  console.log("API lista. Iniciando interfaz…");
  iniciar(vite, ["--host", "127.0.0.1", "--port", "5176", "--strictPort"], path.join(raiz, "frontend"), "La interfaz");
  console.log("Abre http://127.0.0.1:5176 · Ctrl+C detiene ambos servicios.");
} catch (error) {
  console.error(error.message);
  cerrar(1);
}
