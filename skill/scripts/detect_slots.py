# -*- coding: utf-8 -*-
"""识别图中矩形占位块（灰块 / 白卡 / 指定色块），输出 JSON。

用法：
  python detect_slots.py --image base.png [--color gray|white|#RRGGBB]
                         [--min-size 40] [--max-size 200] [--square-tol 0.35]
                         [--y-min-ratio 0.0] [--group] [--out slots.json]

输出 JSON:
{
  "image": "...", "size": [w, h],
  "slots": [{"id": 1, "box": [x, y, w, h], "cx": ..., "cy": ...,
             "group": 0, "order": 0}],
  "summary": {"count": n, "min_gap": float, "median_size": float}
}
"""
import argparse
import json
import os
import sys

import cv2
import numpy as np


def color_mask(arr, color, tol=14):
    """返回布尔掩码。gray/white 走多通道一致性判据，其余按 HEX 近似。"""
    r, g, b = arr[:, :, 0].astype(int), arr[:, :, 1].astype(int), arr[:, :, 2].astype(int)
    if color == "gray":
        return ((np.abs(r - g) < tol) & (np.abs(g - b) < tol)
                & (r > 150) & (r < 245))
    if color == "white":
        return (r > 235) & (g > 228) & (b > 215)
    hexs = color.lstrip("#")
    tr, tg, tb = int(hexs[0:2], 16), int(hexs[2:4], 16), int(hexs[4:6], 16)
    return ((np.abs(r - tr) < tol) & (np.abs(g - tg) < tol) & (np.abs(b - tb) < tol))


def detect(image, color="gray", tol=14, min_size=40, max_size=220,
           square_tol=0.35, fill_ratio=0.68, y_min_ratio=0.0, close=3):
    bgr = cv2.imread(image)
    if bgr is None:
        sys.exit(f"cannot read image: {image}")
    H, W = bgr.shape[:2]
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)   # 统一按 RGB 判色，勿直接用 BGR
    mask = color_mask(rgb, color, tol).astype(np.uint8) * 255
    if close > 1:
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE,
                                np.ones((close, close), np.uint8))
    n, lab, stats, cent = cv2.connectedComponentsWithStats(mask, 8)
    slots = []
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        if not (min_size <= w <= max_size and min_size <= h <= max_size):
            continue
        if area < fill_ratio * w * h:
            continue
        if abs(w - h) > square_tol * max(w, h):
            continue
        if y < H * y_min_ratio:
            continue
        slots.append({"box": [int(x), int(y), int(w), int(h)]})
    return slots, (W, H)


def annotate(slots, size):
    """按行分组（y 相近）再按 x 排；返回 (slots, min_gap, median_size)"""
    if not slots:
        return slots, 0.0, 0.0
    slots.sort(key=lambda s: s["box"][1])
    rows, cur = [], [slots[0]]
    for s in slots[1:]:
        prev = cur[-1]["box"]
        if abs(s["box"][1] - prev[1]) < prev[3] * 0.6:
            cur.append(s)
        else:
            rows.append(cur)
            cur = [s]
    rows.append(cur)
    order, gid = 0, 0
    for row in rows:
        row.sort(key=lambda s: s["box"][0])
        for s in row:
            x, y, w, h = s["box"]
            s.update(id=order + 1, cx=x + w / 2, cy=y + h / 2,
                     group=gid, order=order)
            order += 1
        gid += 1
    centers = [(s["cx"], s["cy"]) for s in slots]
    gaps = []
    if len(centers) > 1:
        for i, (x0, y0) in enumerate(centers):
            d = min(((x0 - x1) ** 2 + (y0 - y1) ** 2) ** 0.5
                    for j, (x1, y1) in enumerate(centers) if j != i)
            gaps.append(d)
    sizes = [max(s["box"][2], s["box"][3]) for s in slots]
    return slots, (min(gaps) if gaps else 0.0), float(np.median(sizes))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--image", required=True)
    ap.add_argument("--color", default="gray", help="gray|white|#RRGGBB")
    ap.add_argument("--tol", type=int, default=14)
    ap.add_argument("--min-size", type=int, default=40)
    ap.add_argument("--max-size", type=int, default=220)
    ap.add_argument("--square-tol", type=float, default=0.35)
    ap.add_argument("--fill-ratio", type=float, default=0.68)
    ap.add_argument("--y-min-ratio", type=float, default=0.0)
    ap.add_argument("--close", type=int, default=3, help="闭运算核，块挨得近时用 1")
    ap.add_argument("--out", default="")
    a = ap.parse_args()

    slots, size = detect(a.image, a.color, a.tol, a.min_size, a.max_size,
                         a.square_tol, a.fill_ratio, a.y_min_ratio, a.close)
    slots, min_gap, med = annotate(slots, size)
    data = {"image": os.path.abspath(a.image), "size": list(size),
            "slots": slots,
            "summary": {"count": len(slots), "min_gap": round(min_gap, 1),
                        "median_size": round(med, 1)}}
    if a.out:
        with open(a.out, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    print(json.dumps(data["summary"], ensure_ascii=False))
    for s in slots:
        print(f"  #{s['id']} group={s['group']} box={s['box']} "
              f"center=({s['cx']:.0f},{s['cy']:.0f})")
    if min_gap and med and min_gap < med * 1.15:
        print(f"  ! 最近块中心距 {min_gap:.0f}px 仅约 {min_gap / med:.2f} 倍块尺寸，"
              f"贴码时须限制尺寸（gap_factor<=0.86）", file=sys.stderr)


if __name__ == "__main__":
    main()
