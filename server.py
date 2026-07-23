"""
Servidor local del juego "Circuito Cuántico".

Sirve los archivos estáticos (index.html, game.js, style.css, assets/) y
expone /api/measure, que construye y corre el circuito real de Grover
(backend/grover_qiskit.py) en Qiskit Aer para decidir el resultado de
cada partida. El navegador nunca calcula la medición final por su
cuenta -- eso siempre pasa aquí, en Python, con Qiskit de verdad.

Uso:
    python server.py [puerto]     # por defecto 8731
"""
import json
import sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from backend.grover_qiskit import measure, optimal_iterations

MAX_N = 6           # límite de seguridad: hasta 64 carriles
MAX_ITERATIONS = 60  # límite de seguridad para R


class Handler(SimpleHTTPRequestHandler):
    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith("/api/optimal"):
            from urllib.parse import urlparse, parse_qs
            qs = parse_qs(urlparse(self.path).query)
            try:
                n = int(qs.get("n", ["2"])[0])
                n = max(1, min(MAX_N, n))
            except ValueError:
                return self._send_json(400, {"error": "n inválido"})
            return self._send_json(200, {"n": n, "N": 2 ** n, "R": optimal_iterations(n)})
        return super().do_GET()

    def do_POST(self):
        if self.path != "/api/measure":
            return self._send_json(404, {"error": "ruta no encontrada"})

        length = int(self.headers.get("Content-Length", 0))
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
            n = int(body["n"])
            target = int(body["target"])
            iterations = int(body["iterations"])
        except (KeyError, ValueError, json.JSONDecodeError):
            return self._send_json(400, {"error": "body inválido, se espera {n, target, iterations}"})

        if not (1 <= n <= MAX_N):
            return self._send_json(400, {"error": f"n debe estar entre 1 y {MAX_N}"})
        if not (0 <= target < 2 ** n):
            return self._send_json(400, {"error": "target fuera de rango para ese n"})
        iterations = max(0, min(MAX_ITERATIONS, iterations))

        try:
            result = measure(n, target, iterations)
        except Exception as exc:  # no tumbar el server por un circuito raro
            return self._send_json(500, {"error": f"fallo simulando el circuito: {exc}"})

        return self._send_json(200, result)

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            super().log_message(fmt, *args)  # solo logueamos llamadas a la API


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8731
    handler = lambda *a, **kw: Handler(*a, directory=str(Path(__file__).parent), **kw)
    with ThreadingHTTPServer(("0.0.0.0", port), handler) as httpd:
        print(f"Circuito Cuántico corriendo en http://localhost:{port}")
        print("El circuito de Grover real se construye/corre en /api/measure (Qiskit Aer).")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
