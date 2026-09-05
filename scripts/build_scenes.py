"""Prepare every scene of the journey: valley -> climb -> summit -> ocean.

Per scene it writes a background, and a mask whose channels are

  R  the coral trail
  G  how far along that trail each pixel is, 0 at the near end -> 1 at the far
  B  water

The G channel is the interesting one. A highlight animated on screen position
just slides across the picture; animated on distance measured *inside* the
coral, it runs along the ribbon and follows every bend of it into the distance.
Because the trail is the one motif shared by all four illustrations, the same
effect stitches the whole journey together.
"""
import heapq, json, os
import numpy as np
from PIL import Image, ImageFilter

ROOT = "/Users/gengyi/portfolio"
OUT = f"{ROOT}/web/public/scenes"
os.makedirs(OUT, exist_ok=True)
MAN = json.load(open(f"{ROOT}/web/scripts/scenes.json"))


def trim_borders(im):
    """Drop letterboxing. Climb.png ships with black bars top and bottom."""
    a = np.asarray(im.convert("RGB")).astype(np.float32) / 255.0
    lum = a.mean(axis=2)
    dark_rows = lum.max(axis=1) < 0.10
    dark_cols = lum.max(axis=0) < 0.10

    def span(flags):
        lo = 0
        while lo < len(flags) and flags[lo]:
            lo += 1
        hi = len(flags)
        while hi > lo and flags[hi - 1]:
            hi -= 1
        return lo, hi

    y0, y1 = span(dark_rows)
    x0, x1 = span(dark_cols)
    if (y0, y1, x0, x1) == (0, im.height, 0, im.width):
        return im, None
    return im.crop((x0, y0, x1, y1)), (x0, y0, x1, y1)


def masks_for(a, want_water):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    lum = r * 0.299 + g * 0.587 + b * 0.114
    H, W = lum.shape

    coral = ((r - g) > 0.16) & ((r - b) > 0.13) & (r > 0.55)

    water = np.zeros_like(coral)
    if want_water:
        blur = np.asarray(
            Image.fromarray((lum * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3))
        ).astype(np.float32) / 255.0
        # Colour alone also matches shaded hillsides; water is flat, slopes are not.
        water = (b > r + 0.02) & (lum > 0.34) & (lum < 0.72) & (np.abs(lum - blur) < 0.022)
        water = np.asarray(
            Image.fromarray((water * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6))
        ) > 140

    # Distance along the ribbon: Dijkstra where staying inside the coral costs 1
    # and stepping outside costs 7. Plain BFS inside the mask stalls, because the
    # trail is usually broken into several pieces by a ridge or a lake.
    K = 4
    sm = coral[::K, ::K]
    sh, sw = sm.shape
    dist = np.full((sh, sw), np.inf, dtype=np.float32)
    heap = []
    ys, xs = np.nonzero(sm)
    if len(ys):
        seed_y = ys.max()                                   # the near end, at the bottom
        for x in xs[ys == seed_y]:
            dist[seed_y, x] = 0.0
            heap.append((0.0, seed_y, x))
    heapq.heapify(heap)
    while heap:
        d, y, x = heapq.heappop(heap)
        if d > dist[y, x]:
            continue
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < sh and 0 <= nx < sw:
                nd = d + (1.0 if sm[ny, nx] else 7.0)
                if nd < dist[ny, nx]:
                    dist[ny, nx] = nd
                    heapq.heappush(heap, (nd, ny, nx))

    on = sm & np.isfinite(dist)
    far = float(dist[on].max()) if on.any() else 1.0
    flow_small = np.where(sm, np.minimum(dist, far) / max(1e-6, far), 0).astype(np.float32)
    flow = np.asarray(
        Image.fromarray((np.clip(flow_small, 0, 1) * 255).astype(np.uint8)).resize(
            (W, H), Image.BILINEAR
        )
    ).astype(np.float32) / 255.0

    return coral, flow, water


