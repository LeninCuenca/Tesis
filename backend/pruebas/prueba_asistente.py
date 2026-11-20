import io
import json
import unittest
from unittest.mock import patch
from backend.servicios.servicio_asistente import consultar_asistente


class Respuesta:
    def __enter__(self):
        return io.BytesIO(json.dumps({'choices': [{'message': {'content': 'Respuesta de prueba'}}], 'model': 'prueba/modelo:free'}).encode())
    def __exit__(self, *args):
        return False


class PruebaAsistente(unittest.TestCase):
    @patch('backend.servicios.servicio_asistente.configuracion', return_value=('groq', '', 'qwen/qwen3.8-27b'))
    def test_falta_clave(self, _):
        with self.assertRaises(FileNotFoundError):
            consultar_asistente({'pregunta': 'Consumo', 'contexto': {}})

    @patch('backend.servicios.servicio_asistente.urllib.request.urlopen', return_value=Respuesta())
    @patch('backend.servicios.servicio_asistente.configuracion', return_value=('groq', 'clave-prueba', 'qwen/qwen3.8-27b'))
    def test_solicitud_y_respuesta(self, _, enviar):
        r = consultar_asistente({'pregunta': '¿Cuándo?', 'contexto': {'fuente': 'histórico'}})
        self.assertEqual(r['respuesta'], 'Respuesta de prueba')
        req = enviar.call_args.args[0]
        self.assertEqual(req.full_url, 'https://api.groq.com/openai/v1/chat/completions')
        self.assertEqual(req.get_header('Authorization'), 'Bearer clave-prueba')
        self.assertIn('histórico', json.loads(req.data)['messages'][1]['content'])
        self.assertNotIn('clave-prueba', str(r))

    @patch('backend.servicios.servicio_asistente.urllib.request.urlopen', return_value=Respuesta())
    @patch('backend.servicios.servicio_asistente.configuracion', return_value=('openrouter', 'clave-openrouter', 'openrouter/free'))
    def test_openrouter_destino_y_clave(self, _, enviar):
        consultar_asistente({'pregunta': 'Consumo', 'contexto': {}})
        req = enviar.call_args.args[0]
        self.assertEqual(req.full_url, 'https://openrouter.ai/api/v1/chat/completions')
        self.assertEqual(req.get_header('Authorization'), 'Bearer clave-openrouter')

    @patch('backend.servicios.servicio_asistente.urllib.request.urlopen')
    def test_modelos_cruzados_y_de_pago_se_rechazan_sin_red(self, enviar):
        combinaciones = [
            ('openrouter', 'clave', 'openai/gpt-4o'),
            ('openrouter', 'clave', 'qwen/qwen3.8-27b'),
            ('groq', 'clave', 'openrouter/free'),
            ('groq', 'clave', 'qwen/qwen:free'),
            ('desconocido', 'clave', 'openrouter/free'),
        ]
        for config in combinaciones:
            with self.subTest(config=config):
                with patch('backend.servicios.servicio_asistente.configuracion', return_value=config):
                    with self.assertRaises(ValueError):
                        consultar_asistente({'pregunta': 'Consumo', 'contexto': {}})
        enviar.assert_not_called()

    @patch('backend.servicios.servicio_asistente.urllib.request.urlopen', return_value=Respuesta())
    @patch('backend.servicios.servicio_asistente.configuracion', return_value=('openrouter', 'clave', 'fabricante/modelo:free'))
    def test_modelo_gratuito_explicito(self, _, enviar):
        consultar_asistente({'pregunta': 'Consumo', 'contexto': {}})
        self.assertEqual(enviar.call_args.args[0].full_url, 'https://openrouter.ai/api/v1/chat/completions')

    def test_rechaza_pregunta_vacia(self):
        with self.assertRaises(ValueError):
            consultar_asistente({'pregunta': '', 'contexto': {}})


if __name__ == '__main__':
    unittest.main()
