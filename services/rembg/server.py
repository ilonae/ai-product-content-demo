"""Background-removal service for the demo pipeline.

POST /remove-bg   body: raw image bytes (PNG/JPEG/WebP)  ->  transparent PNG
     optional query: model=<name>  post_process=1  alpha_matting=1
GET  /health      -> {"ok": true, "model": "...", "models": [...]}

Full resolution in, full resolution out (no downscaling).
Set REMBG_TOKEN to require `Authorization: Bearer <token>` (recommended in production).
"""
import hmac
import io
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from PIL import Image
from rembg import new_session, remove

PORT = int(os.environ.get("PORT", "8080"))
TOKEN = os.environ.get("REMBG_TOKEN", "")
# isnet-general-use gives sharper, cleaner product edges than u2net (compared on the demo samples).
DEFAULT_MODEL = os.environ.get("REMBG_MODEL", "isnet-general-use")
ALLOWED = [m.strip() for m in os.environ.get("REMBG_MODELS", f"{DEFAULT_MODEL},u2net").split(",") if m.strip()]
MAX_BYTES = 8 * 1024 * 1024

_sessions: dict = {}
_lock = threading.Lock()


def session(name: str):
    with _lock:
        if name not in _sessions:
            _sessions[name] = new_session(name)
        return _sessions[name]


session(DEFAULT_MODEL)  # warm up the default model at start


def flag(qs: dict, key: str) -> bool:
    return qs.get(key, ["0"])[0] in ("1", "true", "yes")


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: bytes, ctype: str = "text/plain") -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if urlparse(self.path).path == "/health":
            return self._send(200, json.dumps({"ok": True, "model": DEFAULT_MODEL, "models": ALLOWED}).encode(), "application/json")
        self._send(404, b"not found")

    def do_POST(self) -> None:
        url = urlparse(self.path)
        if url.path != "/remove-bg":
            return self._send(404, b"not found")
        if TOKEN and not hmac.compare_digest(self.headers.get("Authorization", ""), f"Bearer {TOKEN}"):
            return self._send(401, b"unauthorized")
        qs = parse_qs(url.query)
        model = qs.get("model", [DEFAULT_MODEL])[0]
        if model not in ALLOWED:
            return self._send(400, f"model must be one of {ALLOWED}".encode())
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BYTES:
            return self._send(413, b"empty or too large")
        try:
            image = Image.open(io.BytesIO(self.rfile.read(length)))
            image.load()
        except Exception:
            return self._send(400, b"not an image")
        matting = flag(qs, "alpha_matting")
        cutout = remove(
            image.convert("RGBA"),
            session=session(model),
            post_process_mask=flag(qs, "post_process"),  # smooths the mask edge (morphological cleanup)
            alpha_matting=matting,  # refines semi-transparent edges; slower
            alpha_matting_foreground_threshold=240,
            alpha_matting_background_threshold=10,
            alpha_matting_erode_size=10,
        )
        out = io.BytesIO()
        cutout.save(out, format="PNG")
        self._send(200, out.getvalue(), "image/png")

    def log_message(self, fmt: str, *args) -> None:
        print(f"[rembg] {self.address_string()} {fmt % args}")


if __name__ == "__main__":
    print(f"rembg service on :{PORT} (default {DEFAULT_MODEL}, allowed {ALLOWED})")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
