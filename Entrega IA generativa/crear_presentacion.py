from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.pagesizes import landscape,A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import simpleSplit,ImageReader
import os
D=os.path.dirname(os.path.abspath(__file__)); root=os.path.dirname(D)
pdfmetrics.registerFont(TTFont('Noto','/usr/share/fonts/noto/NotoSans-Regular.ttf'));pdfmetrics.registerFont(TTFont('NotoBold','/usr/share/fonts/noto/NotoSans-Bold.ttf'))
W,H=landscape(A4); navy=colors.HexColor('#003B71'); dark=colors.HexColor('#00294F'); gold=colors.HexColor('#FFCB00'); light=colors.HexColor('#EDF4FA'); muted=colors.HexColor('#496578'); white=colors.white
c=canvas.Canvas(D+'/Presentacion_Solaris_RAG.pdf',pagesize=(W,H))
def rect(x,y,w,h,color):c.setFillColor(color);c.rect(x,y,w,h,fill=1,stroke=0)
def text(x,y,s,size=15,color=navy,font='Noto',width=None):
 c.setFillColor(color);c.setFont(font,size)
 lines=simpleSplit(s,font,size,width) if width else [s]
 for line in lines:c.drawString(x,y,line);y-=size*1.45
 return y
def frame(n,title,sub):
 rect(0,0,W,H,white);rect(0,H-15,W,15,gold);text(38,H-60,title,25,navy,'NotoBold');text(39,H-89,sub,13,muted);rect(38,40,W-76,1,colors.HexColor('#D7E2EB'));text(39,22,'SOLARIS UTPL · IA GENERATIVA',8,muted);c.setFont('Noto',8);c.drawRightString(W-38,22,f'{n} / 8')
def bullet(y,t,width=410):
 rect(40,y+3,6,6,gold);return text(57,y,t,15,navy,width=width)-18
def card(x,y,w,h,num,heading,desc):
 rect(x,y,w,h,light);rect(x,y+h-6,w,6,gold);text(x+15,y+h-35,num,17,navy,'NotoBold');text(x+15,y+h-68,heading,14,navy,'NotoBold',w-28);text(x+15,y+h-97,desc,11,muted,width=w-28)
# 1
c.drawImage(D+'/ilustracion_solar.png',0,0,width=W,height=H,mask='auto');rect(0,0,415,H,dark);rect(0,H-15,W,15,gold)
text(38,H-86,'IA generativa',29,white,'NotoBold');text(38,H-126,'para Solaris UTPL',26,white,'NotoBold');rect(40,H-152,75,5,gold)
text(40,H-192,'Informes fotovoltaicos con',16,white);text(40,H-215,'evidencia recuperada',16,white)
text(40,80,'Lenin Andrés Cuenca Cuenca',13,white,'NotoBold');text(40,57,'Tecnologías emergentes · Unidad 5',11,white);text(470,22,'Ilustración conceptual generada con IA',8,white);c.showPage()
# 2
frame(2,'El problema','De las mediciones al informe técnico')
y=H-145
y=bullet(y,'Solaris reúne mediciones, calidad de datos y predicciones.',330)
y=bullet(y,'El personal debe contrastar los resultados con documentos técnicos.',330)
y=bullet(y,'El tiempo de revisión y los costos aún deben medirse.',330)
c.drawImage(os.path.join(root,'backend/artefactos/predictive-analysis.png'),420,112,width=385,height=245,preserveAspectRatio=True,anchor='c');text(438,91,'Gráfica del proyecto · evaluación histórica',9,muted);c.showPage()
# 3
frame(3,'¿Qué es RAG?','Recuperar evidencia antes de generar un texto')
card(40,205,225,170,'01','Recuperar','Buscar fragmentos relevantes en fuentes autorizadas.')
card(307,205,225,170,'02','Generar','Un modelo Transformer redacta con el contexto recuperado.')
card(574,205,225,170,'03','Revisar','La persona comprueba las citas y aprueba el informe.')
for x in [276,543]:text(x,282,'→',22,navy,'NotoBold')
text(40,147,'RAG es una arquitectura; la recuperación no garantiza que el texto sea correcto.',14,navy,width=760);c.showPage()
# 4
frame(4,'Evidencia y expectativas','Aplicaciones reales y límites de la interpretación')
card(40,187,350,195,'RING','Soporte multirregional','Reportó 21 % menos costo de ampliación por región adicional.')
card(415,187,385,195,'TP ICAP','Análisis de registros','Describe una solución RAG que reduce horas de análisis a segundos.')
text(40,143,'Gartner sitúa la IA generativa general en el valle de desilusión;',13,navy)
text(40,121,'aplicar esta fase a RAG es una inferencia, no una clasificación específica.',13,navy)
text(40,77,'Fuentes: Jagadesan et al. (2026); Ashworth y Tzeveleka (2025); Gartner (2026).',9,muted);c.showPage()
# 5
frame(5,'Propuesta para la UTPL','Un informe con revisión humana')
for x,num,head,desc in [(40,'1','Seleccionar','Central y período'),(232,'2','Calcular','Indicadores y cobertura'),(424,'3','Recuperar','Auditorías y manuales'),(616,'4','Revisar','Borrador con citas')]:card(x,220,175,155,num,head,desc)
text(40,160,'La IA redacta; el cálculo se realiza con código convencional.',16,navy,'NotoBold')
text(40,127,'El responsable revisa las fuentes y decide si aprueba el informe.',14,muted);c.showPage()
# 6
frame(6,'¿Por qué usar IA?','Comparar antes de adoptar')
rect(40,183,355,210,light);rect(415,183,385,210,light)
text(58,358,'Plantilla y reglas',19,navy,'NotoBold');text(58,320,'Cálculos y alertas definidas.',14,navy,width=318);text(58,282,'Repetible y más fácil de verificar.',14,navy,width=318)
text(433,358,'RAG',19,navy,'NotoBold');text(433,320,'Resume documentos diferentes.',14,navy,width=335);text(433,282,'Puede explicar límites y citar fuentes.',14,navy,width=335)
text(40,141,'Piloto: medir tiempo de revisión, citas correctas y errores críticos.',14,navy,'NotoBold',750);c.showPage()
# 7
frame(7,'Demostración','Maqueta navegable para tres casos de la tesis')
rect(42,173,382,215,navy);rect(56,185,354,189,white);rect(56,350,354,24,gold)
text(70,321,'Informe con evidencia',17,navy,'NotoBold');rect(70,277,295,26,light);text(78,284,'Evaluación del modelo  ▾',11,navy);rect(70,238,127,26,navy);text(79,245,'Preparar borrador',10,white)
text(70,209,'Borrador y evidencia para revisión',11,muted)
y=365
for s in ['Abrir prototipo_solaris.html.','Elegir un caso y mostrar su evidencia.','Explicar que los textos están preparados: no hay RAG en vivo.']:
 rect(455,y+3,6,6,gold); y=text(472,y,s,14,navy,width=320)-18
text(445,134,'No se han validado resultados operativos.',12,muted,width=330);c.showPage()
# 8
frame(8,'Riesgos y próximos pasos','Preguntas para la clase')
y=H-150
for s in ['Privacidad: permisos por rol y minimización de datos.','Sesgo: revisar cobertura por central y período.','Seguridad: citas y aprobación humana obligatoria.','Evaluar el piloto frente a una plantilla sin IA.']:y=bullet(y,s,740)
rect(40,105,760,52,light);text(56,123,'¿Qué evidencia necesitarías para confiar en este informe?',16,navy,'NotoBold');c.showPage()
c.save()
