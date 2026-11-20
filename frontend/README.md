# Frontend Solaris UTPL

Interfaz React + TypeScript + Vite, con gráficos Apache ECharts y organización MVC adaptada a React.

- `codigo/modelos`: contratos de energía, predicción y evaluación.
- `codigo/controladores`: hooks para consultas, estados y acciones.
- `codigo/vistas`: panel principal y componentes visuales.
- `codigo/servicios`: consultas a Supabase y solicitudes a la API Python.
- `codigo/configuracion`: cliente público de Supabase y tema de gráficos.
- `codigo/estilos`, `codigo/utilidades`, `codigo/recursos` y `codigo/pruebas`: archivos de apoyo.
- `publico`: archivos estáticos servidos por Vite.

La primera instalación del frontend se realiza desde la raíz del proyecto:

```bash
npm ci --prefix frontend
```

Después, ejecuta `npm run dev` desde la raíz o directamente desde `frontend`. En ambos casos se inician la API y la interfaz; el entorno Python y el modelo deben estar disponibles según las instrucciones del README principal.

Abrir `http://127.0.0.1:5176`. Ctrl+C detiene ambos servicios. Vite reenvía `/api` a `http://127.0.0.1:8000`.

Copiar `.env.example` a `.env.local` dentro de `frontend` y configurar las variables públicas de Supabase. Las credenciales privadas quedan fuera de las variables `VITE_`.

Desde la raíz, `npm test`, `npm run lint` y `npm run build` verifican la interfaz. Consultar `../ESTRUCTURA.md` para la estructura completa.

## Actualización automática

El panel vuelve a consultar Supabase cada cinco minutos y recupera la consulta al regresar a una pestaña suspendida. Durante las actualizaciones mantiene visibles los datos anteriores y evita consultas simultáneas del mismo panel. Si falla una consulta, conserva los resultados y reintenta en el siguiente ciclo.

La pantalla distingue la hora de la última consulta correcta de la fecha de la última medición almacenada. Para ver mediciones nuevas, la fuente debe incorporar registros en Supabase y actualizar sus resúmenes diarios; esta función no genera datos ni simula sensores. La predicción y la evaluación del modelo conservan su flujo de consulta independiente.

## Selector de variables de la tesis

En **Variables** se pueden elegir una o varias de las 16 magnitudes identificadas: tensiones y corrientes AC por fase, tensiones y corrientes DC por MPP, factor de potencia, irradiancia, temperaturas, producción y consumo. La selección aplica a valores, gráficos, tabla y CSV.

El periodo de 1, 7 o 30 días se cuenta desde la última medición disponible. Las consultas recuperan todas las páginas de Supabase y se cancelan al cambiar de selección o periodo. Las curvas separan categorías y unidades, mantienen los faltantes como huecos y no interpolan. El supuesto energético de Wh por intervalo se mantiene identificado. La tabla presenta los últimos 100 registros y el CSV incluye todo el periodo seleccionado.

El panel vuelve a consultar las variables cuando termina la actualización general de cinco minutos. Humedad, viento, frecuencia y estado del inversor quedan pendientes de canales identificados; no se generan valores para estas magnitudes.

## Seis centrales en la interfaz

El selector contiene el Edificio Central UTPL y cinco centrales de demostración con nombres provisionales. Supabase mantiene una sola central real registrada; las demostraciones son escenarios del frontend y no insertan ni alteran mediciones o centrales en la base de datos.

`codigo/modelos/centrales.ts` define cada escenario y su procedencia. Las centrales 2 a 6 usan ventanas históricas del Edificio Central desplazadas 7, 14, 21, 28 y 35 días, respectivamente. Se conservan las fechas y los valores originales. Los resúmenes, las últimas lecturas, las variables, las tablas y los CSV aplican la ventana elegida. Los CSV incorporan nombre de la vista, modo demostración, central de origen y desfase en días.

El aviso de demostración aparece en todas las vistas de esas cinco centrales. El modelo predictivo y la evaluación física existente solo corresponden al Edificio Central; las demostraciones no publican esas métricas como propias. La actualización periódica conserva la selección y el desfase. Para conectar centrales reales, registrar sus datos y sustituir los escenarios por sus identificadores verificados.

## Espacio de Variables compacto

En escritorio, la selección ocupa una columna lateral con búsqueda, filtros y lista de altura limitada; la gráfica aparece a su derecha. Los botones de unidades permiten cambiar la curva visible sin mezclar magnitudes incompatibles. Las últimas lecturas y la tabla están en desplegables. En móvil, los controles se abren mediante «Elegir» y se cierran para dejar espacio a la gráfica.

## Resumen de las seis plantas

La vista Resumen presenta exclusivamente una cuadrícula de seis gráficas de generación y consumo diarios. Los indicadores, el panel de cobertura, las lecturas meteorológicas y el acceso promocional a la predicción permanecen fuera de esta vista. Cada gráfica identifica la planta, las fechas originales y el modo histórico o demostración. El selector temporal aplica a todas y las consultas se actualizan cada cinco minutos. Una sola lectura de los resúmenes de la fuente recupera todas las ventanas de demostración, con huecos preservados.

## Predicción y seguimiento cada cinco minutos

La pestaña inicial **Seguimiento 5 min** abre la reproducción histórica identificada y comienza automáticamente su avance cada cinco minutos. La gráfica superior muestra únicamente la predicción completa en azul. La inferior muestra las mediciones progresivas en naranja, con la misma unidad y escala. El modo **Seguimiento de Supabase** permite comparar la previsión fija con las mediciones almacenadas, alineadas por el mismo instante ISO. Se consulta cada cinco minutos y no se recalcula la curva prevista durante el seguimiento. Los intervalos pendientes y los valores inválidos permanecen ausentes. Las fechas de la fuente deben tener su convención temporal correctamente identificada para una comparación operativa.

La segunda gráfica muestra los valores de cada intervalo recibido, sin acumularlos; los intervalos pendientes permanecen vacíos. Los indicadores muestran energía medida, prevista parcial, relación medida/prevista y MAE parcial. La relación no es una medida de precisión y puede superar el 100 %. La tabla y el CSV identifican el modo y las unidades.

**Histórico con la hora actual** permite comprobar el avance sin una fuente de sensores conectada. Usa un día completo de prueba del repositorio local, posterior a entrenamiento y calibración; el perfil meteorológico del escenario utiliza únicamente antecedentes anteriores al día reproducido. No usa la temperatura medida del día para producir la curva prevista y no inserta datos en Supabase. Al abrir muestra las lecturas hasta la hora actual de Ecuador; «Sincronizar con hora actual» reanuda el reloj después de pausarlo, «Pausar» detiene el avance y los controles manuales permiten inspeccionar cualquier tramo. La curva prevista se mantiene fija.

Se conservan las pestañas del escenario de 24 horas, la comparación reservada del modelo y las métricas de evaluación. Estas métricas no se mezclan con el error parcial del seguimiento.

La reproducción histórica se sincroniza con la hora actual de America/Guayaquil, independientemente del año del registro. Revela marcas hasta el último múltiplo de cinco minutos (17:03 → 17:00), se actualiza en límites de cinco minutos y recupera el reloj al volver a la pestaña. A medianoche repite el mismo día histórico. La navegación manual pausa el reloj; «Sincronizar con hora actual» lo reanuda. Las fechas originales y Supabase no se modifican.
