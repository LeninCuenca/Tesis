"""Controlador HTTP: rutas, validación de solicitudes y respuestas JSON."""
import json
import os
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse
from backend.modelos.modelo_solar import TIMEZONE
from backend.modelos.repositorio_prediccion import bundle, objectives_report
from backend.servicios.servicio_asistente import consultar_asistente, estado_asistente
from backend.servicios.servicio_prediccion import automatic_forecast, predict_one, historical_replay


class ControladorPrediccion(BaseHTTPRequestHandler):
    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        allowed = os.environ.get('FRONTEND_ORIGINS', 'http://127.0.0.1:5176,http://localhost:5176,http://127.0.0.1:5173,http://localhost:5173').split(',')
        origin = self.headers.get('Origin')
        if origin in allowed:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_json(200, {})

    def do_GET(self):
        path = urlparse(self.path).path
        try:
            if path == '/health':
                self.send_json(200, {'status': 'ready', 'model': bundle()['report']['model'], 'timezone': TIMEZONE})
            elif path == '/model':
                self.send_json(200, bundle()['report'])
            elif path == '/evaluation':
                self.send_json(200, objectives_report())
            elif path == '/asistente/estado':
                self.send_json(200, estado_asistente())
            else:
                self.send_json(404, {'error': 'Ruta no encontrada'})
        except (BrokenPipeError, ConnectionResetError):
            return  # El navegador canceló la consulta; no es un fallo del modelo.
        except FileNotFoundError as error:
            self.send_json(503, {'error': str(error)})

    def do_POST(self):
        path = urlparse(self.path).path
        if path not in ('/predict', '/predict/auto', '/predict/replay', '/asistente'):
            self.send_json(404, {'error': 'Ruta no encontrada'})
            return
        try:
            length = int(self.headers.get('Content-Length', 0))
            if length < 0 or length > (262144 if path == '/asistente' else 16384):
                self.send_json(413, {'error': 'Solicitud demasiado grande'})
                return
            payload = json.loads(self.rfile.read(length) or b'{}')
            if not isinstance(payload, dict):
                raise ValueError('Se esperaba un objeto JSON')
            if path == '/asistente':
                allowed = os.environ.get('FRONTEND_ORIGINS', 'http://127.0.0.1:5176,http://localhost:5176,http://127.0.0.1:5173,http://localhost:5173').split(',')
                if self.headers.get('Origin') not in allowed:
                    self.send_json(403, {'error': 'Origen no autorizado'})
                    return
                result = consultar_asistente(payload)
            elif path == '/predict/replay':
                result = historical_replay(payload)
            else:
                result = automatic_forecast(payload) if path == '/predict/auto' else predict_one(payload)
            self.send_json(200, result)
        except (BrokenPipeError, ConnectionResetError):
            return  # El navegador canceló la consulta; no es un fallo del modelo.
        except FileNotFoundError as error:
            self.send_json(503, {'error': str(error)})
        except RuntimeError as error:
            self.send_json(502, {'error': str(error)})
        except (KeyError, TypeError, ValueError, OverflowError) as error:
            self.send_json(400, {'error': f'Entrada inválida: {error}'})
        except Exception:
            self.send_json(500, {'error': 'No fue posible ejecutar el modelo. Revisa el registro del servidor.'})
            import traceback
            traceback.print_exc()

    def log_message(self, format, *args):
        return


