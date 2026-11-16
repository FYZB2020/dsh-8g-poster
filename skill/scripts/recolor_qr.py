# -*- coding: utf-8 -*-
"""美化「已有的」二维码：不重新编码，只做颜色替换 + 静区补齐 + 可选中心压标。

适用场景：官方平台（如 ima 知识库）给的品牌色二维码，想统一成海报配色。
原图常带标题/订阅数/平台 logo 等杂讯，本脚本会自动定位「二维码主带」，
只重绘码区，杂讯丢弃。

原理：二维码的编码矩阵一个像素都不动，只把「墨色」按抗锯齿混合权重换成
目标色，因此扫出来的内容与原码逐字一致（由 --expect 解码校验兜底）。

用法：
  python recolor_qr.py --input official.png --output qr/a.png \
      --fg "#1B3A6B" --bg "#FFFFFF" [--size 1600] [--quiet-ratio 0.12] \
      [--logo logo.png --logo-ratio 0.18] [--expect "https://..."] [--thr 52]
"""
import argparse
import os
import sys
from collections import Counter

from PIL import Image, ImageDraw


def hex2rgb(s):
    s = s.strip().lstrip("#")
    if len(s) == 3:
        s = "".join(c * 2 for c in s)
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


def dist2(a, b):
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2


def border_bg(im):
    """取四边一圈的众数色当背景色（官方码底色不一定纯白）"""
    px = im.load()
    W, H = im.size
    c = Counter()
    for x in range(0, W, max(1, W // 240)):
        c[px[x, 0]] += 1
        c[px[x, H - 1]] += 1
    for y in range(0, H, max(1, H // 240)):
        c[px[0, y]] += 1
        c[px[W - 1, y]] += 1
    return c.most_common(1)[0][0]


def row_profile(im, bg, thr):
    px = im.load()
    W, H = im.size
    t2 = thr * thr
    rows = [0] * H
    for y in range(H):
        n = 0
        for x in range(W):
            if dist2(px[x, y], bg) > t2:
                n += 1
        rows[y] = n
    return rows


def largest_band(profile, ratio=0.35, gap=20):
    """密度剖面里「最大」的连续带：允许 ≤gap 的低密度断口（点阵码行间有波谷），
    标题/订阅数/logo 等窄带会被长度比较自动淘汰。返回 (start, end) 闭区间。"""
    peak = max(profile) or 1
    thr = peak * ratio
    best = (0, -1)
    start = last = None
    for i, v in enumerate(list(profile) + [0] * (gap + 1)):
        if v > thr:
            if start is None:
                start = i
            last = i
        elif start is not None and i - last > gap:
            if last - start > best[1] - best[0]:
                best = (start, last)
            start = None
    if best[1] < 0:
        sys.exit("no qr band found: 检查图片是否真的含二维码（或调 --thr）")
    return best


def qr_box(im, bg, thr=52):
    """行密度找纵向主带 → 带内列密度找横向边界 → 正方形约束（二维码必为正方形）"""
    px = im.load()
    W, H = im.size
    t2 = thr * thr
    y0, y1 = largest_band(row_profile(im, bg, thr), gap=max(12, H // 60))
    cols = [0] * W
    for y in range(y0, y1 + 1):
        for x in range(W):
            if dist2(px[x, y], bg) > t2:
                cols[x] += 1
    x0, x1 = largest_band(cols, gap=max(12, H // 60))
    x1 += 1
    y1 += 1
    # 正方形约束：以短边为准，向两边对称扩展
    w, h = x1 - x0, y1 - y0
    if w > h:
        cy = (y0 + y1) / 2
        y0 = int(max(0, cy - w / 2))
        y1 = int(min(H, y0 + w))
    elif h > w:
        cx = (x0 + x1) / 2
        x0 = int(max(0, cx - h / 2))
        x1 = int(min(W, x0 + h))
    return x0, y0, x1, y1


def ink_color(im, bg, box):
    """墨色代表色：码区内与背景差异最大的前 8% 像素的中位色"""
    px = im.load()
    x0, y0, x1, y1 = box
    vals = []
    for y in range(y0, y1):
        for x in range(x0, x1):
            d = dist2(px[x, y], bg)
            if d > 40 * 40:
                vals.append((d, px[x, y]))
    if not vals:
        sys.exit("qr box 内没有墨色像素")
    vals.sort(key=lambda t: -t[0])
    top = [v[1] for v in vals[:max(1, len(vals) // 12)]]
    n = len(top)
    return (sorted(p[0] for p in top)[n // 2],
            sorted(p[1] for p in top)[n // 2],
            sorted(p[2] for p in top)[n // 2])


def recolor(im, fg, bg_out, quiet_ratio=0.12, size=None, logo=None,
            logo_ratio=0.18, thr=52):
    bg = border_bg(im)
    box = qr_box(im, bg, thr)
    ink = ink_color(im, bg, box)
    x0, y0, x1, y1 = box
    side_src = max(x1 - x0, y1 - y0)
    pad = int(round(side_src * quiet_ratio))
    side = side_src + pad * 2
    canvas = Image.new("RGB", (side, side), bg_out)
    cpx = canvas.load()
    px = im.load()

    axis = (ink[0] - bg[0], ink[1] - bg[1], ink[2] - bg[2])
    denom = axis[0] ** 2 + axis[1] ** 2 + axis[2] ** 2 or 1
    ox, oy = (side - (x1 - x0)) // 2, (side - (y1 - y0)) // 2

    for y in range(y0, y1):
        for x in range(x0, x1):
            p = px[x, y]
            # 投影到 bg→ink 轴得到「墨的浓度」，天然还原抗锯齿过渡
            t = ((p[0] - bg[0]) * axis[0] + (p[1] - bg[1]) * axis[1]
                 + (p[2] - bg[2]) * axis[2]) / denom
            t = 0.0 if t < 0 else (1.0 if t > 1 else t)
            cpx[x - x0 + ox, y - y0 + oy] = (
                int(bg_out[0] + (fg[0] - bg_out[0]) * t + 0.5),
                int(bg_out[1] + (fg[1] - bg_out[1]) * t + 0.5),
                int(bg_out[2] + (fg[2] - bg_out[2]) * t + 0.5),
            )

    if size and size != side:
        canvas = canvas.resize((size, size), Image.LANCZOS)

    if logo and logo_ratio > 0:
        lg = Image.open(logo).convert("RGBA")
        s = int(canvas.width * logo_ratio)
        lg.thumbnail((s, s), Image.LANCZOS)
        d = ImageDraw.Draw(canvas)
        p = int(s * 0.10)
        bx, by = (canvas.width - lg.width) // 2, (canvas.height - lg.height) // 2
        d.rounded_rectangle([bx - p, by - p, bx + lg.width + p,
                             by + lg.height + p], radius=int(s * 0.16),
                            fill=bg_out)
        canvas.paste(lg, (bx, by), lg)

    return canvas, dict(bg=bg, ink=ink, box=box)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="原始二维码图片（可带标题等杂讯）")
    ap.add_argument("--output", required=True)
    ap.add_argument("--fg", default="#1B3A6B", help="目标墨色")
    ap.add_argument("--bg", default="#FFFFFF", help="目标底色")
    ap.add_argument("--quiet-ratio", type=float, default=0.12,
                    help="静区占码边长比例（4模块/33~45模块 ≈ 0.09~0.12）")
    ap.add_argument("--size", type=int, default=1600, help="输出边长 px")
    ap.add_argument("--logo", default="")
    ap.add_argument("--logo-ratio", type=float, default=0.18)
    ap.add_argument("--thr", type=int, default=52, help="判定墨色的色差阈值")
    ap.add_argument("--expect", default="", help="期望解码内容，逐字校验")
    a = ap.parse_args()

    im = Image.open(a.input).convert("RGB")
    out, info = recolor(im, hex2rgb(a.fg), hex2rgb(a.bg), a.quiet_ratio,
                        a.size, a.logo or None, a.logo_ratio, a.thr)
    os.makedirs(os.path.dirname(os.path.abspath(a.output)), exist_ok=True)
    out.save(a.output, "PNG", optimize=True)
    print("saved:", a.output, out.size, info)

    try:
        import zxingcpp
    except ImportError:
        print("warn: zxingcpp 未安装，跳过校验（pip install zxing-cpp）")
        return
    res = zxingcpp.read_barcodes(out)
    txt = res[0].text if res else ""
    if not txt:
        sys.exit("FAIL 美化后解码失败：检查 --thr 是否把定位角判成背景，"
                 "或静区是否不足")
    if a.expect:
        ok = (txt == a.expect)
        print(("PASS " if ok else "FAIL "), txt[:110])
        if not ok:
            print("expect:", a.expect[:110])
            sys.exit(1)
    else:
        print("PASS(解码成功，未比对期望值)", txt[:110])


if __name__ == "__main__":
    main()
