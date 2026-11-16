# -*- coding: utf-8 -*-
"""配置驱动的海报合成：放大锐化 → 区域覆盖重绘 → 贴素材 → 出 PNG/预览/印刷 PDF → 可选解码校验

用法：
  python compose.py --job job.json
  python compose.py --job job.json --verify      # 有二维码时逐码解码

job.json 结构见 examples/job.example.json。所有坐标/尺寸都用「源图像素」，
内部按 canvas.scale 统一放大，避免每处手换算。
"""
import argparse
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONT_DIRS = [os.environ.get("WINDIR", r"C:\Windows") + r"\Fonts",
             "/System/Library/Fonts", "/usr/share/fonts/truetype"]
_font_cache = {}


def get_font(name, size):
    key = (name, int(size))
    if key in _font_cache:
        return _font_cache[key]
    for d in FONT_DIRS:
        p = os.path.join(d, name)
        if os.path.exists(p):
            f = ImageFont.truetype(p, max(1, int(size)))
            _font_cache[key] = f
            return f
    # 回退：PIL 默认字体（不可缩放，仅保证能跑）
    print(f"! font not found: {name}, fallback to default", file=sys.stderr)
    f = ImageFont.load_default()
    _font_cache[key] = f
    return f


def hex_rgb(c):
    c = c.lstrip("#")
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


