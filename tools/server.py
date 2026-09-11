"""MIRRAI demo server: serves prototype/ and proxies try-on generation to the OpenAI image API.

The API key stays on this machine (read from ../.env) and is never sent to the browser.
Privacy: the customer's face photo is used for the request and then dropped; only the generated
result is kept in memory for 24h (or until deleted) so the phone can fetch it after scanning.

Run:  python3 tools/server.py            (port 4174, all interfaces so a phone on the same Wi-Fi can reach it)
"""
import base64, functools, json, os, pathlib, secrets, socket, sys, threading, time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs
import requests

ROOT = pathlib.Path(__file__).resolve().parent.parent
WEB = ROOT / "prototype"
TRYON = WEB / "assets" / "tryon"
PRODUCTS = WEB / "assets" / "products"
PORT = int(os.environ.get("PORT", 4174))
MODEL = "gpt-image-2"
TTL = 24 * 3600

# Vercel passes the key as an environment variable; locally it comes from ../.env.
KEY = os.environ.get("OPENAI_API_KEY") or next(
    (l.split("=", 1)[1].strip() for l in ((ROOT / ".env").read_text().splitlines() if (ROOT / ".env").exists() else [])
     if l.startswith("OPENAI_API_KEY=")), None)
if KEY:
    # A key pasted with a full-width IME or wrapped in quotes/spaces breaks the HTTP header; NFKC maps
    # full-width letters back to ASCII, and zero-width characters are dropped.
    import unicodedata
    KEY = "".join(ch for ch in unicodedata.normalize("NFKC", KEY) if ch.isprintable() and not ch.isspace()).strip("\"'")

# Keep in sync with prototype/data.js (v3 — American-retro street looks, see tools/v3_build.py)
LOOKS = {"L1": ["T7", "B9"], "L2": ["T8", "B10"], "L3": ["T9", "B11"], "L4": ["T10", "B12"], "L5": ["T11", "B13"],
         "L6": ["T12", "B14"], "L7": ["F7"], "L8": ["F9"]}
PRODUCT_FILES = {
    "T7": ("T7.webp", "a fitted black ribbed knit cardigan with small buttons, cinched by a black leather belt with a silver buckle"),
    "T8": ("T8.webp", "a white cropped halter-neck top with delicate lace panels and a fitted waistband"),
    "T9": ("T9.webp", "a grey cable-knit halter-neck sleeveless knit top, cropped at the waist"),
    "T10": ("T10.webp", "a cream cotton cropped blouse with short puff sleeves, a scoop neckline and a tie at the front"),
    "T11": ("T11.webp", "a fitted brown leopard-print off-the-shoulder short-sleeve top"),
    "T12": ("T12.webp", "a black-and-white thin-stripe off-the-shoulder long-sleeve knit top"),
    "B9": ("B9.webp", "a black short pleated mini skirt"),
    "B10": ("B10.webp", "dark indigo low-rise flared jeans with a thin red leather belt"),
    "B11": ("B11.webp", "charcoal flared knit trousers with a fold-over waistband"),
    "B12": ("B12.webp", "black-and-white small gingham check straight-leg trousers"),
    "B13": ("B13.webp", "vintage washed, lightly distressed blue denim shorts with a red leather belt"),
    "B14": ("B14.webp", "matching black-and-white thin-stripe knit shorts with a drawstring waist"),
    "F7": ("F7.webp", "a black fine-pinstripe mini dress with a Peter Pan collar, short puff sleeves, a button front and a "
                      "dropped waist with a pleated skirt"),
    "F8": ("F8.webp", "a charcoal-grey sleeveless fitted midi dress with small black polka dots and a round neck"),
    "F9": ("F9.webp", "a black cami midi dress with a tiny pink-and-white ditsy floral print, thin straps and a lace-trimmed neckline"),
    "F10": ("F10.webp", "a chocolate-brown ribbed knit long-sleeve henley maxi dress with a softly flared hem"),
}

