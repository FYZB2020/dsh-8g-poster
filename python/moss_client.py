# -*- coding: utf-8 -*-
"""MOSS-Image 出图客户端（ComfyUI API）

与 comfy_client.py（FLUX 3 Klein）并列，共用同一台 ComfyUI，只是换模型与采样默认值。

用法:
    python moss_client.py --prompt "..." --out out.png [--w 1024 --h 1024 --seed 1 --steps 20 --cfg 2.5]

依赖: 仅标准库。
"""
import argparse
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.error
import urllib.request
import uuid

HOST = "http://127.0.0.1:8189"

UNET = "moss_image_sft_int8_convrot.safetensors"
CLIP = "qwen3.5_9b_w4a8_gptq.safetensors"
VAE = "flux2-vae.safetensors"
CTRL_LORA = "moss_image_color_depth_control.safetensors"
EDIT_LORA = "moss_image_edit_lora_rank_64_bf16.safetensors"
ALPHA = 16.0
MU = round(math.log(ALPHA), 5)


def build_prompt(prompt, neg, w, h, seed, steps, cfg, sampler, scheduler, prefix,
                 layout=None, color_map=None, depth_map=None, ctrl_strength=1.0,
                 ctrl_start=0.0, ctrl_end=1.0, edit_ref=None, edit_format="Moss-Image-Edit",
                 image_strength=1.0, model_strength=1.0, edit_denoise=0.6):
    g = {
        "9": {"class_type": "UNETLoader", "inputs": {"unet_name": UNET, "weight_dtype": "default"}},
        "10": {"class_type": "CLIPLoader", "inputs": {"clip_name": CLIP, "type": "moss_image", "device": "default"}},
        "11": {"class_type": "VAELoader", "inputs": {"vae_name": VAE}},
        "12": {"class_type": "EmptyFlux2LatentImage", "inputs": {"width": w, "height": h, "batch_size": 1}},
        "15": {"class_type": "VAEDecode", "inputs": {"samples": ["14", 0], "vae": ["11", 0]}},
        "16": {"class_type": "SaveImage", "inputs": {"images": ["15", 0], "filename_prefix": prefix}},
    }
    model = ["9", 0]

    # ① 版面框控：把 prompt 换成 MOSS layout JSON
    if layout:
        g["28"] = {"class_type": "CreateBoundingBoxes", "inputs": {
            "bboxes": json.dumps(layout, ensure_ascii=False), "width": w, "height": h, "editor_state": {"boxes": [], "width": w, "height": h}}}
        g["30"] = {"class_type": "MOSSImageLayoutPrompt", "inputs": {
            "prompt": prompt, "element": ["28", 2], "width": w, "height": h, "character_boxes": ""}}
        g["6"] = {"class_type": "CLIPTextEncode", "inputs": {"text": ["30", 0], "clip": ["10", 0]}}
        g["27"] = {"class_type": "CLIPTextEncode", "inputs": {"text": neg, "clip": ["10", 0]}}
    else:
        g["6"] = {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["10", 0]}}
        g["27"] = {"class_type": "CLIPTextEncode", "inputs": {"text": neg, "clip": ["10", 0]}}

    pos, negc = ["6", 0], ["27", 0]

    # ② 局部编辑：edit LoRA + 文本编码器看参考图
    if edit_ref:
        g["31"] = {"class_type": "LoraLoaderModelOnly", "inputs": {
            "model": ["9", 0], "lora_name": EDIT_LORA, "strength_model": model_strength}}
        model = ["31", 0]
        g["32"] = {"class_type": "LoadImage", "inputs": {"image": edit_ref}}
        for nid, text in (("33", prompt), ("38", neg)):
            g[nid] = {"class_type": "TextEncodeMOSSImageEdit", "inputs": {
                "clip": ["10", 0], "prompt": text, "edit_format": edit_format,
                "images.image_0": ["32", 0], "image_strength": image_strength, "vae": ["11", 0]}}
        pos, negc = ["33", 0], ["38", 0]
        g["39"] = {"class_type": "VAEEncode", "inputs": {"pixels": ["32", 0], "vae": ["11", 0]}}
        g["40"] = {"class_type": "ImageScale", "inputs": {"image": ["32", 0], "upscale_method": "lanczos", "width": w, "height": h, "crop": "center"}}
        g["39"] = {"class_type": "VAEEncode", "inputs": {"pixels": ["40", 0], "vae": ["11", 0]}},

    # ③ 色块/深度控制：控制 LoRA + MOSSImageControl
    if color_map or depth_map:
        g["34"] = {"class_type": "LoraLoaderModelOnly", "inputs": {
            "model": model, "lora_name": CTRL_LORA, "strength_model": model_strength}}
        model = ["34", 0]
        ctrl = {"positive": pos, "negative": negc, "vae": ["11", 0],
                "strength": ctrl_strength, "start_percent": ctrl_start, "end_percent": ctrl_end}
        if color_map:
            g["35"] = {"class_type": "LoadImage", "inputs": {"image": color_map}}
            ctrl["color_map"] = ["35", 0]
        if depth_map:
            g["36"] = {"class_type": "LoadImage", "inputs": {"image": depth_map}}
            ctrl["depth_map"] = ["36", 0]
        g["37"] = {"class_type": "MOSSImageControl", "inputs": ctrl}
        pos, negc = ["37", 0], ["37", 1]

    g["13"] = {"class_type": "ModelSamplingFlux",
               "inputs": {"model": model, "max_shift": MU, "base_shift": MU, "width": w, "height": h}}
    g["14"] = {"class_type": "KSampler",
               "inputs": {"model": ["13", 0], "positive": pos, "negative": negc,
                          "latent_image": (["39", 0] if edit_ref else ["12", 0]), "seed": seed, "steps": steps, "cfg": cfg,
                          "sampler_name": sampler, "scheduler": scheduler, "denoise": (edit_denoise if edit_ref else 1.0)}}
    return g


