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
import urllib.request
import uuid

HOST = "http://127.0.0.1:8189"

UNET = "moss_image_sft_int8_convrot.safetensors"
CLIP = "qwen3.5_9b_w4a8_gptq.safetensors"
VAE = "flux2-vae.safetensors"
ALPHA = 16.0
MU = round(math.log(ALPHA), 5)


def build_prompt(prompt, neg, w, h, seed, steps, cfg, sampler, scheduler, prefix):
    return {
        "9": {"class_type": "UNETLoader", "inputs": {"unet_name": UNET, "weight_dtype": "default"}},
        "10": {"class_type": "CLIPLoader", "inputs": {"clip_name": CLIP, "type": "moss_image", "device": "default"}},
        "11": {"class_type": "VAELoader", "inputs": {"vae_name": VAE}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["10", 0]}},
        "27": {"class_type": "CLIPTextEncode", "inputs": {"text": neg, "clip": ["10", 0]}},
        "12": {"class_type": "EmptyFlux2LatentImage", "inputs": {"width": w, "height": h, "batch_size": 1}},
        "13": {"class_type": "ModelSamplingFlux",
               "inputs": {"model": ["9", 0], "max_shift": MU, "base_shift": MU, "width": w, "height": h}},
        "14": {"class_type": "KSampler",
               "inputs": {"model": ["13", 0], "positive": ["6", 0], "negative": ["27", 0],
                          "latent_image": ["12", 0], "seed": seed, "steps": steps, "cfg": cfg,
                          "sampler_name": sampler, "scheduler": scheduler, "denoise": 1.0}},
        "15": {"class_type": "VAEDecode", "inputs": {"samples": ["14", 0], "vae": ["11", 0]}},
        "16": {"class_type": "SaveImage", "inputs": {"images": ["15", 0], "filename_prefix": prefix}},
    }


def post_json(path, payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(HOST + path, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


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
    a = ap.parse_args()

    if a.host:
        HOST = a.host if a.host.startswith("http") else "http://" + a.host

    seed = a.seed if a.seed >= 0 else int(time.time() * 1000) % 2**31
    prefix = "%s_%d" % (a.prefix, seed)
    g = build_prompt(a.prompt, a.neg, a.w, a.h, seed, a.steps, a.cfg, a.sampler, a.scheduler, prefix)

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
