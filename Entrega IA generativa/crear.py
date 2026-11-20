from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.units import cm
from xml.sax.saxutils import escape
import os
D=os.path.dirname(os.path.abspath(__file__))
pdfmetrics.registerFont(TTFont('DejaVu','/usr/share/fonts/noto/NotoSans-Regular.ttf'))
pdfmetrics.registerFont(TTFont('DejaVu-Bold','/usr/share/fonts/noto/NotoSans-Bold.ttf'))
styles=getSampleStyleSheet(); styles.add(ParagraphStyle(name='BodyX',fontName='DejaVu',fontSize=9.3,leading=14,spaceAfter=8,alignment=TA_JUSTIFY)); styles.add(ParagraphStyle(name='TitleX',fontName='DejaVu-Bold',fontSize=17,leading=22,textColor=colors.HexColor('#123c53'),spaceAfter=12)); styles.add(ParagraphStyle(name='HeadX',fontName='DejaVu-Bold',fontSize=11,leading=15,textColor=colors.HexColor('#12606a'),spaceBefore=8,spaceAfter=6)); styles.add(ParagraphStyle(name='RefX',fontName='DejaVu',fontSize=8,leading=12,leftIndent=15,firstLineIndent=-15,spaceAfter=7,wordWrap='CJK'))
def p(t,style='BodyX'): return Paragraph(t,styles[style])
def footer(c,doc):
 c.setFont('DejaVu',8); c.setFillColor(colors.HexColor('#65777c')); c.drawString(2*cm,1.25*cm,'UTPL · Tecnologías emergentes · Unidad 5'); c.drawRightString(A4[0]-2*cm,1.25*cm,str(doc.page))
