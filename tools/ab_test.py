"""A/B test for the head/body 'pasted' problem. Usage: python3 tools/ab_test.py A|B|C  (uses tools/test_face.jpg, look T2+B2, size M)
A = current single-step prompt + input_fidelity high (baseline)
B = two-step: re-render avatar with the new identity prompt, then dress the avatar without touching the head
C = single-step with the new identity prompt, default fidelity
"""
import base64, pathlib, sys, time, requests
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import server as s

OUT = pathlib.Path('/private/tmp/claude-501/-Users-ruohanchen/e91b8e2d-96f8-49c9-a834-80693eee3777/scratchpad')
FACE = s.data_url_bytes('x,' + base64.b64encode((s.ROOT / 'tools/test_face.jpg').read_bytes()).decode())

IDENTITY = ("Use the face photo only as an identity reference for who she is: her facial features, face shape, skin tone and hair. "
            "Do not copy its camera angle, crop, lighting, colour cast or background. Re-render her head naturally as part of the "
            "full-body photo: realistic head-to-body proportions for a 165 cm woman (head about one-seventh of her height), a natural "
            "neck that connects smoothly into the shoulders, the same soft front studio lighting and white balance on face, neck, arms "
            "and legs, and one consistent skin tone across the whole body. The result must look like a single photograph taken in one "
            "shot, not a composite.")

def edit(images, prompt, fidelity=None):
    data = {"model": s.MODEL, "prompt": prompt, "size": "1024x1536", "quality": "medium", "n": 1, "output_format": "jpeg"}
    if fidelity: data["input_fidelity"] = fidelity
    r = requests.post("https://api.openai.com/v1/images/edits", headers={"Authorization": f"Bearer {s.KEY}"},
                      files=[("image[]", i) for i in images], data=data, timeout=240)
    r.raise_for_status()
    return base64.b64decode(r.json()["data"][0]["b64_json"])

base = ("base_M.png", (s.TRYON / "base_M.png").read_bytes(), "image/png")
face = ("face.jpg", FACE, "image/jpeg")
(t2, d2), (b2, db2) = s.product_img("T2"), s.product_img("B2")
desc = f"image 2 is {d2}; image 3 is {db2}"
v = sys.argv[1]; t0 = time.time()

if v == "A":
    img = base64.b64decode(s.generate_tryon('x,' + base64.b64encode(FACE).decode(), "M", "165", None, ["T2", "B2"]).split(",", 1)[1])
elif v == "B":
    avatar = edit([base, face], "Image 1 is a full-body studio photo of a woman in a plain grey base layer. Image 2 is a close-up photo "
                  "of a customer. Create the same full-body studio photo, but of the customer. " + IDENTITY + " Keep image 1's body shape "
                  "and size, pose, grey base layer, white sneakers, background and full-body framing.")
    (OUT / "ab_B_avatar.jpg").write_bytes(avatar)
    img = edit([("avatar.jpg", avatar, "image/jpeg"), t2, b2],
               f"Dress the woman from image 1 in the garments shown in the other images: {desc}. Do not change her head, face, hair, "
               "skin tone, body shape and size, pose, white sneakers, background or lighting in any way. Reproduce each garment "
               "faithfully (colour, fabric, neckline, straps, length) with a realistic fit, and remove the grey base layer where covered. "
               "Photorealistic full-body studio photo.")
elif v == "C":
    img = edit([base, t2, b2, face],
               f"Image 1 is a woman standing in a plain grey base layer. The next images are product photos: {desc}. The last image is "
               "a photo of the customer. Create a full-body studio photo of the customer wearing these garments. " + IDENTITY +
               " Keep image 1's body shape and size, pose, white sneakers, background and framing. Reproduce each garment faithfully.")
(OUT / f"ab_{v}.jpg").write_bytes(img)
print(v, "secs", round(time.time() - t0))
