"""Shared pieces for the Vercel functions. Generation logic, catalogue and prompts are reused from tools/server.py."""
import base64, io, json, os, sys, time
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "tools"))
import server as core  # noqa: E402
import _store as store  # noqa: E402

# Public link = anyone can spend the OpenAI credit, so cap usage (override via env).
DAILY_LIMIT = int(os.environ.get("DAILY_LIMIT", "80"))
SESSION_LIMIT = int(os.environ.get("SESSION_LIMIT", "4"))


def within_limits(sid):
    if store.incr(f"day:{time.strftime('%Y%m%d')}", 172800) > DAILY_LIMIT:
        return False
    return not sid or store.incr(f"sess:{sid}", 86400) <= SESSION_LIMIT


def shrink(data_url):
    """Re-encode to 768×1152 JPEG so the result fits comfortably in Redis and loads fast on phones."""
    from PIL import Image
    im = Image.open(io.BytesIO(base64.b64decode(data_url.split(",", 1)[1]))).convert("RGB")
    im.thumbnail((768, 1152))
    buf = io.BytesIO(); im.save(buf, "JPEG", quality=82)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


class Base(BaseHTTPRequestHandler):
    def send_json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def body(self):
        return json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")

    def query(self):
        q = parse_qs(urlparse(self.path).query)
        return {k: v[0] for k, v in q.items()}
