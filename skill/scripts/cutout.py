# -*- coding: utf-8 -*-
"""GrabCut 抠图：主体 → 透明 PNG（含三色预览）

用法：
  python cutout.py --input raw.png --output cut.png [--up 3] [--edge-band 0.04]
                   [--iters 8] [--feather 1.6] [--preview-dir preview/]

要点：
  - 先放大再抠，边缘更细
  - 第一遍矩形初始化，第二遍把四周 edge-band 强制标成背景（去掉细线/色块边）
  - 形态学闭-开 + 只保留最大连通域 + 填内部孔洞
  - 羽化后做对比度拉伸，半透明过渡窄、不发虚
"""
import argparse
import os

import cv2
import numpy as np
from PIL import Image


def imread_unicode(path):
    """cv2.imread 在 Windows 下读不了含中文的路径，换成 imdecode。"""
    try:
        data = np.fromfile(path, dtype=np.uint8)
        if data.size == 0:
            return None
        return cv2.imdecode(data, cv2.IMREAD_COLOR)
    except Exception:
        return None


def cut(src, up=3, edge_band=0.04, iters=8, feather=1.6, keep_largest=True):
    img = imread_unicode(src)
    if img is None:
        raise SystemExit(f"cannot read image: {src}")
    if up > 1:
        h, w = img.shape[:2]
        img = cv2.resize(img, (w * up, h * up), interpolation=cv2.INTER_CUBIC)
    H, W = img.shape[:2]

    mask = np.zeros((H, W), np.uint8)
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    pad = 0.05
    rect = (int(W * pad), int(H * pad), int(W * (1 - 2 * pad)), int(H * (1 - 2 * pad)))
    cv2.grabCut(img, mask, rect, bgd, fgd, iters, cv2.GC_INIT_WITH_RECT)

    if edge_band > 0:
        b = edge_band
        mask[:, :int(W * b)] = cv2.GC_BGD
        mask[:, int(W * (1 - b)):] = cv2.GC_BGD
        mask[:int(H * b), :] = cv2.GC_BGD
        mask[int(H * (1 - b)):, :] = cv2.GC_BGD
        cv2.grabCut(img, mask, None, bgd, fgd, max(2, iters - 2), cv2.GC_INIT_WITH_MASK)

    fg = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE,
                          cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)), iterations=2)
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN,
                          cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))

    if keep_largest:
        n, lab, stats, _ = cv2.connectedComponentsWithStats(fg, 8)
        if n > 1:
            idx = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
            fg = np.where(lab == idx, 255, 0).astype(np.uint8)

    # 填内部孔洞
    ff = fg.copy()
    m2 = np.zeros((fg.shape[0] + 2, fg.shape[1] + 2), np.uint8)
    cv2.floodFill(ff, m2, (0, 0), 255)
    fg = fg | cv2.bitwise_not(ff)

    alpha = cv2.GaussianBlur(fg, (0, 0), feather)
    alpha = np.clip((alpha.astype(np.float32) - 40) * 255 / 175, 0, 255).astype(np.uint8)

    rgba = cv2.cvtColor(img, cv2.COLOR_BGR2RGBA)
    rgba[:, :, 3] = alpha
    out = Image.fromarray(rgba)
    bbox = out.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if bbox:
        p = 6
        out = out.crop((max(0, bbox[0] - p), max(0, bbox[1] - p),
                        min(out.width, bbox[2] + p), min(out.height, bbox[3] + p)))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--up", type=int, default=3)
    ap.add_argument("--edge-band", type=float, default=0.04)
    ap.add_argument("--iters", type=int, default=8)
    ap.add_argument("--feather", type=float, default=1.6)
    ap.add_argument("--preview-dir", default="")
    a = ap.parse_args()

    out = cut(a.input, a.up, a.edge_band, a.iters, a.feather)
    os.makedirs(os.path.dirname(os.path.abspath(a.output)), exist_ok=True)
    out.save(a.output, "PNG")
    print("saved:", a.output, out.size)

    if a.preview_dir:
        os.makedirs(a.preview_dir, exist_ok=True)
        base = os.path.splitext(os.path.basename(a.output))[0]
        for name, bg in [("white", (255, 255, 255)), ("dark", (30, 30, 30)),
                         ("cream", (251, 250, 246))]:
            canvas = Image.new("RGB", (out.width + 80, out.height + 80), bg)
            canvas.paste(out, (40, 40), out)
            p = os.path.join(a.preview_dir, f"{base}_{name}.png")
            canvas.save(p)
            print("preview:", p)


if __name__ == "__main__":
    main()
