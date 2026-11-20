# Backend

API Python organizada en controladores HTTP, modelos y servicios. Las vistas se encuentran en el frontend React.

Desde la raíz del proyecto:

```bash
python -m venv .venv-linux
.venv-linux/bin/python -m pip install -r backend/requirements.txt
npm run api
```

El servidor escucha en `http://127.0.0.1:8000`. Expone `GET /health`, `GET /model`, `GET /evaluation`, `POST /predict`, `POST /predict/auto`, `POST /predict/replay` y `POST /asistente`. Para levantar también la interfaz en una sola terminal, usa `npm run dev` desde la raíz o desde `frontend`.

`configuracion/rutas.py` centraliza las ubicaciones. Los modelos e informes están en `artefactos`; los datos auditados se encuentran en `base_datos/datos/auditoria`.

Los procesos se invocan como módulos desde la raíz: `python -m backend.procesos.limpiar_consolidar`, `python -m backend.procesos.entrenar_pronostico` y `python -m backend.procesos.evaluar_objetivos`, utilizando el Python del entorno virtual.

Consultar `../ESTRUCTURA.md` para la organización MVC y `../README.md` para las condiciones científicas de los resultados.

Para validar un reentrenamiento antes de activarlo, se pueden establecer `SOLAR_AUDITED_DATA_PATH` (ruta absoluta al `cleaned.pkl` con su auditoría completa en la misma carpeta) y `SOLAR_ARTIFACT_DIR` (carpeta separada de resultados). Entrenamiento, evaluación y pruebas usan estas rutas al iniciar cada proceso. Sin esas variables se mantienen las rutas activas habituales. Conservar el directorio candidato y un respaldo antes de activar datos y artefactos verificados.

`POST /predict/replay` devuelve un día completo de prueba y su escenario construido con antecedentes previos para una reproducción histórica explícita. No escribe en la base de datos ni reentrena el modelo. Los días de entrenamiento y los días incompletos se rechazan. La fecha opcional se envía como `{"date":"AAAA-MM-DD"}`; al abrir se muestra el ejemplo del 25/05/2025 si pertenece al conjunto de prueba. Si no está disponible, se usa el último día completo del conjunto.

### Asistente local con Ollama

El proveedor predeterminado es Ollama en `http://127.0.0.1:11434`; con ese host local, la pregunta y el resumen no salen de este equipo. Instala Ollama y descarga una vez un modelo (`ollama pull llama3:latest`). `npm run dev` comprueba Ollama y el modelo, y arranca `ollama serve` si el servicio local aún no está activo; no descarga modelos automáticamente. En `backend/.env` puedes elegir `OLLAMA_MODEL` y `OLLAMA_HOST`; si configuras un host remoto, los datos se envían a ese servidor. El proyecto expone `GET /asistente/estado` para identificar el proveedor. El modelo recibe instrucciones especializadas en energía fotovoltaica, pero las cifras deben provenir del contexto calculado por la aplicación; no puede consultar datos que no se hayan incluido y puede equivocarse.

Como alternativas remotas, configura `PROVEEDOR_IA=groq` junto con `GROQ_API_KEY`, o `PROVEEDOR_IA=openrouter` junto con `OPENROUTER_API_KEY`. Esas consultas envían al proveedor remoto la pregunta y el resumen de datos seleccionado. Mantén las claves en `backend/.env`, archivo excluido de Git.

Los pronósticos históricos combinan las lecturas anteriores con el método seleccionado en validación. Se admiten fechas posteriores al cierre de la calibración. La curva queda fija durante la reproducción. La zona horaria de las mediciones legadas de Supabase debe verificarse con las fuentes antes de considerar definitiva la comparación; no se han modificado las fechas almacenadas.
