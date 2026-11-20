"""Punto de entrada: python -m backend.servidor [puerto]."""
import sys
from http.server import ThreadingHTTPServer
from backend.controladores.controlador_prediccion import ControladorPrediccion


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f'API predictiva: http://127.0.0.1:{port} (Ctrl+C para detener)', flush=True)
    ThreadingHTTPServer(('127.0.0.1', port), ControladorPrediccion).serve_forever()


if __name__ == '__main__':
    main()