def lift_deer(a, box):
    """Cut the deer out and paint the ground back in behind it.

    It is a slightly darker silhouette on the coral band rather than a dark
    shape on a light one, so it is keyed on how much darker it is than the
    ground it stands on, not on brightness.
    """
    x0, y0, x1, y1 = box
    bw, bh = x1 - x0, y1 - y0
    sub = a[y0:y1, x0:x1]

    top, bot, left, right = sub[0], sub[-1], sub[:, 0], sub[:, -1]
    ty = np.linspace(0, 1, bh)[:, None, None]
    tx = np.linspace(0, 1, bw)[None, :, None]
    ground = (top[None] * (1 - ty) + bot[None] * ty) * 0.5 + \
             (left[:, None] * (1 - tx) + right[:, None] * tx) * 0.5

    lum = lambda v: v[..., 0] * 0.299 + v[..., 1] * 0.587 + v[..., 2] * 0.114
    alpha = np.clip((lum(ground) - lum(sub)) / 0.085, 0, 1)
    alpha = np.asarray(
        Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
    ).astype(np.float32) / 255.0

    sprite = Image.fromarray(np.dstack([sub * 255, alpha * 255]).astype(np.uint8), "RGBA")
    grain = np.random.default_rng(7).normal(0, 0.006, ground.shape[:2])[..., None]
    patched = a.copy()
    patched[y0:y1, x0:x1] = np.clip(ground + grain, 0, 1)
    return sprite, patched, float((alpha > 0.5).mean())


out = []
for spec in MAN["scenes"]:
    src = f"{ROOT}/{spec['file']}"
    if not os.path.exists(src):
        print(f"!! missing {spec['file']} — skipped")
        continue

    im, trimmed = trim_borders(Image.open(src).convert("RGB"))
    W, H = im.size
    a = np.asarray(im).astype(np.float32) / 255.0

    entry = {"name": spec["name"], "w": W, "h": H, "weight": spec.get("weight", 1.0)}

    if spec.get("deer"):
        sprite, a, cover = lift_deer(a, spec["deer"])
        sprite.save(f"{OUT}/{spec['name']}-deer.png")
        x0, y0, x1, y1 = spec["deer"]
        entry["deer"] = {"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0}

    coral, flow, water = masks_for(a, spec.get("water", False))
    Image.fromarray((np.dstack([coral, flow, water]).astype(np.float32) * 255).astype(np.uint8), "RGB") \
         .filter(ImageFilter.GaussianBlur(1.2)) \
         .resize((W // 2, H // 2), Image.LANCZOS) \
         .save(f"{OUT}/{spec['name']}-mask.webp", quality=92, method=6)
    Image.fromarray((a * 255).astype(np.uint8), "RGB") \
         .save(f"{OUT}/{spec['name']}-bg.webp", quality=90, method=6)

    kb = sum(os.path.getsize(f"{OUT}/{spec['name']}-{s}") for s in ("bg.webp", "mask.webp")) / 1024
    note = f"  trimmed {trimmed}" if trimmed else ""
    print(f"{spec['name']:8s} {W:5d}x{H:<5d}  coral {100*coral.mean():5.1f}%  "
          f"water {100*water.mean():5.1f}%  {kb:6.0f} KB{note}")
    out.append(entry)

ts = ["// GENERATED by scripts/build_scenes.py — do not edit by hand.",
      "// Run `npm run assets` after changing the artwork or scripts/scenes.json.",
      "",
      "export type SceneAsset = {",
      "  name: string;",
      "  bg: string;",
      "  mask: string;",
      "  w: number;",
      "  h: number;",
      "  /** Relative share of the page's scroll length. */",
      "  weight: number;",
      "  /** Present only where a figure was lifted out to be animated. */",
      "  deer?: { x: number; y: number; w: number; h: number };",
      "  deerSrc?: string;",
      "};",
      "",
      "export const SCENES: SceneAsset[] = ["]
for e in out:
    line = (f'  {{ name: "{e["name"]}", bg: "/scenes/{e["name"]}-bg.webp", '
            f'mask: "/scenes/{e["name"]}-mask.webp", w: {e["w"]}, h: {e["h"]}, '
            f'weight: {e["weight"]}')
    if "deer" in e:
        line += f', deer: {json.dumps(e["deer"])}, deerSrc: "/scenes/{e["name"]}-deer.png"'
    ts.append(line + " },")
ts.append("];")
open(f"{ROOT}/web/lib/scenes.generated.ts", "w").write("\n".join(ts) + "\n")
print(f"\nwrote lib/scenes.generated.ts ({len(out)} scenes)")
