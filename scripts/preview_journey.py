"""Render the journey offline, using the same framing maths as the shader.

The browser pane in this environment keeps collapsing, which pauses rAF and
freezes the scene. Reproducing lib/journey.ts + lib/view.ts here checks the same
numbers and shows what the hand-overs actually look like.
"""
import json, os, re
import numpy as np
from PIL import Image

WEB = "/Users/gengyi/portfolio/web"
OUT = f"{WEB}/scripts/journey"
os.makedirs(OUT, exist_ok=True)

src = open(f"{WEB}/lib/scenes.generated.ts").read()
SCENES = [
    {"name": m[0], "w": int(m[1]), "h": int(m[2]), "weight": float(m[3])}
    for m in re.findall(
        r'name: "(\w+)".*?w: (\d+), h: (\d+), weight: ([\d.]+)', src
    )
]
V = dict(zoomEnter=1.0, zoomHoldStart=1.06, zoomHoldEnd=1.20, zoomExit=1.36,
         handover=0.26, pan=(0.012, -0.024))

total = sum(s["weight"] for s in SCENES)
spans = [s["weight"] / total for s in SCENES]
starts, acc = [], 0.0
for sp in spans:
    starts.append(acc); acc += sp

VW, VH = 1280, 720


def smoothstep(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


def framing(iw, ih, zoom, pan):
    ia, sa = iw / ih, VW / VH
    s = (1.0, ia / sa) if sa > ia else (sa / ia, 1.0)
    return (s[0] / zoom, s[1] / zoom), pan


def journey(t):
    t = min(0.9999, max(0.0, t))
    i = len(SCENES) - 1
    while i > 0 and t < starts[i]:
        i -= 1
    u = (t - starts[i]) / spans[i]
    has_next = i + 1 < len(SCENES)
    handover = u > 1 - V["handover"] and has_next
    mix = smoothstep(1 - V["handover"], 1, u) if handover else 0.0
    hold = min(1.0, u / (1 - V["handover"]))
    zoom_a = lerp(V["zoomHoldEnd"], V["zoomExit"], mix) if handover \
        else lerp(V["zoomHoldStart"], V["zoomHoldEnd"], hold)
    zoom_b = lerp(V["zoomEnter"], V["zoomHoldStart"], mix)
    j = i + 1 if handover else i
    pan_a = (V["pan"][0] * hold, V["pan"][1] * hold)
    return i, j, mix, zoom_a, zoom_b, \
        framing(SCENES[i]["w"], SCENES[i]["h"], zoom_a, pan_a), \
        framing(SCENES[j]["w"], SCENES[j]["h"], zoom_b, (0.0, 0.0))


cache = {}
def img(i):
    if i not in cache:
        cache[i] = np.asarray(
            Image.open(f"{WEB}/public/scenes/{SCENES[i]['name']}-bg.webp").convert("RGB")
        ).astype(np.float32) / 255.0
    return cache[i]


def sample(i, fr):
    """Exactly what the fragment shader does: uv = (vUv-0.5)*scale + 0.5 + off."""
    (sx, sy), (ox, oy) = fr
    a = img(i)
    ih, iw, _ = a.shape
    vx = np.linspace(0, 1, VW)[None, :]
    vy = np.linspace(0, 1, VH)[:, None]
    u = np.clip((vx - 0.5) * sx + 0.5 + ox, 0, 1)
    v = np.clip((vy - 0.5) * sy + 0.5 + oy, 0, 1)
    px = np.clip((u * (iw - 1)).astype(np.int32), 0, iw - 1)
    py = np.clip((v * (ih - 1)).astype(np.int32), 0, ih - 1)
    return a[np.broadcast_to(py, (VH, VW)), np.broadcast_to(px, (VH, VW))]


print(f"{'t':>6} {'scene':>18} {'mix':>6} {'zoomA':>6} {'zoomB':>6}   min scale (must be <= 1.0)")
print("-" * 84)
shots = [0.0, 0.14, 0.24, 0.27, 0.40, 0.49, 0.62, 0.73, 0.85, 0.97]
for t in shots:
    i, j, mix, za, zb, fa, fb = journey(t)
    frame = sample(i, fa) * (1 - mix) + sample(j, fb) * mix
    Image.fromarray((np.clip(frame, 0, 1) * 255).astype(np.uint8)).save(
        f"{OUT}/{t:.2f}.png"
    )
    pair = SCENES[i]["name"] if mix == 0 else f"{SCENES[i]['name']}>{SCENES[j]['name']}"
    worst = max(max(fa[0]), max(fb[0]))
    flag = "  <-- EDGE EXPOSED" if worst > 1.0001 else ""
    print(f"{t:6.2f} {pair:>18} {mix:6.2f} {za:6.2f} {zb:6.2f}   {worst:.4f}{flag}")
