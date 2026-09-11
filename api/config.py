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


def missing_assets():
    """Files generation reads at runtime; they must be bundled into the function via vercel.json includeFiles."""
    need = [core.TRYON / f"base_{s}.png" for s in ("M", "XL")]
    need += [core.TRYON / f"{l}_{s}.png" for l in core.LOOKS for s in ("M", "XL")]
    need += [core.PRODUCTS / f for f, _ in core.PRODUCT_FILES.values()]
    need += [core.WEB / "assets" / "shoes" / f"{k}.png" for k in ("sneaker", "boot", "loafer")]
    missing = [str(p.relative_to(core.ROOT)) for p in need if not p.exists()]
    return {"count": len(missing), "of": len(need), "sample": missing[:4]}


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if LOAD_ERROR:
            body = {"ok": False, "error": LOAD_ERROR}
        else:
            # ok=false (no key or no store) → the kiosk falls back to its pre-rendered demo images.
            body = {"ok": bool(core.KEY) and store.available(), "lan": "https://" + self.headers.get("host", ""),
                    "model": core.MODEL, "products": sorted(core.PRODUCT_FILES),
                    "looks": {k: sorted(v) for k, v in core.LOOKS.items()},
                    "store": store.BACKEND,
                    "key": bool(core.KEY),  # whether OPENAI_API_KEY is set — never the value
                    "key_check": {"ascii": (core.KEY or "").isascii(), "length": len(core.KEY or ""),
                                  "prefix": (core.KEY or "")[:8]},  # "sk-proj-" is a public prefix, not secret
                    "store_env": store.env_names(),  # variable names only, to diagnose the storage connection
                    "missing_assets": missing_assets()}
        data = json.dumps(body).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)
