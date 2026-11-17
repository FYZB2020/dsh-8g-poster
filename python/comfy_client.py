# -*- coding: utf-8 -*-
"""FLUX 3 Klein 出图客户端（ComfyUI API）

用法:
    python comfy_client.py --prompt "..." --out out.png [--w 1024 --h 1024 --seed 123 --steps 16]

依赖: 仅标准库。
"""
import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request
import uuid

HOST = os.environ.get("POSTER_COMFY", "http://127.0.0.1:8188")

UNET = os.environ.get("POSTER_UNET", "flux3-image-klein-int8-convrot.safetensors")
CLIP = os.environ.get("POSTER_CLIP", "qwen3vl_4b_int8_convrot.safetensors")
VAE = os.environ.get("POSTER_VAE", "flux2-vae.safetensors")
ALPHA = 16.0          # 时间步偏移，mu = ln(alpha)
MU = round(__import__("math").log(ALPHA), 5)


def build_prompt(prompt, neg, w, h, seed, steps, cfg, sampler, scheduler, prefix):
    return {
        "9":  {"class_type": "UNETLoader", "inputs": {"unet_name": UNET, "weight_dtype": "default"}},
        "10": {"class_type": "CLIPLoader", "inputs": {"clip_name": CLIP, "type": "flux3", "device": "default"}},
        "11": {"class_type": "VAELoader", "inputs": {"vae_name": VAE}},
        "6":  {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["10", 0]}},
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
    ap.add_argument("--steps", type=int, default=16)
    ap.add_argument("--cfg", type=float, default=1.0)
    ap.add_argument("--sampler", default="euler")
    ap.add_argument("--scheduler", default="simple")
    ap.add_argument("--timeout", type=int, default=1800)
    ap.add_argument("--host", default=None, help="ComfyUI 地址，默认 http://127.0.0.1:8188")
    a = ap.parse_args()
    if a.host:
        HOST = a.host.rstrip("/")

    seed = a.seed if a.seed >= 0 else int(time.time() * 1000) % (2 ** 48)
    prefix = "poster_" + uuid.uuid4().hex[:8]
    graph = build_prompt(a.prompt, a.neg, a.w, a.h, seed, a.steps, a.cfg, a.sampler, a.scheduler, prefix)

    t0 = time.time()
    try:
        res = post_json("/prompt", {"prompt": graph, "client_id": uuid.uuid4().hex})
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        print("SUBMIT FAILED", e.code)
        print(body[:4000])
        return 2
    pid = res.get("prompt_id")
    print("prompt_id:", pid, "seed:", seed, flush=True)

    last = 0
    while time.time() - t0 < a.timeout:
        time.sleep(2)
        try:
            hist = get_json("/history/" + pid)
        except Exception:
            continue
        if pid in hist:
            entry = hist[pid]
            status = entry.get("status", {})
            if status.get("status_str") == "error":
                print("EXECUTION ERROR")
                for m in status.get("messages", [])[-5:]:
                    print(m)
                return 3
            imgs = []
            for node_out in entry.get("outputs", {}).values():
                imgs.extend(node_out.get("images", []))
            if not imgs:
                print("no images in history", entry.get("outputs"))
                return 4
            img = imgs[0]
            q = urllib.parse.urlencode({"filename": img["filename"],
                                        "subfolder": img.get("subfolder", ""),
                                        "type": img.get("type", "output")})
            with urllib.request.urlopen(HOST + "/view?" + q, timeout=120) as r:
                blob = r.read()
            os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
            with open(a.out, "wb") as f:
                f.write(blob)
            dt = time.time() - t0
            print("SAVED %s  %.1f KB  %.1fs  seed=%d" % (a.out, len(blob) / 1024, dt, seed))
            print("META " + json.dumps({"seed": seed, "w": a.w, "h": a.h, "steps": a.steps,
                                        "cfg": a.cfg, "sampler": a.sampler, "scheduler": a.scheduler,
                                        "prompt": a.prompt}, ensure_ascii=False))
            return 0
        # 进度
        try:
            q = get_json("/prompt")
            if q.get("queue_remaining") == 0 and time.time() - t0 > 10:
                pass
        except Exception:
            pass
    print("TIMEOUT")
    return 5


if __name__ == "__main__":
    sys.exit(main())
