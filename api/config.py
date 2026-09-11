from _common import Base, core, store


class handler(Base):
    def do_GET(self):
        # ok=false (no key or no store) → the kiosk falls back to its pre-rendered demo images.
        self.send_json(200, {
            "ok": bool(core.KEY) and store.available(),
            "lan": "https://" + self.headers.get("host", ""),
            "model": core.MODEL,
            "products": sorted(core.PRODUCT_FILES),
            "looks": {k: sorted(v) for k, v in core.LOOKS.items()},
        })
