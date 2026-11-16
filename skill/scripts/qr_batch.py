# -*- coding: utf-8 -*-
"""批量出二维码 + 可转发总览图：每个条目可「按 URL 生成」或「由已有码美化」，
全部逐码解码校验后输出。

qr.json 结构（见 examples/qr.example.json）：
{
  "style": {"fg": "#1B3A6B", "bg": "#FFFFFF", "size": 1600,
            "logo": "logo.png", "logo_ratio": 0.18},
  "items": [
    {"name": "a", "label": "分类A题库", "sub": "可下载",
     "group": "资源页", "url": "https://..."},
    {"name": "b", "label": "分类A题库", "sub": "可看可问",
     "group": "知识库", "source": "官方码.png", "expect": "https://..."}
  ],
  "sheet": {"title": "扫码直达", "cols": 4, "output": "二维码总览.png"}
}

用法：
  python qr_batch.py --list qr.json --outdir qr/
"""
import argparse
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

_FCACHE = {}
FONT_CANDS = {
    "b": ["msyhbd.ttc", "simhei.ttf", "NotoSansSC-Bold.otf"],
    "r": ["msyh.ttc", "simsun.ttc", "NotoSansSC-Regular.otf"],
}
FONT_DIRS = [r"C:\Windows\Fonts", "/usr/share/fonts", "/System/Library/Fonts"]


def font(kind, size):
    key = (kind, size)
    if key in _FCACHE:
        return _FCACHE[key]
    for name in FONT_CANDS[kind]:
        for d in FONT_DIRS:
            p = os.path.join(d, name)
            if os.path.exists(p):
                f = ImageFont.truetype(p, size)
                _FCACHE[key] = f
                return f
    f = ImageFont.load_default()
    _FCACHE[key] = f
    return f


def hex2rgb(s):
    s = s.strip().lstrip("#")
    if len(s) == 3:
        s = "".join(c * 2 for c in s)
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


def build_one(item, style, outdir):
    """返回 (路径, 期望解码内容 或 None)"""
    dst = os.path.join(outdir, item["name"] + ".png")
    if item.get("source"):
        import recolor_qr
        im = Image.open(item["source"]).convert("RGB")
        out, info = recolor_qr.recolor(
            im, hex2rgb(item.get("fg", style["fg"])),
            hex2rgb(item.get("bg", style["bg"])),
            item.get("quiet_ratio", 0.12), item.get("size", style.get("size", 1600)),
            style.get("logo") or None, style.get("logo_ratio", 0.18))
        out.save(dst, "PNG", optimize=True)
    else:
        import make_qr
        mat = make_qr.build_matrix(item["url"], item.get("ec", "H"))
        im = make_qr.draw_qr(
            mat, item.get("size", style.get("size", 1600)),
            hex2rgb(item.get("fg", style["fg"])),
            hex2rgb(item.get("bg", style["bg"])),
            item.get("quiet", 4), item.get("round_dots", True),
            style.get("logo") or None, style.get("logo_ratio", 0.18))
        im.save(dst, "PNG", optimize=True)
    return dst, item.get("expect") or item.get("url")


def verify_all(results):
    try:
        import zxingcpp
    except ImportError:
        print("warn: zxingcpp 未安装，跳过校验（pip install zxing-cpp）")
        return True
    ok = True
    for path, expect in results:
        res = zxingcpp.read_barcodes(Image.open(path).convert("RGB"))
        txt = res[0].text if res else ""
        if not txt:
            print("FAIL", os.path.basename(path), "解码失败")
            ok = False
        elif expect and txt != expect:
            print("FAIL", os.path.basename(path), "内容不一致:", txt[:90])
            ok = False
        else:
            print("PASS", os.path.basename(path), txt[:70])
    return ok


def sheet(items, results_map, style, cfg, outdir):
    """可转发总览图：网格卡片 + 组色条 + 标签"""
    cols = cfg.get("cols", 4)
    title = cfg.get("title", "扫码直达")
    CW, CH, GAP, PAD = 620, 780, 40, 60
    n = len(items)
    rows = (n + cols - 1) // cols
    W = PAD * 2 + CW * min(cols, n) + GAP * (min(cols, n) - 1)
    H = PAD * 2 + CH * rows + GAP * (rows - 1) + (110 if title else 0)
    bg = hex2rgb(cfg.get("bg", "#FBFAF6"))
    canvas = Image.new("RGB", (W, H), bg)
    d = ImageDraw.Draw(canvas)
    if title:
        f = font("b", 52)
        d.text((W / 2, PAD + 40), title, font=f, fill=hex2rgb("#1A1A1A"),
               anchor="mm")
    groups = {}
    gi = 0
    for it in items:
        groups.setdefault(it.get("group", ""), None)
    gcolors = ["#1B3A6B", "#8A6520", "#1F5B62", "#B8281E", "#3D6B35"]
    gmap = {g: gcolors[i % len(gcolors)] for i, g in enumerate(groups)}
    qsize = 520
    for i, it in enumerate(items):
        col, row = i % cols, i // cols
        x = PAD + col * (CW + GAP)
        y = PAD + (110 if title else 0) + row * (CH + GAP)
        tone = hex2rgb(gmap[it.get("group", "")])
        d.rounded_rectangle([x, y, x + CW, y + CH], radius=18,
                            fill=hex2rgb("#FFFFFF"), outline=hex2rgb("#C9D2DE"),
                            width=2)
        d.rectangle([x, y, x + 8, y + 74], fill=tone)
        if it.get("group"):
            d.text((x + 30, y + 22), it["group"], font=font("b", 30), fill=tone)
        q = Image.open(results_map[it["name"]]).convert("RGB")
        q = q.resize((qsize, qsize), Image.LANCZOS)
        canvas.paste(q, (x + (CW - qsize) // 2, y + 92))
        d.text((x + CW / 2, y + 92 + qsize + 46), it.get("label", it["name"]),
               font=font("b", 32), fill=hex2rgb("#1A1A1A"), anchor="mm")
        if it.get("sub"):
            d.text((x + CW / 2, y + 92 + qsize + 96), it["sub"],
                   font=font("r", 24), fill=hex2rgb("#6B7686"), anchor="mm")
    dst = os.path.join(outdir, cfg.get("output", "二维码总览.png"))
    canvas.save(dst, "PNG", optimize=True)
    print("sheet:", dst, canvas.size)
    return dst


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", required=True, help="qr.json 路径")
    ap.add_argument("--outdir", required=True)
    ap.add_argument("--no-sheet", action="store_true", help="不输出总览图")
    ap.add_argument("--no-verify", action="store_true")
    a = ap.parse_args()

    cfg = json.load(open(a.list, encoding="utf-8"))
    style = cfg.get("style", {})
    os.makedirs(a.outdir, exist_ok=True)
    if style.get("logo") and not os.path.isabs(style["logo"]):
        style["logo"] = os.path.join(os.path.dirname(os.path.abspath(a.list)),
                                     style["logo"])

    results = []
    results_map = {}
    for it in cfg["items"]:
        path, expect = build_one(it, style, a.outdir)
        results.append((path, expect))
        results_map[it["name"]] = path
        print("built:", it["name"])

    ok = True
    if not a.no_verify:
        ok = verify_all(results)
    if not a.no_sheet and cfg.get("sheet"):
        sheet(cfg["items"], results_map, style, cfg["sheet"], a.outdir)
    if not ok:
        sys.exit(1)
    print("ALL PASS" if ok else "FAILED")


if __name__ == "__main__":
    main()
