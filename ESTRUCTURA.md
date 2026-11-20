# Organización del proyecto

La aplicación tiene tres partes: `base_datos`, `backend` y `frontend`. Los documentos académicos se conservan en su ubicación actual.

```text
TESIS/
├── base_datos/
│   ├── esquemas/                   # SQL de MariaDB, Supabase y políticas
│   ├── cargas/                     # Importaciones a las bases de datos
│   ├── repositorios/
│   │   └── repositorio_auditado.py  # Persistencia SQLite verificada
│   └── datos/
│       ├── historicos/             # Archivos originales
│       ├── legados/                # Dataset del experimento anterior
│       └── auditoria/              # Datos auditados, informes y SQLite
├── scripts/
│   └── iniciar.mjs                # Inicio conjunto de API e interfaz
├── backend/
│   ├── servidor.py
│   ├── controladores/
│   │   └── controlador_prediccion.py
│   ├── modelos/
│   │   ├── modelo_solar.py
│   │   ├── rendimiento_fotovoltaico.py
│   │   └── repositorio_prediccion.py
│   ├── servicios/
│   │   ├── servicio_prediccion.py
│   │   ├── servicio_asistente.py   # Consulta al proveedor de IA
│   │   ├── analisis_consultas.py   # Resúmenes verificables de lecturas
│   │   └── limpieza_fotovoltaica.py
│   ├── procesos/
│   │   ├── limpiar_consolidar.py
│   │   ├── entrenar_pronostico.py
│   │   └── evaluar_objetivos.py
│   ├── configuracion/
│   │   ├── rutas.py
│   │   ├── limpieza.json
│   │   └── sistema_fotovoltaico.json
│   ├── pruebas/
│   ├── artefactos/
│   ├── requirements.txt
│   └── requirements.lock.txt
└── frontend/
    ├── codigo/
    │   ├── principal.tsx
    │   ├── modelos/                # Contratos TypeScript
    │   ├── controladores/          # Carga, errores y acciones del usuario
    │   ├── vistas/                 # Panel principal y componentes
    │   ├── servicios/              # Supabase y API Python
    │   ├── configuracion/
    │   ├── estilos/
    │   ├── utilidades/
    │   ├── recursos/
    │   └── pruebas/
    ├── publico/
    ├── index.html
    ├── package.json
    └── vite.config.ts
```

## Modelo, vista y controlador

**Modelo:** `backend/modelos` contiene las reglas de variables, unidades y cálculo, además del acceso al modelo entrenado. `frontend/codigo/modelos` define los contratos TypeScript. La persistencia está en `base_datos`.

**Vista:** `frontend/codigo/vistas` presenta paneles, tablas, formularios y gráficos. React dibuja las vistas en el navegador y el backend responde JSON.

**Controlador:** `backend/controladores/controlador_prediccion.py` recibe solicitudes HTTP y delega en los servicios. Los controladores React coordinan consultas, cancelación, carga, errores, reintentos y exportaciones. Las vistas mantienen el estado visual, como la pestaña seleccionada y las unidades del gráfico.

Flujo predictivo: vista → controlador React → servicio HTTP → controlador Python → servicio de predicción → modelo → respuesta JSON → vista.

Las consultas históricas mantienen el acceso público existente a Supabase: vista → controlador React → servicio de energía → Supabase. La reorganización no ejecuta migraciones ni cargas remotas.

## Comandos desde la raíz

```bash
# Backend e interfaz en una sola terminal
npm run dev

# Procesos locales: ejecutarlos cuando se necesite regenerar resultados
npm run limpiar -- --help
npm run entrenar
npm run evaluar

# Verificación
npm run pruebas:backend
npm test
npm run lint
npm run build
```

Los comandos Python usan paquetes desde la raíz, por ejemplo `.venv-linux/bin/python -m backend.servidor`. No ejecutar los archivos internos directamente con `python backend/.../archivo.py`.

La instalación está documentada en `README.md`. Las rutas compartidas se resuelven en `backend/configuracion/rutas.py`. El `.env` de los procesos de carga permanece en la raíz y las variables públicas de Vite permanecen en `frontend/.env.local` y la clave del asistente en `backend/.env`, fuera de Git y del frontend.

## Nombres y trazabilidad

Las carpetas y archivos propios del código están en español. Se conservan los nombres reconocidos por las herramientas (`package.json`, `tsconfig.*`, `vite.config.ts`, `requirements*.txt`, `__init__.py`) y el prefijo `use` de los hooks exigido por React.

Los archivos originales y los resultados de auditoría/modelado conservan sus nombres y contenido, aunque cambió su ubicación. Los manifiestos e informes existentes pueden incluir las rutas históricas anteriores; documentan la ejecución original y no se reescribieron. Los procesos nuevos registran las rutas actuales. Las claves del contrato HTTP y los nombres de columnas/tablas también se conservan para mantener la compatibilidad.

## Equivalencias principales

| Antes | Ahora |
| --- | --- |
| `api_prediccion.py` | `backend/servidor.py`, `backend/controladores/controlador_prediccion.py`, `backend/servicios/servicio_prediccion.py` y `backend/modelos/repositorio_prediccion.py` |
| `solar_model.py` | `backend/modelos/modelo_solar.py` |
| `pv_cleaning.py` | `backend/servicios/limpieza_fotovoltaica.py` |
| `pv_performance.py` | `backend/modelos/rendimiento_fotovoltaico.py` |
| `audited_store.py` | `base_datos/repositorios/repositorio_auditado.py` |
| `01_limpieza_consolidacion.py` | `backend/procesos/limpiar_consolidar.py` |
| `04_pronostico_clima.py` | `backend/procesos/entrenar_pronostico.py` |
| `05_evaluacion_objetivos.py` | `backend/procesos/evaluar_objetivos.py` |
| `frontend/src/App.tsx` | `frontend/codigo/vistas/PanelPrincipal.tsx` y `frontend/codigo/controladores/controlador_panel.ts` |
| `frontend/src/components/` | `frontend/codigo/vistas/componentes/` |
| `artifacts/cleaning/` | `base_datos/datos/auditoria/` |
| `artifacts/` (resto) | `backend/artefactos/` |