# A/B test (tools/ab_test.py): asking the model to "give her the customer's face" pasted the selfie head onto the body
# (wrong scale, lighting and neck). Asking it to re-render the whole person, using the selfie only as an identity
# reference, fixed it — and a single call beat a two-step avatar → dress pipeline (the face drifted on the second pass).
IDENTITY = ("Use the face photo only as an identity reference for who she is: her facial features, face shape, skin tone and hair. "
            "Do not copy its camera angle, crop, lighting, colour cast or background. Re-render her head naturally as part of the "
            "full-body photo: realistic head-to-body proportions for her height, a natural neck that connects smoothly into the "
            "shoulders, the same soft front studio lighting and white balance on face, neck, arms and legs, and one consistent skin "
            "tone across the whole body. The result must look like a single photograph taken in one shot, not a composite. ")

# The body comes from the customer's height and usual size (never weight). Reference images only set the studio look.
HEIGHTS = {"155": 152, "160": 160, "165": 165, "170": 170, "175": 175, "180": 183}
BUILD = {"XS": "petite, very slim frame, narrow shoulders and hips", "S": "slim frame", "M": "average, balanced proportions",
         "L": "softly curvy, fuller bust and hips", "XL": "plus-size, full bust, waist and hips",
         "XXL": "plus-size, fuller figure throughout", "3XL": "plus-size, very full figure throughout"}
DEFAULT_HEIGHT = "165"  # the pre-rendered demo images show a 165 cm woman in size M or XL

# Flattering, but honest: better posture, proportion and camera — never a smaller body than her size
# (a try-on that slims people sells the wrong expectation and comes back as a return).
FLATTER = ("Within that true body, show her at her most flattering and natural: tall, upright posture with the neck long, "
           "shoulders relaxed, down and open, chest lifted and the spine straight; a balanced head-to-shoulder ratio (shoulders "
           "about two head-widths wide, head not oversized); a clearly readable waist that sits visibly narrower than the bust "
           "and hips in the proportion natural to her size; weight balanced on both feet so the legs look long and straight; "
           "a camera at chest height with no wide-angle distortion. Make it flattering only through posture, proportion, "
           "camera and the way the clothes fit — do not slim her, shrink her waist, hips, arms or thighs, lengthen her legs "
           "artificially or change her size. ")


def size_group(size):
    return "M" if size in ("XS", "S", "M") else "XL"


def body_prompt(height, size, dressed=True, flatter=True):
    h, size = HEIGHTS.get(str(height), 165), (size if size in BUILD else "M")
    spec = (f"Body specification — follow it exactly: a woman, {h} cm tall, who normally wears size {size} ({BUILD[size]}). "
            f"Build the whole body from these numbers: head about 1/7.5 of her height, torso and leg length in proportion to {h} cm, "
            f"and shoulder, bust, waist and hip width matching size {size}. ")
    scale = ("Use a fixed studio scale so different people are comparable: the camera is fixed at 1.2 m high and 3 m away, the "
             "floor line sits at the same position near the bottom of the frame, and the top edge of the image is 200 cm above the "
             f"floor. The top of her head must therefore be at {round(h / 2)}% of the height between the floor line and the top edge "
             "— a 160 cm woman stands visibly shorter in the frame than a 175 cm woman. ")
    fit = (f"Show how each garment really falls on a {h} cm, size {size} body: hems, sleeves and trouser lengths land where they "
           "would on her (longer on a shorter woman, shorter on a taller one), and the fit — loose, fitted or snug — reflects her "
           "size. ") if dressed else ""
    return spec + (FLATTER if flatter else "") + scale + fit


def prompt_tryon(desc, body, has_face, shoe):
    return ("Image 1 is a studio reference: use it ONLY for the background, lighting, camera setup, standing pose and framing — "
            f"not for the body or shoes. The next images are product photos: {desc}. "
            + ("The last image is a photo of the customer. " if has_face else "")
            + f"Create a full-body studio photo of {'the customer' if has_face else 'a woman'} wearing these garments "
            f"with {SHOES[shoe]}. " + body + (IDENTITY if has_face else "")
            + "Reproduce each garment and the shoes faithfully (colour, print, fabric, neckline, sleeves). Photorealistic.")


def prompt_curated(body, has_face, shoe):
    return ("Image 1 shows the exact outfit to use — copy the garments, shoes, styling, background and lighting from it, but NOT "
            "the person or body. " + ("Image 2 is a photo of the customer. " if has_face else "")
            + f"Create the same outfit photo, with {SHOES[shoe]}, on {'the customer' if has_face else 'a woman'} with this body. "
            + body + (IDENTITY if has_face else "") + "Photorealistic.")


