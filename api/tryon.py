import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # Vercel does not put api/ on the import path
from _common import Base, core, store, shrink, within_limits  # noqa: E402


class handler(Base):
    def do_POST(self):
        d = self.body()
        size = d.get("size") if d.get("size") in core.BUILD else "M"
        height = str(d.get("height", core.DEFAULT_HEIGHT))
        sid, t, items = str(d.get("sid", "")), str(d.get("t", "")), d.get("items", [])
        if not items or any(p not in core.PRODUCT_FILES for p in items):
            return self.send_json(409, {"error": "unknown_items"})
        if not d.get("face") and d.get("look") in core.LOOKS and core.is_prerendered(size, height):
            return self.send_json(200, {"image": None, "static": True})
        if not within_limits(sid):
            return self.send_json(429, {"error": "limit_reached"})  # kiosk shows the product-photo fallback
        store.put(f"res:{sid}", {"t": t, "status": "pending"})
        try:
            image = shrink(core.generate_tryon(d.get("face"), size, height, d.get("look"), items))
        except Exception as e:  # never leak details to the kiosk
            sys.stderr.write(f"generation failed: {e}\n")
            store.put(f"res:{sid}", {"t": t, "status": "error"})
            # error type + short message only (no secrets) so failures can be diagnosed without the Vercel logs
            return self.send_json(502, {"error": "generation_failed", "detail": f"{type(e).__name__}: {str(e)[:160]}"})
        store.put(f"res:{sid}", {"t": t, "status": "ready", "image": image})  # expires after 24h
        self.send_json(200, {"image": image})
