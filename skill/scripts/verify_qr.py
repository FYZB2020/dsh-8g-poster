# -*- coding: utf-8 -*-
"""二维码解码校验：证明「扫得出来、链接没串」

用法：
  # 单张图
  python verify_qr.py --image qr.png [--expect "https://..."]

  # 整张成品图按坐标校验（可多次 --item x,y,w,h,expect）
  python verify_qr.py --image poster.png --item 120,800,300,300,https://a \
                      --item 500,800,300,300,https://b

  # 目录批量（文件名即标签，只校验能否解码）
  python verify_qr.py --dir qr_v3 --expect-json expect.json

expect.json 形如 {"a.png": "https://...", "b.png": "https://..."}
退出码非 0 表示有失败，可直接用于 CI / 交付前卡口。
"""
import argparse
import json
import os
import sys

try:
    import zxingcpp
except ImportError:
    sys.exit("zxingcpp not installed: pip install zxing-cpp")


def decode(im):
    res = zxingcpp.read_barcodes(im)
    return res[0].text if res else ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--image")
    ap.add_argument("--expect", default=None)
    ap.add_argument("--item", action="append", default=[],
                    help="x,y,w,h[,expect] 源图像素坐标")
    ap.add_argument("--dir")
    ap.add_argument("--expect-json")
    ap.add_argument("--pad", type=int, default=20)
    ap.add_argument("--strict", action="store_true", help="有 expect 时必须逐字相等")
    a = ap.parse_args()

    fails = 0
    if a.dir:
        exp = {}
        if a.expect_json:
            with open(a.expect_json, encoding="utf-8") as f:
                exp = json.load(f)
        from PIL import Image
        for fn in sorted(os.listdir(a.dir)):
            if not fn.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
                continue
            p = os.path.join(a.dir, fn)
            txt = decode(Image.open(p).convert("RGB"))
            want = exp.get(fn)
            ok = bool(txt) and (want is None or txt == want)
            fails += 0 if ok else 1
            print(("PASS " if ok else "FAIL "), fn, "" if ok else (txt[:70] or "(no code)"))
        print("=== verify:", "ALL PASS" if fails == 0 else f"{fails} FAILED")
        sys.exit(0 if fails == 0 else 1)

    if not a.image:
        sys.exit("need --image or --dir")
    from PIL import Image
    im = Image.open(a.image).convert("RGB")

    if a.item:
        for it in a.item:
            parts = [s.strip() for s in it.split(",")]
            x, y, w, h = (int(float(v)) for v in parts[:4])
            want = parts[4] if len(parts) > 4 and parts[4] else None
            crop = im.crop((max(0, x - a.pad), max(0, y - a.pad),
                            x + w + a.pad, y + h + a.pad))
            txt = decode(crop)
            ok = bool(txt) and (want is None or txt == want)
            fails += 0 if ok else 1
            print(("PASS " if ok else "FAIL "), f"[{x},{y},{w},{h}]",
                  "" if ok else (txt[:70] or "(no code)"))
        print("=== verify:", "ALL PASS" if fails == 0 else f"{fails} FAILED")
        sys.exit(0 if fails == 0 else 1)

    txt = decode(im)
    ok = bool(txt) and (a.expect is None or txt == a.expect
                        or (not a.strict and a.expect in txt))
    print(("PASS " if ok else "FAIL "), txt[:120] or "(no code)")
    if not ok and a.expect:
        print("expect:", a.expect[:120])
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
