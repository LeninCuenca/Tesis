import unittest
from backend.servicios.consultas_energia import preparar_consulta


class ConsultasEnergia(unittest.TestCase):
    def setUp(self):
        self.contexto = {'zona_horaria': 'America/Guayaquil', 'variables': [
            {'variable': 'Producción fotovoltaica', 'unidad': 'Wh / intervalo', 'maximo': {'fecha': '2025-06-25 12:00', 'valor': 900}},
            {'variable': 'Consumo del edificio', 'unidad': 'Wh / intervalo', 'maximo': {'fecha': '2025-06-24 15:35', 'valor': 234.567}},
        ]}

    def test_maximo_consumo_no_confunde_produccion(self):
        contexto, respuesta = preparar_consulta('que hora se realizo mas consumo?', self.contexto)
        self.assertEqual(len(contexto['variables']), 1)
        self.assertIn('15:35', respuesta)
        self.assertIn('234,57', respuesta)
        self.assertNotIn('900', respuesta)

    def test_promedio_horario_no_es_maximo_puntual(self):
        _, respuesta = preparar_consulta('¿Qué hora tiene mayor consumo promedio?', self.contexto)
        self.assertIsNone(respuesta)

    def test_no_inventa_maximo_sin_lecturas(self):
        self.contexto['variables'][1].pop('maximo')
        _, respuesta = preparar_consulta('¿A qué hora hubo más consumo?', self.contexto)
        self.assertIn('No hay mediciones válidas', respuesta)

    def test_comparacion_conserva_ambas_variables(self):
        contexto, respuesta = preparar_consulta('Compara consumo y producción', self.contexto)
        self.assertEqual(len(contexto['variables']), 2)
        self.assertIsNone(respuesta)