def post_json(path, payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(HOST + path, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "ignore")
        raise SystemExit("HTTP %d from %s\n%s" % (e.code, path, body[:1500]))


def get_json(path):
    with urllib.request.urlopen(HOST + path, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def main():
    global HOST
    ap = argparse.ArgumentParser()
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--neg", default="")
    ap.add_argument("--out", required=True)
    ap.add_argument("--w", type=int, default=1024)
    ap.add_argument("--h", type=int, default=1024)
    ap.add_argument("--seed", type=int, default=-1)
    ap.add_argument("--steps", type=int, default=20)
    ap.add_argument("--cfg", type=float, default=2.5)
    ap.add_argument("--sampler", default="euler")
    ap.add_argument("--scheduler", default="simple")
    ap.add_argument("--host", default=None)
    ap.add_argument("--timeout", type=int, default=1800)
    ap.add_argument("--prefix", default="moss_image")
    ap.add_argument("--layout", default=None, help="layout JSON 文件路径（元素列表）")
    ap.add_argument("--color-map", dest="color_map", default=None)
    ap.add_argument("--depth-map", dest="depth_map", default=None)
    ap.add_argument("--ctrl-strength", dest="ctrl_strength", type=float, default=1.0)
    ap.add_argument("--ctrl-start", dest="ctrl_start", type=float, default=0.0)
    ap.add_argument("--ctrl-end", dest="ctrl_end", type=float, default=1.0)
    ap.add_argument("--edit-ref", dest="edit_ref", default=None)
    ap.add_argument("--edit-format", dest="edit_format", default="Moss-Image-Edit")
    ap.add_argument("--image-strength", dest="image_strength", type=float, default=1.0)
    ap.add_argument("--model-strength", dest="model_strength", type=float, default=1.0)
    ap.add_argument("--edit-denoise", dest="edit_denoise", type=float, default=0.6)
    a = ap.parse_args()

    if a.host:
        HOST = a.host if a.host.startswith("http") else "http://" + a.host

    seed = a.seed if a.seed >= 0 else int(time.time() * 1000) % 2**31
    prefix = "%s_%d" % (a.prefix, seed)
    layout = None
    if a.layout:
        with open(a.layout, encoding="utf-8") as fh:
            raw = json.load(fh)
        layout = raw.get("elements", raw) if isinstance(raw, dict) else raw
    g = build_prompt(a.prompt, a.neg, a.w, a.h, seed, a.steps, a.cfg, a.sampler, a.scheduler, prefix,
                     layout=layout, color_map=a.color_map, depth_map=a.depth_map,
                     ctrl_strength=a.ctrl_strength, ctrl_start=a.ctrl_start, ctrl_end=a.ctrl_end,
                     edit_ref=a.edit_ref, edit_format=a.edit_format,
                     image_strength=a.image_strength, model_strength=a.model_strength, edit_denoise=a.edit_denoise)

    r = post_json("/prompt", {"prompt": g, "client_id": uuid.uuid4().hex})
    pid = r.get("prompt_id")
    if not pid:
        print("SUBMIT FAILED:", json.dumps(r, ensure_ascii=False)[:800], file=sys.stderr)
        sys.exit(1)
    print("prompt_id:", pid, "seed:", seed)

    t0 = time.time()
    while time.time() - t0 < a.timeout:
        time.sleep(1.5)
        h = get_json("/history/" + pid)
        if pid in h:
            entry = h[pid]
            outs = entry.get("outputs", {})
            imgs = []
            for node in outs.values():
                imgs += node.get("images", [])
            if not imgs:
                print("NO IMAGE:", json.dumps(entry, ensure_ascii=False)[:600], file=sys.stderr)
                sys.exit(1)
            im = imgs[0]
            q = urllib.parse.urlencode({"filename": im["filename"], "subfolder": im.get("subfolder", ""), "type": im.get("type", "output")})
            with urllib.request.urlopen(HOST + "/view?" + q, timeout=120) as resp:
                data = resp.read()
            os.makedirs(os.path.dirname(os.path.abspath(a.out)) or ".", exist_ok=True)
            with open(a.out, "wb") as f:
                f.write(data)
            dt = time.time() - t0
            print("SAVED %s  %.1f KB  %.1fs  seed=%d" % (a.out, len(data) / 1024, dt, seed))
            print("META " + json.dumps({"model": "moss_image", "seed": seed, "w": a.w, "h": a.h,
                                        "steps": a.steps, "cfg": a.cfg, "sampler": a.sampler,
                                        "scheduler": a.scheduler, "prompt": a.prompt}, ensure_ascii=False))
            return
    print("TIMEOUT after %ds" % a.timeout, file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    main()
