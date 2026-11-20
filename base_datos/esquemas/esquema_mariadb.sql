CREATE DATABASE IF NOT EXISTS energia_utpl
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE energia_utpl;

CREATE TABLE IF NOT EXISTS centrales (
    central_id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    nombre VARCHAR(120) NOT NULL,
    ubicacion VARCHAR(200) NULL,
    potencia_instalada_kw DECIMAL(12, 3) NULL,
    activa TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (central_id),
    UNIQUE KEY uq_centrales_nombre (nombre)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS equipos (
    equipo_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    central_id SMALLINT UNSIGNED NOT NULL,
    tipo VARCHAR(40) NOT NULL,
    fabricante VARCHAR(80) NULL,
    modelo VARCHAR(120) NULL,
    identificador VARCHAR(120) NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (equipo_id),
    KEY ix_equipos_central (central_id),
    CONSTRAINT fk_equipos_central
        FOREIGN KEY (central_id) REFERENCES centrales (central_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS variables_catalogo (
    variable_id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    codigo VARCHAR(80) NOT NULL,
    nombre VARCHAR(120) NOT NULL,
    categoria ENUM('electrica', 'ambiental', 'energetica', 'demanda') NOT NULL,
    unidad VARCHAR(20) NULL,
    descripcion VARCHAR(255) NULL,
    PRIMARY KEY (variable_id),
    UNIQUE KEY uq_variables_codigo (codigo)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mediciones_energeticas (
    central_id SMALLINT UNSIGNED NOT NULL,
    fecha_hora DATETIME NOT NULL,
    corriente_ca_l1 DECIMAL(14, 4) NULL,
    corriente_ca_l2 DECIMAL(14, 4) NULL,
    corriente_ca_l3 DECIMAL(14, 4) NULL,
    corriente_cc_mpp1 DECIMAL(14, 4) NULL,
    corriente_cc_mpp2 DECIMAL(14, 4) NULL,
    energia DECIMAL(16, 4) NULL,
    energia_mpp1 DECIMAL(16, 4) NULL,
    energia_mpp2 DECIMAL(16, 4) NULL,
    factor_potencia DECIMAL(10, 6) NULL,
    potencia_aparente DECIMAL(16, 4) NULL,
    potencia_reactiva DECIMAL(16, 4) NULL,
    rendimiento_especifico DECIMAL(16, 6) NULL,
    tension_ca_l1 DECIMAL(14, 4) NULL,
    tension_ca_l2 DECIMAL(14, 4) NULL,
    tension_ca_l3 DECIMAL(14, 4) NULL,
    tension_cc_mpp1 DECIMAL(14, 4) NULL,
    tension_cc_mpp2 DECIMAL(14, 4) NULL,
    consumido_directamente DECIMAL(16, 4) NULL,
    consumo DECIMAL(16, 4) NULL,
    energia_obtenida_red DECIMAL(16, 4) NULL,
    energia_suministrada_red DECIMAL(16, 4) NULL,
    produccion_fotovoltaica DECIMAL(16, 4) NULL,
    potencia_aparente_l1_alimentacion DECIMAL(16, 4) NULL,
    potencia_aparente_l2_alimentacion DECIMAL(16, 4) NULL,
    potencia_aparente_l3_alimentacion DECIMAL(16, 4) NULL,
    potencia_efectiva_l1_alimentacion DECIMAL(16, 4) NULL,
    potencia_efectiva_l2_alimentacion DECIMAL(16, 4) NULL,
    potencia_efectiva_l3_alimentacion DECIMAL(16, 4) NULL,
    tension_ca_l1_alimentacion DECIMAL(14, 4) NULL,
    tension_ca_l2_alimentacion DECIMAL(14, 4) NULL,
    tension_ca_l3_alimentacion DECIMAL(14, 4) NULL,
    irradiacion DECIMAL(14, 4) NULL,
    temperatura_ambiente DECIMAL(10, 4) NULL,
    temperatura_modulo DECIMAL(10, 4) NULL,
    PRIMARY KEY (central_id, fecha_hora),
    KEY ix_mediciones_fecha (fecha_hora),
    CONSTRAINT fk_mediciones_central
        FOREIGN KEY (central_id) REFERENCES centrales (central_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS resumen_diario (
    central_id SMALLINT UNSIGNED NOT NULL,
    fecha DATE NOT NULL,
    produccion_fotovoltaica_wh DECIMAL(18, 4) NULL,
    consumo_wh DECIMAL(18, 4) NULL,
    energia_red_wh DECIMAL(18, 4) NULL,
    potencia_maxima DECIMAL(16, 4) NULL,
    irradiacion_promedio DECIMAL(14, 4) NULL,
    temperatura_promedio DECIMAL(10, 4) NULL,
    registros_validos INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (central_id, fecha),
    KEY ix_resumen_fecha (fecha),
    CONSTRAINT fk_resumen_central
        FOREIGN KEY (central_id) REFERENCES centrales (central_id)
) ENGINE=InnoDB;

INSERT INTO centrales (nombre, ubicacion)
VALUES ('Edificio Central UTPL', 'Loja, Ecuador')
ON DUPLICATE KEY UPDATE ubicacion = VALUES(ubicacion);

INSERT INTO variables_catalogo (codigo, nombre, categoria, unidad)
VALUES
    ('produccion_fotovoltaica', 'Producción fotovoltaica', 'energetica', 'Wh'),
    ('consumo', 'Consumo del edificio', 'demanda', 'Wh'),
    ('irradiacion', 'Irradiación solar', 'ambiental', 'W/m2'),
    ('temperatura_ambiente', 'Temperatura ambiente', 'ambiental', '°C'),
    ('temperatura_modulo', 'Temperatura de módulo', 'ambiental', '°C')
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), unidad = VALUES(unidad);