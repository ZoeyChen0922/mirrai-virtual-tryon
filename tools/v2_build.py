"""Build the confirmed L1–L6 (v2) assets into prototype/assets/v2-final/ before they replace the official ones.

  python3 tools/v2_build.py products   # 4 product photos that match the v2 try-ons (F6, T2, T6, B8)
  python3 tools/v2_build.py shoes      # put each look in its styling shoe (L1, L3, L4, L6 × M/XL)
  python3 tools/v2_build.py assemble   # copy L2/L5 + reused products, write 480×720 / 768×1152 WebP

Prompts are appended to tools/prompts_log.md by gen_tryon.edit.
"""
import pathlib, shutil, sys
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import gen_tryon as g  # noqa: E402  (edit() + prompt logging)

ROOT = g.ROOT
ASSETS = ROOT / "prototype" / "assets"
V2 = ASSETS / "v2-review"
FINAL = ASSETS / "v2-final"
CROPS = FINAL / "_crops"

PRODUCT_STYLE = ("E-commerce product photo of the single garment only — no person, no mannequin, no hanger — shown flat from the "
                 "front, centred on a seamless very light grey background (#F4F4F2), soft even light, subtle shadow, vertical 2:3, "
                 "the same catalogue style as a Zara product photo.")

SHOE_DESC = {
    "boot": "black leather pointed-toe ankle boots with a slim mid heel",
    "sandal": "nude beige leather strappy sandals with a low block heel",
}
# Styling decision for the confirmed looks (L2 already wears sandals, L5 keeps the white sneakers).
LOOK_SHOE = {"L1": "boot", "L3": "sandal", "L4": "sandal", "L6": "boot"}


def crop(look, box, name):
    CROPS.mkdir(parents=True, exist_ok=True)
    out = CROPS / f"{name}.png"
    Image.open(V2 / "tryon" / f"{look}_M.png").crop(box).save(out)
    return out


def products():
    out = FINAL / "products"; out.mkdir(parents=True, exist_ok=True)
    jobs = [
        ("Edit this product photo of a halter maxi dress: remove every printed leaf and branch so the dress is one solid, plain "
         "ivory colour with no print, pattern or motif anywhere. Keep the exact silhouette and construction: high halter neck with "
         "back fastening, fitted bodice with darts, waist seam, long straight skirt with a front side slit. " + PRODUCT_STYLE,
         [V2 / "products" / "F6-abstract-halter-dress.png"], out / "F6-ivory-halter-dress.png"),
        ("Image 1 is a product photo of a satin camisole with gathered neckline, thin straps and a row of small front buttons. "
         "Image 2 shows the confirmed version of this camisole being worn. Recreate image 1's product photo with the garment in "
         "exactly the colour and sheen seen in image 2 — a champagne-grey (greige) satin — keeping the gathered neckline, thin "
         "straps, front buttons and relaxed length. " + PRODUCT_STYLE,
         [g.PRODUCTS / "04661107533-e1.webp", crop("L4", (250, 240, 780, 700), "L4_top")], out / "T2-champagne-satin-cami.png"),
        ("Image 1 shows a black top worn by a model. Create a product photo of exactly this top on its own: matte black jersey, "
         "asymmetric one-shoulder neckline running diagonally, one shoulder bare and sleeveless, the other side with a long fitted "
         "sleeve, soft gathered ruching at the side of the waist. Same fabric, colour and proportions as in image 1. " + PRODUCT_STYLE,
         [crop("L6", (230, 230, 800, 720), "L6_top")], out / "T6-black-one-shoulder-top.png"),
        ("Image 1 is a product photo of a wrap denim skort. Image 2 shows the confirmed version being worn. Recreate image 1's "
         "product photo with the skort in exactly the colour and wash seen in image 2 — a dark chocolate-brown washed denim with "
         "tonal topstitching — keeping the high waist, wrap front panel, pockets, metal button and short length. " + PRODUCT_STYLE,
         [g.PRODUCTS / "07484062407-e1.webp", crop("L5", (230, 560, 800, 900), "L5_bottom")], out / "B8-brown-denim-skort.png"),
    ]
    with ThreadPoolExecutor(4) as ex:
        list(ex.map(lambda j: g.edit(*j), jobs))


def shoes():
    out = FINAL / "tryon"; out.mkdir(parents=True, exist_ok=True)
    jobs = []
    for look, shoe in LOOK_SHOE.items():
        for size in ("M", "XL"):
            prompt = ("Image 1 is a finished full-body fashion photo. Change only her footwear: replace the white sneakers with "
                      f"{SHOE_DESC[shoe]}, exactly as shown in image 2. Keep everything else exactly as in image 1 — her face, hair, "
                      "body shape and size, pose, foot position, clothing, background, lighting and framing. Photorealistic.")
            jobs.append((prompt, [V2 / "tryon" / f"{look}_{size}.png", ASSETS / "shoes" / f"{shoe}.png"], out / f"{look}_{size}.png"))
    with ThreadPoolExecutor(5) as ex:
        list(ex.map(lambda j: g.edit(*j), jobs))


def assemble():
    tryon, prods = FINAL / "tryon", FINAL / "products"
    shutil.copy(V2 / "tryon" / "L5_M.png", tryon / "L5_M.png")      # zebra + brown skort keeps white sneakers
    shutil.copy(V2 / "tryon" / "L5_XL.png", tryon / "L5_XL.png")
    shutil.copy(ASSETS / "tryon" / "L2_M.png", tryon / "L2_M.png")   # L2 kept as-is (already in sandals)
    shutil.copy(ASSETS / "tryon" / "L2_XL.png", tryon / "L2_XL.png")
    shutil.copy(V2 / "products" / "F5-charcoal-denim-dress.png", prods / "F5-charcoal-denim-dress.png")
    for p in tryon.glob("*.png"):
        Image.open(p).convert("RGB").resize((768, 1152), Image.LANCZOS).save(p.with_suffix(".webp"), "WEBP", quality=82)
    for p in prods.glob("*.png"):
        Image.open(p).convert("RGB").resize((480, 720), Image.LANCZOS).save(p.with_suffix(".webp"), "WEBP", quality=88)
    print("webp:", sorted(x.name for x in FINAL.rglob("*.webp")))


if __name__ == "__main__":
    {"products": products, "shoes": shoes, "assemble": assemble}.get(sys.argv[1] if len(sys.argv) > 1 else "", lambda: print(__doc__))()