def prompt_avatar(body, has_face):
    return ("Image 1 is a studio reference for background, lighting, pose and framing only. "
            + ("Image 2 is a photo of the customer. " if has_face else "")
            + f"Create a full-body studio photo of {'the customer' if has_face else 'a woman'} in a plain grey fitted tank top, "
            "grey leggings and white sneakers. " + body + (IDENTITY if has_face else "") + "Photorealistic.")

RESULTS = {}  # sid -> {"t": token, "status": "pending"|"ready"|"error", "image": dataURL, "at": ts}
LOCK = threading.Lock()


def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(("8.8.8.8", 80)); ip = s.getsockname()[0]; s.close()
        return ip
    except OSError:
        return "127.0.0.1"


def data_url_bytes(url):
    return base64.b64decode(url.split(",", 1)[1])


def openai_edit(images, prompt):
    """images: list of (filename, bytes, mime). Asks for JPEG output, falls back to the defaults if unsupported.
    (gpt-image-2 rejects input_fidelity, so it is not sent.)"""
    files = [("image[]", img) for img in images]
    base = {"model": MODEL, "prompt": prompt, "size": "1024x1536", "quality": "medium", "n": 1}
    for extra in ({"output_format": "jpeg", "output_compression": 85}, {}):
        r = requests.post("https://api.openai.com/v1/images/edits", headers={"Authorization": f"Bearer {KEY}"},
                          files=files, data={**base, **extra}, timeout=240)
        if r.status_code == 200:
            fmt = extra.get("output_format", "png")
            return f"data:image/{fmt};base64," + r.json()["data"][0]["b64_json"]
        if r.status_code != 400:
            break
    raise RuntimeError(f"OpenAI HTTP {r.status_code}: {r.text[:300]}")


# Styling-only shoes (not sold): the bottom or dress picks one of three, covering all 39 combinations.
SHOES = {"sneaker": "clean white leather low-top sneakers with white crew socks",
         "boot": "black leather knee-high boots with a low block heel",
         "loafer": "black leather penny loafers"}
SHOE_FOR = {"B11": "sneaker", "B14": "sneaker",
            "B9": "boot", "B13": "boot", "F9": "boot", "F10": "boot",
            "B10": "loafer", "B12": "loafer", "F7": "loafer", "F8": "loafer"}
SHOE_DIR = WEB / "assets" / "shoes"


def shoe_for(items):
    full = next((p for p in items if p.startswith("F")), None)
    bottom = next((p for p in items if p.startswith("B")), None)
    return SHOE_FOR.get(full or bottom, "sneaker")


def shoe_img(key):
    return (f"{key}.png", (SHOE_DIR / f"{key}.png").read_bytes(), "image/png")


def product_img(pid):
    fname, desc = PRODUCT_FILES[pid]
    return (fname, (PRODUCTS / fname).read_bytes(), "image/webp"), desc


def generate_tryon(face, size, height, look, items, flatter=True):
    face_img = ("face.jpg", data_url_bytes(face), "image/jpeg") if face else None
    g, body, shoe = size_group(size), body_prompt(height, size, flatter=flatter), shoe_for(items)
    if look in LOOKS:  # curated look: its pre-rendered image (already in the right shoes) is the outfit reference
        ref = (f"{look}_{g}.png", (TRYON / f"{look}_{g}.png").read_bytes(), "image/png")
        return openai_edit([ref] + ([face_img] if face_img else []), prompt_curated(body, bool(face_img), shoe))
    base = (f"base_{g}.png", (TRYON / f"base_{g}.png").read_bytes(), "image/png")
    prods = [product_img(p) for p in items if p in PRODUCT_FILES]
    refs = [img for img, _ in prods] + [shoe_img(shoe)]
    desc = "; ".join([f"image {i + 2} is {d}" for i, (_, d) in enumerate(prods)] + [f"image {len(prods) + 2} shows the shoes"])
    images = [base] + refs + ([face_img] if face_img else [])
    return openai_edit(images, prompt_tryon(desc, body, bool(face_img), shoe))


