"""Generate try-on demo assets with the OpenAI image API.

Usage:
  python3 tools/gen_tryon.py base          # base avatars M, then XL (edited from M to keep the same face)
  python3 tools/gen_tryon.py looks [L1 ..] # try-on images for looks x sizes (default: all)

Reads OPENAI_API_KEY from ../.env. Never prints the key.
Every prompt sent is appended to tools/prompts_log.md (material for the AI-usage write-up).
"""
import base64, datetime, json, os, sys, pathlib, requests

ROOT = pathlib.Path(__file__).resolve().parent.parent
PRODUCTS = ROOT / "上衣&下装"
OUT = ROOT / "prototype" / "assets" / "tryon"
LOG = ROOT / "tools" / "prompts_log.md"
MODEL = "gpt-image-2"
SIZE = "1024x1536"

def load_key():
    for line in (ROOT / ".env").read_text().splitlines():
        if line.startswith("OPENAI_API_KEY="):
            return line.split("=", 1)[1].strip()
    sys.exit("OPENAI_API_KEY missing in .env")

KEY = load_key()
HEADERS = {"Authorization": f"Bearer {KEY}"}

STYLE = (
    "Photorealistic full-body fashion e-commerce photo, vertical 2:3. Seamless warm light-grey studio "
    "background (#ECE9E3), soft even front lighting, subtle floor shadow. Full body visible head to toe "
    "with margin above the head and below the feet, camera at chest height, straight-on view."
)

BASE_M = (
    "A fictional woman in her late 20s (not a real or famous person), East Asian, shoulder-length dark hair, "
    "natural makeup, calm friendly expression, facing the camera. Height about 165 cm, standard medium build "
    "(US women's size M). Standing straight, arms relaxed slightly away from the body. Wearing a plain fitted "
    "light-grey tank top, plain light-grey leggings and simple white sneakers. " + STYLE
)

BASE_XL = (
    "Keep exactly the same woman from the reference image: identical face, facial features, hairstyle, skin "
    "tone, expression, pose, outfit, background and lighting. Change only her body to a plus-size build "
    "(US women's size XL): fuller bust, waist, hips, arms and thighs, same height about 165 cm, natural and "
    "flattering proportions. " + STYLE
)

LOOK_PROMPT = (
    "Dress the woman from image 1 in the garment(s) shown in the other image(s): {garments}. "
    "Preserve her face, facial features, hairstyle, skin tone, body shape and size, pose, "
    "background and lighting exactly as in image 1. Reproduce each garment faithfully from its product photo: "
    "same color, print, fabric texture, neckline, sleeves, length and details; realistic drape and fit for "
    "her body size. Remove the grey base layer wherever the new garments cover it. "
    "Replace her white sneakers with {shoe} — the last image shows the shoes. " + STYLE
)

# Three styling-only shoes cover all 39 combinations; the bottom or dress decides which one.
SHOES = {
    "sneaker": "clean white leather low-top sneakers with white crew socks",
    "boot": "black leather knee-high boots with a low block heel",
    "loafer": "black leather penny loafers",
}
SHOE_DIR = ROOT / "prototype" / "assets" / "shoes"
SHOE_PROMPT = ("E-commerce product photo of a pair of {desc}, unbranded, no logos, three-quarter side view, centered on a "
               "seamless very light grey background (#F4F4F2), soft shadow, vertical 2:3, catalog style.")

# v2 (confirmed L1–L6). Official product photos live in prototype/assets/products.
OFFICIAL = ROOT / "prototype" / "assets" / "products"
# v3 looks and garments are defined in tools/v3_build.py (LOOKS / SHOES); regenerate them with that script.
# The mapping below is kept only for the `looks` command and mirrors v3.
P = {k: OFFICIAL / f"{k}.webp" for k in ("T7", "T8", "T9", "T10", "T11", "T12", "B9", "B10", "B11", "B12", "B13", "B14")}
LOOKS = {
    "L1": [("T7", "a fitted black ribbed knit cardigan with a silver-buckle belt"), ("B9", "a black short pleated mini skirt")],
    "L2": [("T8", "a white cropped lace halter top"), ("B10", "dark indigo low-rise flared jeans with a thin red belt")],
    "L3": [("T9", "a grey cable-knit halter top"), ("B11", "charcoal fold-over flared knit trousers")],
    "L4": [("T10", "a cream puff-sleeve tie-front blouse"), ("B12", "black-and-white gingham straight trousers")],
    "L5": [("T11", "a brown leopard off-shoulder top"), ("B13", "washed distressed denim shorts with a red belt")],
    "L6": [("T12", "a black-and-white stripe off-shoulder knit top"), ("B14", "matching stripe knit shorts")],
}
LOOK_SHOE = {"L1": "boot", "L2": "loafer", "L3": "sneaker", "L4": "loafer", "L5": "boot", "L6": "sneaker"}

def log(kind, name, prompt, refs):
    with LOG.open("a") as f:
        f.write(f"\n## {datetime.datetime.now():%Y-%m-%d %H:%M} · {kind} · {name}\n")
        f.write(f"- model: {MODEL}, size: {SIZE}\n- reference images: {', '.join(refs) or 'none'}\n\n> {prompt}\n")

def save(resp, path):
    if resp.status_code != 200:
        sys.exit(f"{path.name}: HTTP {resp.status_code} {resp.text[:400]}")
    path.write_bytes(base64.b64decode(resp.json()["data"][0]["b64_json"]))
    print("saved", path.relative_to(ROOT))

def generate(prompt, path):
    log("generate", path.name, prompt, [])
    r = requests.post("https://api.openai.com/v1/images/generations", headers=HEADERS, timeout=300,
                      json={"model": MODEL, "prompt": prompt, "size": SIZE, "quality": "high", "n": 1})
    save(r, path)

def edit(prompt, images, path):
    log("edit", path.name, prompt, [p.name for p in images])
    files = [("image[]", (p.name, p.read_bytes(), "image/webp" if p.suffix == ".webp" else "image/png")) for p in images]
    r = requests.post("https://api.openai.com/v1/images/edits", headers=HEADERS, timeout=300, files=files,
                      data={"model": MODEL, "prompt": prompt, "size": SIZE, "quality": "high", "n": 1})
    save(r, path)

def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    OUT.mkdir(parents=True, exist_ok=True)
    if cmd == "base":
        generate(BASE_M, OUT / "base_M.png")
        edit(BASE_XL, [OUT / "base_M.png"], OUT / "base_XL.png")
    elif cmd == "shoes":
        SHOE_DIR.mkdir(parents=True, exist_ok=True)
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(3) as ex:
            list(ex.map(lambda k: generate(SHOE_PROMPT.format(desc=SHOES[k]), SHOE_DIR / f"{k}.png"), SHOES))
    elif cmd == "looks":
        from concurrent.futures import ThreadPoolExecutor
        jobs = []
        for look in (sys.argv[2:] or LOOKS):
            desc = "; ".join(f"image {i + 2} is {d}" for i, (_, d) in enumerate(LOOKS[look]))
            shoe = LOOK_SHOE[look]
            for size in ("M", "XL"):
                refs = [OUT / f"base_{size}.png"] + [P[k] for k, _ in LOOKS[look]] + [SHOE_DIR / f"{shoe}.png"]
                jobs.append((LOOK_PROMPT.format(garments=desc, shoe=SHOES[shoe]), refs, OUT / f"{look}_{size}.png"))
        with ThreadPoolExecutor(5) as ex:
            list(ex.map(lambda j: edit(*j), jobs))
    else:
        print(__doc__)

if __name__ == "__main__":
    main()
