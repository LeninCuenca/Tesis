"""Regresiones del pronóstico de 24 horas con datos sintéticos y sin servicios externos."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
import pandas as pd

from backend.modelos.modelo_solar import TARGET, TIMEZONE
from backend.modelos.perfil_calendario import perfil_calendario
from backend.modelos.pronostico_diario import pronosticar_dia
from backend.modelos.radiacion_prevista import COLUMNAS, cargar_archivo, variables_radiacion


class PerfilCalendarioTests(unittest.TestCase):
    def setUp(self):
        indice = pd.date_range('2025-02-01', '2025-03-09 23:55', freq='5min', tz=TIMEZONE)
        carnaval = indice.strftime('%Y-%m-%d').isin(['2025-03-03', '2025-03-04'])
        self.serie = pd.Series(np.where((indice.day_of_week >= 5) | carnaval, 20., 65.), index=indice)

    def test_feriado_fin_de_semana_y_laborable_excluyen_el_futuro(self):
        for fecha, esperado in [('2025-03-01', 20.), ('2025-03-03', 20.), ('2025-03-05', 65.)]:
            with self.subTest(fecha=fecha):
                dia = pd.Timestamp(fecha, tz=TIMEZONE)
                perfil = perfil_calendario(self.serie, dia)
                self.assertEqual(perfil.shape, (288,))
                np.testing.assert_allclose(perfil, esperado)
                cambiada = self.serie.copy()
                cambiada.loc[cambiada.index >= dia] = 1e6
                np.testing.assert_array_equal(perfil, perfil_calendario(cambiada, dia))

    def test_un_dia_de_diez_minutos_se_excluye_del_perfil(self):
        dia = pd.Timestamp('2025-03-05', tz=TIMEZONE)
        cambiada = self.serie.copy()
        seleccionado = cambiada.index.normalize() == dia - pd.Timedelta(days=7)
        cambiada.loc[seleccionado] = np.where(cambiada.index[seleccionado].minute % 10 == 0, 1e4, np.nan)
        np.testing.assert_allclose(perfil_calendario(cambiada, dia), 65.)
        with self.assertRaisesRegex(ValueError, 'cobertura'):
            perfil_calendario(cambiada.iloc[::2], dia)

    def test_historia_corta_usa_los_dias_validos_disponibles(self):
        domingo = pd.Timestamp('2025-02-02', tz=TIMEZONE)
        lunes = domingo + pd.Timedelta(days=1)
        # El archivo contiene únicamente un sábado y un domingo.
        np.testing.assert_allclose(perfil_calendario(self.serie.loc[self.serie.index < lunes], lunes), 20.)


class RadiacionAdelantadaTests(unittest.TestCase):
    def setUp(self):
        self.dia = pd.Timestamp('2025-03-05', tz=TIMEZONE)
        indice = pd.date_range(self.dia - pd.Timedelta(days=21), self.dia + pd.Timedelta(days=1), freq='h')
        self.archivo = pd.DataFrame(100., index=indice, columns=COLUMNAS)
        self.perfil = np.full(288, 500.)

    def test_archivo_excluye_dia_cero_y_conserva_el_orden_de_modelos_y_plazos(self):
        tabla = self.archivo.copy()
        tabla['shortwave_radiation_previous_day0_gfs_global'] = 1e6
        tabla['shortwave_radiation'] = -1e6
        for numero, columna in enumerate(COLUMNAS):
            tabla[columna] += numero
        tabla = tabla[tabla.columns[::-1]].rename_axis('hora_local')
        tabla.index = tabla.index.tz_localize(None)
        with tempfile.TemporaryDirectory() as carpeta:
            ruta = Path(carpeta) / 'predicciones.csv.gz'
            tabla.to_csv(ruta)
            with patch('backend.modelos.radiacion_prevista.ARCHIVO', ruta):
                fuente = cargar_archivo()
        self.assertEqual(list(fuente.columns), COLUMNAS)
        np.testing.assert_array_equal(fuente.iloc[0], 100. + np.arange(len(COLUMNAS)))
        np.testing.assert_allclose(variables_radiacion(fuente, self.dia, self.perfil), 0.)

    def test_plazos_descartados_y_horas_posteriores_no_cambian_el_pronostico(self):
        horas = pd.date_range(self.dia, periods=25, freq='h')
        matriz = variables_radiacion(self.archivo, self.dia, self.perfil)
        self.assertEqual(matriz.shape, (288, 4))
        cambiada = self.archivo.copy()
        cambiada.loc[horas[:16], COLUMNAS[3:]] = np.nan
        cambiada.loc[horas[16:], COLUMNAS[:3]] = 1e6
        cambiada.loc[horas[-1] + pd.Timedelta(hours=1)] = 1e6
        np.testing.assert_array_equal(matriz, variables_radiacion(cambiada, self.dia, self.perfil))

    def test_plazos_utilizados_incluyen_las_15_16_y_medianoche_siguiente(self):
        for hora, columna in [(15, COLUMNAS[0]), (16, COLUMNAS[3]), (24, COLUMNAS[3])]:
            with self.subTest(hora=hora):
                cambiada = self.archivo.copy()
                cambiada.loc[self.dia + pd.Timedelta(hours=hora), columna] = 200.
                matriz = variables_radiacion(cambiada, self.dia, self.perfil)
                self.assertGreater(matriz[:, 0].max(), 0.)
                np.testing.assert_allclose(matriz[:, 1:3], 0.)

    def test_cobertura_horaria_y_respaldo_sin_meteorologia(self):
        inicio = self.dia - pd.Timedelta(days=14)
        dos_semanas = self.archivo.loc[inicio:].copy()
        self.assertIsNotNone(variables_radiacion(dos_semanas, self.dia, self.perfil))
        pocas_referencias = dos_semanas.copy()
        pocas_referencias.loc[inicio + pd.Timedelta(hours=15), COLUMNAS[0]] = np.nan
        sin_ultima_hora = dos_semanas.iloc[:-1]
        indice = pd.date_range(inicio, self.dia - pd.Timedelta(minutes=5), freq='5min')
        produccion = pd.DataFrame({TARGET: 300.}, index=indice)
        for caso, archivo in [('vacío', dos_semanas.iloc[:0]), ('13 referencias', pocas_referencias),
                              ('falta medianoche', sin_ultima_hora)]:
            with self.subTest(caso=caso):
                self.assertIsNone(variables_radiacion(archivo, self.dia, self.perfil))
                artefacto = {'archivo_radiacion': archivo, 'baseline_profile': pd.Series(dtype=float)}
                plan = pronosticar_dia(artefacto, produccion, self.dia, 'radiacion_calendario')
                self.assertEqual(plan.metodo, 'calendario')
                self.assertEqual(len(plan.index), 288)
                np.testing.assert_allclose(plan.estimacion, 300.)