doc=SimpleDocTemplate(D+'/Trabajo_IA_generativa_Solaris.pdf',pagesize=A4,rightMargin=2*cm,leftMargin=2*cm,topMargin=1.7*cm,bottomMargin=1.8*cm)
s=[]
def title(t):s.append(p(t,'TitleX'))
def h(t):s.append(p(t,'HeadX'))
def b(t):s.append(p(t))
def page():s.append(PageBreak())
title('Informes fotovoltaicos con IA generativa y recuperación de evidencia')
b('<b>Autor:</b> Lenin Andrés Cuenca Cuenca &nbsp;&nbsp; | &nbsp;&nbsp; <b>Contexto:</b> tesis Solaris UTPL &nbsp;&nbsp; | &nbsp;&nbsp; 16 de noviembre de 2026')
h('1. Investigación: generación aumentada por recuperación (RAG)')
b('La generación aumentada por recuperación (RAG) combina un buscador con una IA capaz de redactar. Antes de escribir, el sistema localiza fragmentos de documentos o registros pertinentes y los entrega como contexto al modelo. Así puede preparar un informe apoyado en información del proyecto que no estaba en su entrenamiento. Es útil cuando la documentación cambia y se necesita revisar la fuente; citar una fuente, sin embargo, no garantiza que la interpretación sea correcta (Lewis et al., 2020; Amazon Web Services [AWS], s. f.-a).')
h('Modelo y funcionamiento')
b('RAG es una arquitectura, no un modelo generativo por sí mismo. Una implementación puede combinar un recuperador de texto y un modelo de lenguaje basado en <i>transformers</i>. El recuperador convierte fragmentos y consultas en representaciones numéricas y busca los más cercanos; también puede emplear búsqueda por palabras. El modelo usa atención para relacionar el contexto recibido y genera texto token por token. La base documental puede actualizarse sin reentrenar el generador. Lewis et al. (2020) probaron una combinación de índice denso y generador secuencia a secuencia; el resultado depende tanto de la recuperación como de la redacción.')
h('Dos aplicaciones reales')
b('<b>Ring:</b> su sistema de soporte multirregional utiliza Bedrock Knowledge Bases para recuperar documentación y generar respuestas. AWS y Ring informan una reducción del 21 % en el costo de ampliación por región adicional frente a despliegues regionales separados, no una reducción general del servicio (Jagadesan et al., 2026).')
b('<b>TP ICAP:</b> ClientIQ combina RAG y consultas a datos estructurados para analizar registros de reuniones y CRM. Sus autores describen una solución preparada para producción y una reducción de horas de análisis manual a segundos; son resultados comunicados por el proveedor y el cliente, no una evaluación independiente (Ashworth &amp; Tzeelaka, 2025).')
page(); title('Tendencias y ciclo de expectativas')
h('Dos tendencias con evidencia')
b('<b>1. Recuperación multimodal.</b> AWS incorporó recuperación sobre audio y video además de texto e imágenes en Bedrock Knowledge Bases (Mitchell et al., 2026). Para Solaris permitiría, en el futuro, relacionar fichas, diagramas y registros de mantenimiento; procesar imágenes no asegura interpretar correctamente un esquema eléctrico.')
b('<b>2. Recuperación iterativa y agentes.</b> AWS documenta recuperación agéntica que divide consultas, busca iterativamente y evalúa si encontró información suficiente (AWS, s. f.-b). La tendencia aporta a preguntas que requieren varias fuentes, pero aumenta la complejidad y exige medir trazabilidad, costo y errores.')
h('Ubicación argumentada: valle de desilusión')
b('Propongo situar <b>RAG empresarial en el valle de desilusión</b>, como inferencia para esta línea, no como una clasificación específica publicada por Gartner. Gartner (2026) sitúa la IA generativa general en ese valle; esa categoría es más amplia que RAG. Hay adopción y beneficios, pero también dificultades para demostrar valor y controlar respuestas. No se puede concluir que todas las aplicaciones RAG estén en la misma fase.')
b('<b>Quién la usa:</b> Ring y TP ICAP describen implementaciones concretas. <b>Quién paga:</b> las organizaciones que consumen infraestructura y modelos de Bedrock asumen cargos de uso; AWS publica cobros por modelos, almacenamiento y servicios asociados. No se dispone de facturas de Ring o TP ICAP, por lo que no se afirma un monto ni un contrato específico (AWS, s. f.-c). <b>Qué mejora:</b> Ring comunica 21 % menos costo por región adicional y TP ICAP reporta menor tiempo de análisis. Estas cifras corresponden a sus contextos y no predicen el impacto en la UTPL.')
h('Alcance de la tesis')
b('Solaris UTPL ya integra visualización de mediciones y un modelo predictivo seleccionado por validación cronológica. El informe de reentrenamiento del 30 de octubre de 2026 identifica HistGradientBoosting y un MAE de 44,07 Wh por intervalo de cinco minutos en prueba. La evaluación usa meteorología observada: no demuestra por sí sola la precisión de un pronóstico meteorológico futuro. Ese modelo predictivo no es el componente generativo propuesto (Cuenca Cuenca, 2026).')
page(); title('2. Propuesta para la UTPL')
h('Problema y costo de no resolverlo')
b('El personal que analiza las centrales solares debe relacionar gráficos, calidad de datos, resultados del modelo y documentación técnica para producir informes comprensibles. Solaris concentra parte de esta información, pero redactar y revisar una explicación trazable requiere trabajo adicional. El costo es tiempo de revisión y posibles decisiones tardías o basadas en una lectura incompleta; no se cuenta con mediciones de horas, pérdidas energéticas ni costos económicos, por lo que sería incorrecto asignarles un valor. Se propone medir el tiempo de elaboración y correcciones en un piloto.')
h('Solución: informe con fuentes, no control automático')
b('<b>1.</b> Una persona responsable selecciona central y período. <b>2.</b> El sistema calcula indicadores con código convencional y comprueba cobertura y unidades. <b>3.</b> Recupera fragmentos autorizados del informe de modelo, auditorías y manuales pertinentes, identificados por fecha y versión. <b>4.</b> Un modelo de lenguaje redacta un borrador con citas y reconoce datos ausentes. <b>5.</b> El personal revisa evidencias, corrige y decide si aprueba el informe. La IA no modifica parámetros eléctricos ni ejecuta maniobras.')
h('¿Por qué IA? Comparación con una alternativa sin IA')
b('Una plantilla fija con SQL, reglas y gráficos es preferible para indicadores definidos, cálculos repetibles y alertas con umbrales claros: cuesta menos verificarla y no inventa frases. RAG podría aportar al resumir simultáneamente documentos heterogéneos y explicar sus limitaciones con referencias. Se justifica solo si una prueba controlada demuestra ahorro de tiempo y calidad aceptable frente a la plantilla; no reemplaza los cálculos ni prueba causalidad.')
h('Datos, responsables y acceso')
b('Se requieren mediciones y calidad de registros de Solaris, reporte versionado del modelo y, con autorización, fichas de módulos e inversores y bitácoras de mantenimiento. El equipo del proyecto conserva los archivos y artefactos locales; la UTPL y sus responsables deben confirmar propiedad, permisos y versiones de las demás fuentes. Se incorporarán mediante exportaciones autorizadas y revisión de unidades, fechas y cobertura. No se deben inferir parámetros faltantes: la potencia nominal DC, el área de módulos, POA y la semántica energética aún requieren confirmación.')
page(); title('Riesgos, viabilidad y prueba de concepto')
h('Riesgos y medidas')
b('<b>Ética y seguridad:</b> una explicación convincente puede inducir acciones incorrectas. Medida: revisión humana obligatoria, citas verificables y prohibición de control automático. <b>Privacidad:</b> registros o bitácoras podrían identificar personas o instalaciones. Medida: minimización, permisos por rol y evaluación institucional antes de enviar datos a terceros. <b>Sesgo:</b> datos incompletos o procedentes de una sola central pueden distorsionar el análisis de otra. Medida: informar cobertura por central y período, evaluar por subgrupos y abstenerse cuando falte evidencia.')
h('Madurez y recursos')
b('Los componentes RAG están disponibles comercialmente, pero su validez en datos de Solaris está por demostrarse. Para un piloto hacen falta responsable técnico y experto fotovoltaico, corpus autorizado, indexación y búsqueda, modelo de lenguaje, infraestructura local o servicio contratado, controles de acceso y presupuesto por uso. Antes del despliegue se deben comparar al menos 20 informes representativos frente a plantilla: tiempo de revisión, afirmaciones respaldadas, citas correctas y errores críticos, incluyendo casos sin evidencia. Las metas y presupuesto deben acordarse con la UTPL; no se reportan resultados del piloto porque aún no se ha realizado.')
h('3. Prueba de concepto: maqueta navegable')
b('La maqueta local <b>prototipo_solaris.html</b> permite seleccionar tres casos y consultar un borrador con fragmentos y procedencia. Los textos se elaboraron con OpenAI Codex a partir de README.md y del informe de reentrenamiento del proyecto. <b>Es una maqueta:</b> la recuperación se selecciona mediante reglas predefinidas, los borradores están preparados y no hay indexación semántica ni llamada en vivo a un modelo. Demuestra el flujo de revisión propuesto, no la eficacia de un RAG desplegado. Abrir el archivo HTML en un navegador; para compartir un enlace público debe hospedarse con autorización y sin datos sensibles.')
b('<b>Herramientas:</b> Codex para analizar los archivos y generar el contenido y la interfaz; HTML y JavaScript para una demostración local sin instalación. <b>Criterio de trabajo resumido:</b> «Con base en los archivos reales de Solaris, crea un borrador técnico breve con sus fuentes, conserva unidades y limitaciones, no inventes pérdidas ni pronósticos y señala los datos faltantes». <b>Objetivo:</b> mostrar selección de un caso, evidencia y revisión; se logró en la maqueta, sin validar resultados operativos. Para la exposición: abrir la maqueta, cambiar de caso, mostrar evidencia y explicar sus límites; finalizar con preguntas.')
page(); title('Referencias')
refs=[
'Ashworth, R., &amp; Tzeveleka, A. (2025, 17 de octubre). <i>How TP ICAP transformed CRM data into real-time insights with Amazon Bedrock.</i> AWS. https://aws.amazon.com/blogs/machine-learning/how-tp-icap-transformed-crm-data-into-real-time-insights-with-amazon-bedrock/',
'Amazon Web Services. (s. f.-a). <i>Retrieve data and generate AI responses with Amazon Bedrock Knowledge Bases.</i> https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base.html',
'Amazon Web Services. (s. f.-b). <i>Use agentic retrieval to query a knowledge base.</i> https://docs.aws.amazon.com/bedrock/latest/userguide/kb-test-agentic-retrieve.html',
'Amazon Web Services. (s. f.-c). <i>Amazon Bedrock pricing.</i> https://aws.amazon.com/bedrock/pricing/',
'Cuenca Cuenca, L. A. (2026). <i>Solaris UTPL: README e informe de reentrenamiento del 30 de octubre de 2026</i> [Archivos de trabajo no publicados]. Proyecto de tesis, Universidad Técnica Particular de Loja.',
'Gartner. (2026, 16 de septiembre). <i>Gartner forecasts worldwide AI spending to grow 49.5% in 2026.</i> https://www.gartner.com/en/newsroom/press-releases/2026-09-16-gartner-forecasts-worldwide-ai-spending-to-grow-49-point-5-percent-in-2026',
'Jagadesan, G., Kim, D., &amp; Singh, P. (2026, 30 de marzo). <i>How Ring scales global customer support with Amazon Bedrock Knowledge Bases.</i> AWS. https://aws.amazon.com/blogs/machine-learning/how-ring-scales-global-customer-support-with-amazon-bedrock-knowledge-bases/',
'Lewis, P., Perez, E., Piktus, A., Petroni, F., Karpukhin, V., Goyal, N., Küttler, H., Lewis, M., Yih, W.-t., Rocktäschel, T., Riedel, S., &amp; Kiela, D. (2020). <i>Retrieval-augmented generation for knowledge-intensive NLP tasks.</i> arXiv. https://arxiv.org/abs/2005.11401',
'Mitchell, D., Dodel, J.-P., &amp; Nargund, P. (2026, 20 de enero). <i>Introducing multimodal retrieval for Amazon Bedrock Knowledge Bases.</i> AWS. https://aws.amazon.com/blogs/machine-learning/introducing-multimodal-retrieval-for-amazon-bedrock-knowledge-bases/' ]
for x in refs:s.append(p(x,'RefX'))
doc.build(s,onFirstPage=footer,onLaterPages=footer)
# Presentation as PDF slides
W,H=landscape(A4)
from reportlab.pdfgen import canvas
c=canvas.Canvas(D+'/Presentacion_Solaris_RAG.pdf',pagesize=(W,H))
slides=[('IA generativa para Solaris UTPL','Informes fotovoltaicos con evidencia recuperada',['Lenin Andrés Cuenca Cuenca','Tecnologías emergentes · Unidad 5','De las mediciones a un borrador revisable']),('El problema','De los datos al informe',['Solaris reúne mediciones, calidad y predicciones.','El análisis requiere contrastar resultados y documentos.','Costo pendiente de medición: tiempo y posibles decisiones tardías.']),('¿Qué es RAG?','Buscar → fundamentar → redactar',['Un recuperador selecciona fragmentos relevantes.','Un modelo de lenguaje Transformer redacta con ese contexto.','Las citas ayudan a revisar; no garantizan exactitud.']),('Evidencia y expectativas','Una tecnología útil, aún bajo evaluación',['Ring reporta 21 % menos costo por región adicional.','TP ICAP describe análisis de registros en segundos.','Gartner ubica la IA generativa general en el valle; para RAG es una inferencia.']),('Propuesta UTPL','Un informe con revisión humana',['Seleccionar central y período; calcular indicadores con código.','Recuperar auditorías, reporte del modelo y manuales autorizados.','Redactar con citas y datos faltantes; especialista revisa y aprueba.']),('¿Por qué IA?','Comparar antes de adoptar',['Plantilla y reglas: mejores para cálculos y alertas definidas.','RAG: sintetiza documentos diversos y explica sus límites.','Piloto: medir tiempo, afirmaciones respaldadas y errores críticos.']),('Demostración','Maqueta navegable local',['Abrir prototipo_solaris.html y seleccionar un caso.','Mostrar borrador, fragmentos y advertencias.','Selección por reglas y textos preparados: no hay RAG en vivo.']),('Riesgos y siguientes pasos','Validación antes del despliegue',['Privacidad: permisos y minimización de datos.','Sesgo y seguridad: cobertura, citas y revisión humana.','¿Qué información necesitaría el equipo para confiar en el informe?'])]
for i,(t,sub,items) in enumerate(slides):
 c.setFillColor(colors.HexColor('#0e3042')); c.rect(0,0,W,H,fill=1,stroke=0)
 c.setFillColor(colors.HexColor('#38c6b2')); c.rect(35,H-52,70,5,fill=1,stroke=0)
 c.setFont('DejaVu-Bold',25); c.setFillColor(colors.white); c.drawString(38,H-100,t)
 c.setFont('DejaVu',16); c.setFillColor(colors.HexColor('#80e1d5')); c.drawString(40,H-136,sub)
 y=H-190
 for item in items:
  c.setFillColor(colors.HexColor('#38c6b2')); c.circle(45,y+4,3,fill=1,stroke=0)
  from reportlab.lib.utils import simpleSplit
  c.setFillColor(colors.HexColor('#e8f1f1')); c.setFont('DejaVu',15)
  for line in simpleSplit(item,'DejaVu',15,W-110): c.drawString(60,y,line); y-=23
  y-=17
 c.setFont('DejaVu',9); c.setFillColor(colors.HexColor('#9cb8bd')); c.drawString(40,28,'Fuentes y referencias completas: documento de investigación')
 c.drawRightString(W-40,28,f'{i+1} / {len(slides)}'); c.showPage()
c.save()
