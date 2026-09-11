import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # Vercel does not put api/ on the import path
from _common import Base, core, shrink, within_limits  # noqa: E402


class handler(Base):
    def do_POST(self):
        d = self.body()
        size = d.get("size") if d.get("size") in core.BUILD else "M"
        if not within_limits(str(d.get("sid", ""))):
            return self.send_json(429, {"error": "limit_reached"})
        try:
            image = shrink(core.generate_avatar(d.get("face"), size, str(d.get("height", core.DEFAULT_HEIGHT))))
        except Exception as e:
            sys.stderr.write(f"avatar failed: {e}\n")
            return self.send_json(502, {"error": "generation_failed"})
        self.send_json(200, {"image": image})