class Canvas:
    def __init__(self, src, scale=4, sharpen=True, box=None):
        self.src = Image.open(src).convert("RGB")
        if box:
            self.src = self.src.crop(tuple(box))
        self.im = self.src.resize((self.src.width * scale, self.src.height * scale),
                                 Image.LANCZOS)
        if sharpen:
            self.im = self.im.filter(
                ImageFilter.UnsharpMask(radius=max(1, scale // 2), percent=110, threshold=2))
        self.d = ImageDraw.Draw(self.im)
        self.scale = scale

    def rect(self, box, fill=None, radius=0, outline=None, width=1):
        x, y, w, h = box
        b = [x * self.scale, y * self.scale, (x + w) * self.scale, (y + h) * self.scale]
        if radius and fill:
            self.d.rounded_rectangle(b, radius=int(radius * self.scale), fill=fill,
                                     outline=outline,
                                     width=max(1, int(width * self.scale)))
        else:
            self.d.rectangle(b, fill=fill, outline=outline,
                             width=max(1, int(width * self.scale)))

    def text(self, x, y, s, size, color="#111111", font="msyh.ttc", anchor="lt"):
        self.d.text((x * self.scale, y * self.scale), s,
                    font=get_font(font, size * self.scale), fill=color, anchor=anchor)


def paste_fit(canvas, img_path, box, fit="contain", radius=0):
    """把素材贴进 box（源坐标）。contain 等比内贴，cover 等比裁切填充。"""
    x, y, w, h = box
    tw, th = int(w * canvas.scale), int(h * canvas.scale)
    im = Image.open(img_path).convert("RGB")
    sw, sh = im.size
    if fit == "cover":
        r = max(tw / sw, th / sh)
    else:
        r = min(tw / sw, th / sh)
    nw, nh = max(1, int(sw * r)), max(1, int(sh * r))
    im = im.resize((nw, nh), Image.LANCZOS)
    if radius:
        mask = Image.new("L", (nw, nh), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, nw - 1, nh - 1],
                                               radius=int(radius * canvas.scale), fill=255)
    else:
        mask = None
    px = int(x * canvas.scale + (tw - nw) / 2)
    py = int(y * canvas.scale + (th - nh) / 2)
    canvas.im.paste(im, (px, py), mask)
    return [px, py, nw, nh]


def auto_slots(canvas, cfg, job_dir):
    """按配置识别占位块并贴入 img_dir 里的素材，返回 [{file, box_px, expect}]"""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from detect_slots import annotate, detect

    color = cfg.get("color", "gray")
    slots, _ = detect(canvas.src_path, color=color,
                      tol=cfg.get("tol", 14),
                      min_size=cfg.get("min_size", 40),
                      max_size=cfg.get("max_size", 220),
                      square_tol=cfg.get("square_tol", 0.35),
                      fill_ratio=cfg.get("fill_ratio", 0.68),
                      y_min_ratio=cfg.get("y_min_ratio", 0.0))
    slots, min_gap, med = annotate(slots, canvas.src.size)
    if not slots:
        raise SystemExit("no slots detected; check --color / size range")
    print(f"slots: {len(slots)} (min_gap {min_gap:.0f}px, median {med:.0f}px)")

    files = cfg.get("files") or []
    if not files:
        img_dir = os.path.join(job_dir, cfg.get("img_dir", "assets"))
        files = sorted(f for f in os.listdir(img_dir)
                       if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp")))
        files = [os.path.join(img_dir, f) for f in files]
    if cfg.get("keep_order", True) is False:
        files = list(files)
    if len(files) < len(slots):
        print(f"! {len(slots)} slots but only {len(files)} assets", file=sys.stderr)

    scale = cfg.get("scale", 1.28)
    gap_factor = cfg.get("gap_factor", 0.86)
    expect = cfg.get("expect") or {}
    exp_by_file = {os.path.basename(k): v for k, v in expect.items()}

    centers = [(s["cx"], s["cy"]) for s in slots]
    placed = []
    for i, s in enumerate(slots):
        if i >= len(files):
            break
        f = files[i]
        x, y, w, h = s["box"]
        cx, cy = s["cx"], s["cy"]
        dmin = min(((cx - ox) ** 2 + (cy - oy) ** 2) ** 0.5
                   for j, (ox, oy) in enumerate(centers) if j != i) if len(slots) > 1 else max(w, h)
        size = min(max(w, h) * scale, dmin * gap_factor)
        box = [cx - size / 2, cy - size / 2, size, size]
        px = paste_fit(canvas, f, box, fit="contain", radius=cfg.get("radius", 0))
        placed.append({"file": f, "box_px": px,
                       "expect": exp_by_file.get(os.path.basename(f))})
        if cfg.get("labels"):
            lab = cfg["labels"][i] if i < len(cfg["labels"]) else ""
            if lab:
                canvas.text(cx, cy + size / 2 + cfg.get("label_gap", 14), lab,
                            cfg.get("label_size", 16), cfg.get("label_color", "#333333"),
                            cfg.get("label_font", "msyhbd.ttc"), anchor="mt")
    return placed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--job", required=True)
    ap.add_argument("--verify", action="store_true")
    a = ap.parse_args()

    job_path = os.path.abspath(a.job)
    job_dir = os.path.dirname(job_path)
    with open(job_path, encoding="utf-8") as f:
        job = json.load(f)

    cv = job.get("canvas", {})
    src = cv.get("source", "base.png")
    if not os.path.isabs(src):
        src = os.path.join(job_dir, src)
    canvas = Canvas(src, scale=cv.get("scale", 4),
                    sharpen=cv.get("sharpen", True), box=cv.get("crop"))
    canvas.src_path = src
    print("canvas:", canvas.im.size, "scale", canvas.scale)

    # 1) 区域覆盖重绘
    for p in job.get("patches", []):
        fill = hex_rgb(p["fill"]) if p.get("fill") else None
        canvas.rect(p["box"], fill=fill, radius=p.get("radius", 0),
                    outline=hex_rgb(p["outline"]) if p.get("outline") else None,
                    width=p.get("width", 1))
        for t in p.get("texts", []):
            canvas.text(t["x"], t["y"], t["text"], t.get("size", 30),
                        t.get("color", "#111111"), t.get("font", "msyh.ttc"),
                        t.get("anchor", "lt"))

    # 2) 占位块自动贴素材（二维码/图标/图片）
    placed = []
    if "slots" in job:
        placed += auto_slots(canvas, job["slots"], job_dir)

    # 3) 显式坐标贴图
    for p in job.get("pastes", []):
        path = p["image"] if os.path.isabs(p["image"]) else os.path.join(job_dir, p["image"])
        box = p["box"]
        px = paste_fit(canvas, path, [box[0], box[1], box[2], box[3]],
                       fit=p.get("fit", "contain"), radius=p.get("radius", 0))
        placed.append({"file": path, "box_px": px, "expect": p.get("expect")})

    # 4) 输出
    out = job.get("output", {})
    name = out.get("name", "poster")
    out_dir = out.get("dir", job_dir)
    os.makedirs(out_dir, exist_ok=True)
    png = os.path.join(out_dir, f"{name}_原尺寸.png")
    canvas.im.save(png, "PNG", optimize=True)
    print("png:", png, canvas.im.size)

    pw = out.get("preview_width", 1600)
    if pw:
        pv = canvas.im.resize((pw, int(canvas.im.height * pw / canvas.im.width)),
                              Image.LANCZOS)
        pvp = os.path.join(out_dir, f"{name}_预览.png")
        pv.save(pvp, "PNG", optimize=True)
        print("preview:", pvp)

    mm = cv.get("page_mm")
    if mm:
        from reportlab.lib.units import mm as MM
        from reportlab.pdfgen import canvas as rcanvas
        w_mm, h_mm = mm
        pdf = os.path.join(out_dir, f"{name}_印刷版.pdf")
        c = rcanvas.Canvas(pdf, pagesize=(w_mm * MM, h_mm * MM))
        c.drawImage(png, 0, 0, w_mm * MM, h_mm * MM)
        c.showPage()
        c.save()
        print(f"pdf: {pdf}  {w_mm}x{h_mm} mm")

    # 5) 解码校验（可选）
    if a.verify or job.get("verify"):
        try:
            import zxingcpp
        except ImportError:
            sys.exit("zxingcpp not installed: pip install zxing-cpp")
        ok = True
        for it in placed:
            px, py, pw_, ph_ = it["box_px"]
            crop = canvas.im.crop((max(0, px - 20), max(0, py - 20),
                                   px + pw_ + 20, py + ph_ + 20))
            res = zxingcpp.read_barcodes(crop)
            txt = res[0].text if res else ""
            exp = it["expect"]
            good = bool(txt) and (exp is None or txt == exp)
            ok = ok and good
            print(("PASS " if good else "FAIL "), os.path.basename(it["file"]),
                  "" if good else (txt[:70] or "(decode failed)"))
        print("=== verify:", "ALL PASS" if ok else "FAILED")
        if not ok:
            sys.exit(1)


if __name__ == "__main__":
    main()
