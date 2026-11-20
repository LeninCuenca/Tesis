import { AsistenteIA } from "./AsistenteIA";
import { contextoVariables } from "../../modelos/contexto_asistente";
import { consultarVariables } from "../../servicios/servicio_variables";
import type { CentralSolar } from "../../modelos/centrales";
import { useState } from "react";
import { Check, Download, Search, SlidersHorizontal, X, RotateCcw, ChevronDown } from "lucide-react";
import type { EChartsOption } from "echarts";
import type { Period } from "../../modelos/energia";
import { CATEGORIAS, VARIABLES, SELECCION_INICIAL, puntosVariable } from "../../modelos/variables";
import { useControladorVariables } from "../../controladores/controlador_variables";
import { chartBase } from "../../configuracion/tema_graficos";
import { GraficoSolar } from "./GraficoSolar";

const fecha = (valor: string | number) => new Date(valor).toLocaleString("es-EC", { timeZone: "America/Guayaquil", hour12: false });
const numero = (valor: number | null | undefined) => valor == null ? "—" : valor.toLocaleString("es-EC", { maximumFractionDigits: 2 });

export function ExploradorVariables({ periodo, actualizacion, central }: { periodo: Period; actualizacion?: number; central: CentralSolar }) {
  const { seleccion, setSeleccion, variables, alternar, datos, cargando, error, exportar, reintentar } = useControladorVariables(periodo, actualizacion, central);
  const grupos = [...new Set(variables.map((v) => `${v.categoria}|${v.unidad}`))];
  const ultima = datos?.lecturas.at(-1);
  const [categoria, setCategoria] = useState("Todas");
  const [busqueda, setBusqueda] = useState("");
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [grupoActivo, setGrupoActivo] = useState("");
  const grupoActual = grupos.includes(grupoActivo) ? grupoActivo : grupos[0];
  const normalizar = (texto: string) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const visibles = VARIABLES.filter((v) => (categoria === "Todas" || v.categoria === categoria) && normalizar(`${v.nombre} ${v.unidad}`).includes(normalizar(busqueda)));
  const perfiles = [
    { nombre: "Clima y generación", codigos: SELECCION_INICIAL },
    { nombre: "Producción y consumo", codigos: VARIABLES.filter((v) => v.categoria === "Energéticas").map((v) => v.codigo) },
    { nombre: "Circuito AC", codigos: VARIABLES.filter((v) => v.categoria === "Eléctricas AC").map((v) => v.codigo) },
    { nombre: "Circuito DC", codigos: VARIABLES.filter((v) => v.categoria === "Eléctricas DC").map((v) => v.codigo) },
  ];
  const horasConsumo = Array.from({ length: 24 }, () => ({ suma: 0, cantidad: 0 }));
  if (seleccion.includes("consumo")) datos?.lecturas.forEach((lectura) => {
    const valor = lectura.valores.consumo;
    if (valor == null || !Number.isFinite(valor) || valor < 0) return;
    const hora = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Guayaquil", hour: "2-digit", hourCycle: "h23" }).format(new Date(lectura.fecha)));
    horasConsumo[hora].suma += valor;
    horasConsumo[hora].cantidad++;
  });
  const patronConsumo: EChartsOption = {
    ...chartBase, grid: { left: 65, right: 20, top: 50, bottom: 40 },
    tooltip: { trigger: "axis", valueFormatter: (valor) => valor == null ? "Sin datos" : `${Number(valor).toLocaleString("es-EC", { maximumFractionDigits: 2 })} Wh / 5 min` },
    xAxis: { type: "category", data: horasConsumo.map((_, hora) => `${String(hora).padStart(2, "0")}:00`), axisLabel: { hideOverlap: true } },
    yAxis: { type: "value", name: "Wh / 5 min", min: 0 },
    series: [{ name: "Consumo medio", type: "bar", itemStyle: { color: "#df8a18" }, data: horasConsumo.map(h => h.cantidad ? h.suma / h.cantidad : null) }],
  };
  return (
    <div className="espacio-variables">
      <section className={`selector-variables ${selectorAbierto ? "selector-abierto" : ""}`} aria-labelledby="titulo-selector-variables">
        <div className="cabecera-selector">
          <div className="titulo-selector"><span className="simbolo-selector"><SlidersHorizontal size={20} /></span><div>
            <h2 id="titulo-selector-variables">Variables</h2>
            <p>{variables.length} seleccionadas</p>
          </div></div>
          <button className="alternar-selector" aria-expanded={selectorAbierto} aria-controls="controles-variables" onClick={() => setSelectorAbierto((abierto) => !abierto)}>{selectorAbierto ? "Cerrar" : "Elegir"}<ChevronDown size={16} /></button>
        </div>
        <div className="contenido-selector" id="controles-variables">
        <label className="perfil-compacto">Selección rápida
          <select aria-label="Selección rápida de variables" value={perfiles.find((perfil) => perfil.codigos.length === seleccion.length && perfil.codigos.every((codigo) => seleccion.includes(codigo)))?.nombre ?? ""} onChange={(event) => {
            const perfil = perfiles.find((item) => item.nombre === event.target.value);
            if (!perfil) return;
            setSeleccion([...perfil.codigos]); setBusqueda("");
            setCategoria(perfil.nombre === "Circuito AC" ? "Eléctricas AC" : perfil.nombre === "Circuito DC" ? "Eléctricas DC" : "Todas");
          }}>
            <option value="" disabled>Selección personalizada</option>
            {perfiles.map((perfil) => <option key={perfil.nombre} value={perfil.nombre}>{perfil.nombre}</option>)}
          </select>
        </label>
        <div className="herramientas-selector">
          <select aria-label="Filtrar variables por categoría" value={categoria} onChange={(event) => setCategoria(event.target.value)}>
            {["Todas", ...CATEGORIAS].map((c) => <option key={c} value={c}>{c} ({c === "Todas" ? VARIABLES.length : VARIABLES.filter((v) => v.categoria === c).length})</option>)}
          </select>
          <label className="buscar-variable"><Search size={15} /><input type="search" aria-label="Buscar variable" placeholder="Buscar variable…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} /></label>
        </div>
        <div className="lista-variables" role="group" aria-label="Variables disponibles">
          {visibles.map((v) => <label className={`opcion-variable ${seleccion.includes(v.codigo) ? "variable-elegida" : ""}`} key={v.codigo}>
            <input type="checkbox" checked={seleccion.includes(v.codigo)} onChange={() => alternar(v.codigo)} />
            <span className="marca-variable" aria-hidden="true">{seleccion.includes(v.codigo) && <Check size={13} strokeWidth={3} />}</span>
            <span className="nombre-variable">{v.nombre}</span><small>{v.unidad}</small>
          </label>)}
          {!visibles.length && <p className="sin-coincidencias">No hay coincidencias. Prueba con tensión, temperatura o corriente.</p>}
        </div>
        <div className="seleccion-variables">
          <div className="resumen-seleccion"><strong>{variables.length} seleccionadas</strong><button onClick={() => setSeleccion([])} disabled={!seleccion.length}><RotateCcw size={13} />Limpiar</button><button onClick={() => setSeleccion(VARIABLES.map((v) => v.codigo))} disabled={seleccion.length === VARIABLES.length}>Elegir todas</button></div>
          <div className="etiquetas-variables">{variables.map((v) => <button key={v.codigo} onClick={() => alternar(v.codigo)} aria-label={`Quitar ${v.nombre}`}>{v.nombre}<X size={12} /></button>)}{!variables.length && <span>Tu selección aparecerá aquí.</span>}</div>
        </div>
        <details className="nota-catalogo"><summary>Acerca de las variables disponibles</summary><p>Se muestran los canales identificados en la base de datos de la tesis. Humedad, viento, frecuencia y estado del inversor requieren canales identificados antes de incorporarse.</p></details>
        </div>
      </section>
      <section className="resultados-variables" aria-label="Gráficos y datos seleccionados">
        <AsistenteIA key={central.id + periodo} ejemplo="¿A qué hora hubo más consumo?" obtenerContexto={async () => contextoVariables(await consultarVariables(periodo, VARIABLES.map(v => v.codigo), new AbortController().signal, central), central)} />
        <div className="barra-resultados"><h2>Evolución de las señales</h2><button className="outline-button" onClick={exportar} disabled={!datos?.lecturas.length || !variables.length}><Download size={15} />CSV</button></div>
      {!variables.length && <p className="notice" role="status">Elige al menos una variable para ver sus datos.</p>}
      {!!variables.length && <>
        {cargando && <p className="notice" role="status">Consultando las variables seleccionadas…</p>}
        {error && <div className="notice" role="alert"><p>{error} {datos ? "Se conservan los resultados de la consulta anterior." : ""}</p><button className="outline-button" onClick={reintentar}>Reintentar</button></div>}
        {!cargando && !error && datos && !datos.lecturas.length && <p className="notice" role="status">No hay mediciones disponibles para esta consulta.</p>}
        {datos && datos.lecturas.length > 0 && <>
          <div className="contexto-variables"><span><i />{datos.lecturas.length.toLocaleString("es-EC")} registros consultados</span><span>{datos.inicio && fecha(datos.inicio)} — {datos.fin && fecha(datos.fin)}</span><small>Hora de Ecuador · periodo desde la última medición</small></div>
          <div className="grupos-grafico" role="group" aria-label="Elegir gráfico por unidad">
            {grupos.map((grupo) => <button key={grupo} aria-pressed={grupo === grupoActual} onClick={() => setGrupoActivo(grupo)}>{grupo.replace("|", " · ")}</button>)}
          </div>
          <div className="graficos-variables">{grupos.filter((grupo) => grupo === grupoActual).map((grupo) => {
            const [categoria, unidad] = grupo.split("|");
            const mismasUnidades = variables.filter((v) => v.categoria === categoria && v.unidad === unidad);
            const option: EChartsOption = {
              ...chartBase,
              useUTC: true,
              grid: { left: 55, right: 16, top: 50, bottom: 65 },
              tooltip: { trigger: "axis", valueFormatter: (valor) => `${valor == null ? "Sin dato" : valor} ${unidad}` },
              xAxis: { type: "time", axisLabel: { hideOverlap: true, formatter: (valor: number) => new Date(valor).toLocaleString("es-EC", { timeZone: "America/Guayaquil", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) }, axisPointer: { label: { formatter: (parametros) => fecha(Number(parametros.value)) } } },
              yAxis: { type: "value", name: unidad, scale: true },
              dataZoom: [{ type: "inside" }, { type: "slider", bottom: 15, height: 20, labelFormatter: (valor: number) => fecha(valor) }],
              series: mismasUnidades.map((v) => ({ name: v.nombre, type: "line", smooth: false, showSymbol: false, connectNulls: false, data: puntosVariable(datos.lecturas, v.codigo) })),
            };
            return <section className="panel grafico-variable" key={grupo}>
              <div className="titulo-grafico-variable"><h2>{categoria}</h2><span>{unidad}</span></div>
              <p className="chart-description">{mismasUnidades.map((v) => v.nombre).join(" · ")}</p>
              <GraficoSolar option={option} label={`Evolución de ${mismasUnidades.map((v) => v.nombre).join(", ")} en ${unidad}, hora de Ecuador`} />
            </section>;
          })}</div>
          {seleccion.includes("consumo") && <section className="panel grafico-variable">
            <h2>Patrón de consumo por hora</h2>
            <p className="chart-description">Promedio de las lecturas disponibles de cada hora durante el periodo seleccionado, en Wh por intervalo de cinco minutos. Las horas sin lecturas quedan vacías. Hora de Ecuador.</p>
            {horasConsumo.some(h => h.cantidad) ? <GraficoSolar option={patronConsumo} label="Consumo medio por intervalo de cinco minutos, agrupado por hora del día" /> : <p className="notice">No hay lecturas válidas de consumo en este periodo.</p>}
          </section>}
          <p className="ayuda-graficos">Acerca el gráfico para explorar cada intervalo. Los cortes en las curvas representan datos ausentes.</p>
          <details className="panel detalle-lecturas"><summary>Últimos valores de las {variables.length} variables</summary>
          <section className="variable-grid lecturas-variables" aria-label="Últimos valores de las variables seleccionadas">
            {variables.map((v) => <article className="panel variable-card" key={v.codigo}>
              <span>{v.nombre}</span>
              <strong>{numero(ultima?.valores[v.codigo])} <small>{v.unidad}</small></strong>
              <p>{v.categoria} · {ultima && fecha(ultima.fecha)}</p>
              {ultima?.valores[v.codigo] == null && <small>Sin dato en el último registro</small>}
              {v.codigo === "factor_potencia" && ultima?.valores[v.codigo] != null && Math.abs(ultima.valores[v.codigo]!) > 1 && <small className="invalid-reading">Fuera del rango físico: revisar sensor o escala</small>}
            </article>)}
          </section>
          </details>
          <details className="panel data-table">
            <summary>Ver tabla de las variables seleccionadas</summary>
            <p className="chart-description">Últimos {Math.min(100, datos.lecturas.length)} registros. El CSV incluye todo el periodo consultado; un guion representa un dato ausente.</p>
            <div className="table-scroll"><table>
              <caption>Mediciones seleccionadas · hora de Ecuador</caption>
              <thead><tr><th>Fecha y hora</th>{variables.map((v) => <th key={v.codigo}>{v.nombre} ({v.unidad})</th>)}</tr></thead>
              <tbody>{datos.lecturas.slice(-100).map((lectura) => <tr key={lectura.fecha}><th scope="row">{fecha(lectura.fecha)}</th>{variables.map((v) => <td key={v.codigo}>{numero(lectura.valores[v.codigo])}</td>)}</tr>)}</tbody>
            </table></div>
          </details>
        </>}
        <p className="engineering-note">Las magnitudes AC y DC y las unidades se presentan por separado. La energía conserva el supuesto documentado de Wh por intervalo de cinco minutos; no se convierte en potencia instantánea. Los faltantes permanecen ausentes.</p>
      </>}
      </section>
    </div>
  );
}
