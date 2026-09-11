import json, os, sys, traceback
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # Vercel does not put api/ on the import path

# If the shared modules fail to load (e.g. a file missing from the bundle), report why instead of crashing,
# so the deployment can be diagnosed without access to the Vercel logs.
try:
    from _common import core, store
    LOAD_ERROR = None
except Exception:
    LOAD_ERROR = traceback.format_exc()[-1200:]


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if LOAD_ERROR:
            body = {"ok": False, "error": LOAD_ERROR}
        else:
            # ok=false (no key or no store) → the kiosk falls back to its pre-rendered demo images.
            body = {"ok": bool(core.KEY) and store.available(), "lan": "https://" + self.headers.get("host", ""),
                    "model": core.MODEL, "products": sorted(core.PRODUCT_FILES),
                    "looks": {k: sorted(v) for k, v in core.LOOKS.items()},
                    "store": "postgres" if store.PG_DSN else ("redis" if store.REDIS_URL else None),
                    "key": bool(core.KEY),  # whether OPENAI_API_KEY is set — never the value
                    "store_env": store.env_names()}  # variable names only, to diagnose the storage connection
        data = json.dumps(body).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)
