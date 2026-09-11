"""v3: new fictional city-casual model + six American-retro street looks (user-approved samples L1/L2).

  python3 tools/v3_build.py all

Order keeps one garment identical everywhere:
  1. base_XL (from base_M), M try-ons L3–L6 (L1/L2 reuse the approved samples), knee boots + loafers
  2. product photos — each garment lifted out of its M try-on
  3. XL try-ons — the same outfit re-fitted onto base_XL
Outputs go to prototype/assets/v3-model/{tryon,products,shoes}. A limiter keeps us under 5 input images / minute.
"""
import pathlib, shutil, sys, threading, time
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import gen_tryon as g  # noqa: E402

V3 = g.ROOT / "prototype" / "assets" / "v3-model"
TRY, PROD, SHOE = V3 / "tryon", V3 / "products", V3 / "shoes"

SHOES = {
    "boot": "black leather knee-high boots with a low block heel",
    "loafer": "black leather penny loafers",
    "sneaker": "clean white leather low-top sneakers with white crew socks",
}
# look: (top id, top description, bottom id, bottom description, shoe)
LOOKS = {
    "L1": ("T7", "a fitted black ribbed knit cardigan with small buttons, cinched by a black leather belt with a silver buckle",
           "B9", "a black short pleated mini skirt", "boot"),
    "L2": ("T8", "a white cropped halter-neck top with delicate lace panels and a fitted waistband",
           "B10", "dark indigo low-rise flared jeans with a thin red leather belt", "loafer"),
    "L3": ("T9", "a grey cable-knit halter-neck sleeveless knit top, cropped at the waist",
           "B11", "charcoal flared knit trousers with a fold-over waistband", "sneaker"),
    "L4": ("T10", "a cream cotton cropped blouse with short puff sleeves, a scoop neckline and a tie at the front",
           "B12", "black-and-white small gingham check straight-leg trousers", "loafer"),
    "L5": ("T11", "a fitted brown leopard-print off-the-shoulder short-sleeve top",
           "B13", "vintage washed, lightly distressed blue denim shorts with a red leather belt", "boot"),
    "L6": ("T12", "a black-and-white thin-stripe off-the-shoulder long-sleeve knit top",
           "B14", "matching black-and-white thin-stripe knit shorts with a drawstring waist", "sneaker"),
}
# Dress looks (pre-rendered so dresses also work offline) and gallery-only dresses (product photo only).
DRESS_LOOKS = {
    "L7": ("F7", "a black fine-pinstripe mini dress with a Peter Pan collar, short puff sleeves, a button front and a dropped "
                 "waist with a pleated skirt", "loafer"),
    "L8": ("F9", "a black cami midi dress with a tiny pink-and-white ditsy floral print, thin straps and a delicate black lace "
                 "trim at the neckline", "boot"),
}
DRESS_ONLY = {
    "F8": "a charcoal-grey sleeveless fitted midi dress with small black polka dots and a round neck",
    "F10": "a chocolate-brown ribbed knit long-sleeve henley maxi dress, fitted through the body with a softly flared hem",
}
PRODUCT_STYLE = ("E-commerce product photo of the single garment only — no person, no mannequin, no hanger — shown flat from the "
                 "front, centred on a seamless very light grey background (#F4F4F2), soft even light, subtle shadow, vertical 2:3, "
                 "catalogue style.")

# --- stay under the account limit: 5 input images per rolling minute ---
_lock, _log = threading.Lock(), []


def budget(n):
    while True:
        with _lock:
            now = time.time()
            _log[:] = [(t, k) for t, k in _log if now - t < 62]
            if sum(k for _, k in _log) + n <= 5:
                _log.append((now, n)); return
        time.sleep(3)


def edit(prompt, images, out):
    if out.exists():
        return print("skip", out.name)
    for attempt in range(4):
        budget(len(images))
        try:
            return g.edit(prompt, images, out)
        except SystemExit as e:
            print("retry", out.name, str(e)[:80]); time.sleep(20)


def generate(prompt, out):
    if out.exists():
        return print("skip", out.name)
    g.generate(prompt, out)


