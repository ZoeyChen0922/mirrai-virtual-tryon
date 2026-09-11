import hmac
from _common import Base, store


class handler(Base):
    def _lookup(self):
        q = self.query()
        r = store.get(f"res:{q.get('sid', '')}")
        ok = bool(r) and hmac.compare_digest(str(r.get("t", "")), q.get("t", ""))
        return q.get("sid", ""), (r if ok else None)

    def do_GET(self):
        _, r = self._lookup()
        self.send_json(200, {"status": r["status"], "image": r.get("image")} if r else {"status": "none"})

    def do_DELETE(self):
        sid, r = self._lookup()
        if r:
            store.delete(f"res:{sid}")
        self.send_json(200, {"ok": True})