def generate_avatar(face, size, height):
    g = size_group(size)
    base = (f"base_{g}.png", (TRYON / f"base_{g}.png").read_bytes(), "image/png")
    face_img = [("face.jpg", data_url_bytes(face), "image/jpeg")] if face else []
    return openai_edit([base] + face_img, prompt_avatar(body_prompt(height, size, dressed=False), bool(face)))


def is_prerendered(size, height):
    return str(height) == DEFAULT_HEIGHT and size in ("M", "XL")


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        if args and isinstance(args[0], str) and "/api/" in args[0]:  # error logs pass an HTTPStatus here
            sys.stderr.write("%s\n" % (fmt % args))

    def json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store"); self.send_header("Content-Length", str(len(body)))
        self.end_headers(); self.wfile.write(body)

    def body(self):
        return json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")

    def sweep(self):
        now = time.time()
        with LOCK:
            for sid in [s for s, v in RESULTS.items() if now - v["at"] > TTL]:
                RESULTS.pop(sid, None)

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/api/config":
            # The kiosk compares these with data.js so a server left running on an old catalogue is caught at once.
            return self.json(200, {"ok": True, "lan": f"http://{lan_ip()}:{PORT}", "model": MODEL,
                                   "products": sorted(PRODUCT_FILES), "looks": {k: sorted(v) for k, v in LOOKS.items()}})
        if u.path == "/api/result":
            self.sweep(); q = parse_qs(u.query); sid, t = q.get("sid", [""])[0], q.get("t", [""])[0]
            with LOCK:
                r = RESULTS.get(sid)
            if not r or not secrets.compare_digest(r["t"], t):
                return self.json(200, {"status": "none"})
            return self.json(200, {"status": r["status"], "image": r.get("image")})
        return super().do_GET()

    def do_POST(self):
        u = urlparse(self.path)
        if u.path not in ("/api/tryon", "/api/avatar"):
            return self.json(404, {"error": "not found"})
        d = self.body()
        size = d.get("size") if d.get("size") in BUILD else "M"
        height = str(d.get("height", DEFAULT_HEIGHT))
        try:
            if u.path == "/api/avatar":
                return self.json(200, {"image": generate_avatar(d.get("face"), size, height)})
            sid, t = str(d.get("sid", "")), str(d.get("t", ""))
            unknown = [p for p in d.get("items", []) if p not in PRODUCT_FILES]
            if unknown or not d.get("items"):  # never silently drop garments and return the grey base layer
                sys.stderr.write(f"unknown items {unknown} — restart the server after catalogue changes\n")
                return self.json(409, {"error": "unknown_items", "items": unknown})
            # Default face + curated look + the exact body the demo images were rendered for: nothing to generate.
            if not d.get("face") and d.get("look") in LOOKS and is_prerendered(size, height):
                return self.json(200, {"image": None, "static": True})
            with LOCK:
                RESULTS[sid] = {"t": t, "status": "pending", "at": time.time()}
            image = generate_tryon(d.get("face"), size, height, d.get("look"), d.get("items", []))
            with LOCK:
                RESULTS[sid] = {"t": t, "status": "ready", "image": image, "at": time.time()}
            return self.json(200, {"image": image})
        except Exception as e:  # never leak details to the kiosk UI; it shows the product-photo fallback
            sys.stderr.write(f"generation failed: {e}\n")
            with LOCK:
                if d.get("sid") in RESULTS:
                    RESULTS[d["sid"]]["status"] = "error"
            return self.json(502, {"error": "generation_failed"})
        finally:
            d.pop("face", None)  # drop the face photo as soon as the request is done

    def do_DELETE(self):
        u = urlparse(self.path); q = parse_qs(u.query)
        sid, t = q.get("sid", [""])[0], q.get("t", [""])[0]
        with LOCK:
            if sid in RESULTS and secrets.compare_digest(RESULTS[sid]["t"], t):
                RESULTS.pop(sid)
        return self.json(200, {"ok": True})


if __name__ == "__main__":
    if not KEY:
        sys.exit("OPENAI_API_KEY missing in .env")
    handler = functools.partial(Handler, directory=str(WEB))
    print(f"MIRRAI demo server: http://localhost:{PORT}  (phone on same Wi-Fi: http://{lan_ip()}:{PORT})")
    ThreadingHTTPServer(("0.0.0.0", PORT), handler).serve_forever()