def dress_prompt(look):
    if look in DRESS_LOOKS:
        _, ddesc, shoe = DRESS_LOOKS[look]; outfit = f"{ddesc}; {SHOES[shoe]}"
    else:
        _, tdesc, _, bdesc, shoe = LOOKS[look]; outfit = f"{tdesc}; {bdesc}; {SHOES[shoe]}"
    return ("Dress the woman from image 1 in this outfit, American retro street style: " f"{outfit}. "
            "Keep her face, hair, skin tone, body shape and size (US size M), pose, background and lighting exactly as in image 1; "
            "remove the grey base layer. Natural, flattering upright posture. " + g.STYLE)


def phase1():
    base_m = V3 / "base_M.png"
    jobs = [lambda: edit(g.BASE_XL, [base_m], V3 / "base_XL.png")]
    for look in ("L1", "L2"):
        src = V3 / f"sample_{look}_M.png"
        if not (TRY / f"{look}_M.png").exists():
            shutil.copy(src, TRY / f"{look}_M.png")
    for look in ("L3", "L4", "L5", "L6", "L7", "L8"):
        jobs.append(lambda l=look: edit(dress_prompt(l), [base_m], TRY / f"{l}_M.png"))
    for key in ("boot", "loafer"):
        jobs.append(lambda k=key: generate(g.SHOE_PROMPT.format(desc=SHOES[k]), SHOE / f"{k}.png"))
    for pid, desc in DRESS_ONLY.items():  # text-to-image: uses no input-image budget
        jobs.append(lambda p=pid, d=desc: generate(f"E-commerce product photo of {d}. " + PRODUCT_STYLE, PROD / f"{p}.png"))
    with ThreadPoolExecutor(3) as ex:
        list(ex.map(lambda f: f(), jobs))


def phase2():
    jobs = []
    garments = {look: ((top, tdesc), (bottom, bdesc)) for look, (top, tdesc, bottom, bdesc, _) in LOOKS.items()}
    garments.update({look: ((pid, desc),) for look, (pid, desc, _) in DRESS_LOOKS.items()})
    for look, pieces in garments.items():
        src = TRY / f"{look}_M.png"
        for pid, desc in pieces:
            prompt = (f"Image 1 shows a woman wearing an outfit. Create a product photo of only {desc} she is wearing — the exact "
                      "same garment: identical colour, pattern, fabric, neckline, sleeves, length and details. Leave out any other "
                      "clothing, shoes and accessories" + (" except the belt, which is sold with it" if "belt" in desc else "")
                      + ". " + PRODUCT_STYLE)
            jobs.append((prompt, [src], PROD / f"{pid}.png"))
        xl_prompt = ("Image 1 is a full-body fashion photo. Image 2 is the same woman in a plus-size body (US size XL). Create the "
                     "same photo as image 1 — identical outfit, colours, patterns, shoes, pose, background, lighting and framing — "
                     "but with the body shape and size of image 2, the clothes fitting that body realistically. Keep her face and "
                     "hair. Flattering upright posture, but do not slim her. " + g.STYLE)
        jobs.append((xl_prompt, [src, V3 / "base_XL.png"], TRY / f"{look}_XL.png"))
    with ThreadPoolExecutor(3) as ex:
        list(ex.map(lambda j: edit(*j), jobs))


def webp():
    for p in TRY.glob("*.png"):
        Image.open(p).convert("RGB").resize((768, 1152), Image.LANCZOS).save(p.with_suffix(".webp"), "WEBP", quality=82)
    for p in list(PROD.glob("*.png")) + list(SHOE.glob("*.png")):
        Image.open(p).convert("RGB").resize((480, 720), Image.LANCZOS).save(p.with_suffix(".webp"), "WEBP", quality=88)
    for b in ("base_M", "base_XL"):
        Image.open(V3 / f"{b}.png").convert("RGB").resize((768, 1152), Image.LANCZOS).save(V3 / f"{b}.webp", "WEBP", quality=82)


if __name__ == "__main__":
    for d in (TRY, PROD, SHOE):
        d.mkdir(parents=True, exist_ok=True)
    if sys.argv[1:] == ["all"]:
        phase1(); print("phase1 done"); phase2(); print("phase2 done"); webp(); print("webp done")
    else:
        print(__doc__)
