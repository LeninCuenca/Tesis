import unittest
from backend.servicios.analisis_consultas import resumir_mediciones


class PruebaAnalisisConsultas(unittest.TestCase):
    def test_maximo_hora_local_y_promedio_sin_inventar_faltantes(self):
        filas = [
            {'fecha': '2025-06-30T13:00:00Z', 'valores': {'consumo': 100}},
            {'fecha': '2025-06-30T13:05:00Z', 'valores': {'consumo': 200}},
            {'fecha': '2025-06-30T14:00:00Z', 'valores': {'consumo': None}},
            {'fecha': '2025-06-30T14:05:00Z', 'valores': {'consumo': -1}},
        ]
        r = resumir_mediciones(filas, {'consumo': 'Wh / 5 min'})['consumo']
        self.assertEqual(r['muestras_validas'], 2)
        self.assertEqual(r['maximo'], 200)
        self.assertEqual(r['horas_maximo'], ['2025-06-30T08:05:00-05:00'])
        self.assertEqual(r['perfil_horario_media'][0]['media'], 150)
        self.assertEqual(r['energia_total_kwh'], .3)

    def test_sin_datos_y_fechas_sin_zona(self):
        r = resumir_mediciones([{'fecha': '2025-01-01T00:00:00', 'valores': {'consumo': 4}}], {'consumo': 'Wh'})
        self.assertEqual(r['consumo']['muestras_validas'], 0)


if __name__ == '__main__':
    unittest.main()
