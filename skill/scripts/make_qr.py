# -*- coding: utf-8 -*-
"""生成美化二维码：圆点模块 + 圆角定位角 + 中心社标 + 白静区，纠错等级 H

用法：
  python make_qr.py --data "https://example.com" --output qr/a.png \
      [--size 2000] [--fg "#1B3A6B"] [--bg "#FFFFFF"] [--logo logo.png] \
      [--logo-ratio 0.20] [--quiet 4] [--round-dots 1] [--verify]
"""
import argparse
import os
import sys

from PIL import Image, ImageDraw

try:
    import qrcode
except ImportError:
    sys.exit("qrcode not installed: pip install qrcode")


def build_matrix(data, ec="H"):
    levels = {"L": qrcode.constants.ERROR_CORRECT_L,
              "M": qrcode.constants.ERROR_CORRECT_M,
              "Q": qrcode.constants.ERROR_CORRECT_Q,
              "H": qrcode.constants.ERROR_CORRECT_H}
    q = qrcode.QRCode(error_correction=levels[ec], box_size=1, border=0)
    q.add_data(data)
    q.make(fit=True)
    return q.get_matrix()


def draw_qr(mat, size, fg, bg, quiet=4, round_dots=True, logo=None, logo_ratio=0.20):
    n = len(mat)
    total = n + quiet * 2
    m = size / total                    # 单模块边长（px）
    im = Image.new("RGB", (size, size), bg)
    d = ImageDraw.Draw(im)

    def cell(i, j):
        return ((i + quiet) * m, (j + quiet) * m)

    # 先画定位角区域占位（跳过），再画数据模块
    def in_finder(i, j):
        return (i < 7 and j < 7) or (i >= n - 7 and j < 7) or (i < 7 and j >= n - 7)

    r = m * 0.46 if round_dots else 0
    for j in range(n):
        for i in range(n):
            if not mat[j][i] or in_finder(i, j):
                continue
            x, y = cell(i, j)
            if round_dots:
                d.ellipse([x + m * 0.04, y + m * 0.04,
                           x + m * 0.96, y + m * 0.96], fill=fg)
            else:
                d.rectangle([x, y, x + m - 0.5, y + m - 0.5], fill=fg)

    # 三个定位角：外环圆角方框 + 内实心圆角方块
    def finder(ox, oy):
        x0, y0 = cell(ox, oy)
        s = 7 * m
        w = m * 1.0
        rr = m * 1.6
        d.rounded_rectangle([x0, y0, x0 + s, y0 + s], radius=rr, outline=fg, width=int(w))
        inner = m * (2.0)
        d.rounded_rectangle([x0 + inner, y0 + inner, x0 + s - inner, y0 + s - inner],
                            radius=rr * 0.6, fill=fg)

    finder(0, 0)
    finder(n - 7, 0)
    finder(0, n - 7)

    if logo and logo_ratio > 0:
        lg = Image.open(logo).convert("RGBA")
        side = int(size * logo_ratio)
        lg.thumbnail((side, side), Image.LANCZOS)
        pad = int(side * 0.10)
        bx = (size - lg.width) // 2
        by = (size - lg.height) // 2
        d.rounded_rectangle([bx - pad, by - pad, bx + lg.width + pad,
                             by + lg.height + pad],
                            radius=int(side * 0.16), fill=bg)
        im.paste(lg, (bx, by), lg)
    return im


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, help="二维码内容（URL 或文本）")
    ap.add_argument("--output", required=True)
    ap.add_argument("--size", type=int, default=2000)
    ap.add_argument("--fg", default="#1B3A6B")
    ap.add_argument("--bg", default="#FFFFFF")
    ap.add_argument("--quiet", type=int, default=4, help="静区模块数，≥4")
    ap.add_argument("--round-dots", type=int, default=1)
    ap.add_argument("--logo", default="")
    ap.add_argument("--logo-ratio", type=float, default=0.20)
    ap.add_argument("--ec", default="H", choices=list("LMQH"))
    ap.add_argument("--verify", action="store_true")
    a = ap.parse_args()

    mat = build_matrix(a.data, a.ec)
    im = draw_qr(mat, a.size, a.fg, a.bg, max(4, a.quiet), bool(a.round_dots),
                 a.logo or None, a.logo_ratio)
    os.makedirs(os.path.dirname(os.path.abspath(a.output)), exist_ok=True)
    im.save(a.output, "PNG", optimize=True)
    print("saved:", a.output, f"modules={len(mat)} size={a.size} ec={a.ec}")

    if a.verify:
        try:
            import zxingcpp
        except ImportError:
            sys.exit("zxingcpp not installed: pip install zxing-cpp")
        res = zxingcpp.read_barcodes(im)
        txt = res[0].text if res else ""
        ok = (txt == a.data)
        print(("PASS " if ok else "FAIL "), txt[:100])
        if not ok:
            sys.exit(1)


if __name__ == "__main__":
    main()
