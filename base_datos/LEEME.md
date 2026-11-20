# Base de datos

`esquemas` contiene la definición de tablas para MariaDB y Supabase y las políticas existentes. `cargas` contiene los procesos de importación. `repositorios/repositorio_auditado.py` conserva todos los canales en instantáneas SQLite verificadas.

Los originales están en `datos/historicos`, los datasets anteriores en `datos/legados` y las ejecuciones de limpieza en `datos/auditoria`. Los datos pesados permanecen locales y excluidos de Git.

Los scripts de carga se ejecutan como módulos desde la raíz con el Python del entorno virtual:

```bash
.venv-linux/bin/python -m base_datos.cargas.cargar_mariadb
.venv-linux/bin/python -m base_datos.cargas.cargar_supabase
.venv-linux/bin/python -m base_datos.cargas.cargar_supabase_rest
.venv-linux/bin/python -m base_datos.cargas.cargar_resumen_supabase
```

Cada comando realiza una carga en la base configurada; elegir únicamente el correspondiente al destino. Se mantienen los requisitos y credenciales existentes; el conector MariaDB es opcional y solo se necesita para ese destino. Los cargadores REST leen el `.env` de la raíz y el cargador PostgreSQL utiliza `SUPABASE_DB_URL` del entorno.

La reorganización solo trasladó estos archivos: no ejecutó SQL ni publicó datos.
