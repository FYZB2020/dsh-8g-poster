# -*- coding: utf-8 -*-
"""FLUX 3 Klein 参考图生成客户端（ComfyUI API, ReferenceMultiLatent 路径）

用法:
    python flux_i2i.py --refs ref_cover.png ref_poster.jpg --prompt "..." --out x.png [--port 8189]

参考图需先放到 ComfyUI/input/ 下。仅标准库。
"""
import argparse
import json
import math
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

UNET = "flux3-image-klein-int8-convrot.safetensors"
CLIP = "qwen3vl_4b_int8_convrot.safetensors"
VAE = "flux2-vae.safetensors"
ALPHA = 16.0
MU = round(math.log(ALPHA), 5)

HOST = "http://127.0.0.1:8189"


def build_graph(prompt, neg, refs, w, h, seed, steps, cfg, sampler, scheduler, prefix, megapixels):
    g = {
        "9":  {"class_type": "UNETLoader", "inputs": {"unet_name": UNET, "weight_dtype": "default"}},
        "10": {"class_type": "CLIPLoader", "inputs": {"clip_name": CLIP, "type": "flux3", "device": "default"}},
        "11": {"class_type": "VAELoader", "inputs": {"vae_name": VAE}},
        "6":  {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["10", 0]}},
        "27": {"class_type": "CLIPTextEncode", "inputs": {"text": neg, "clip": ["10", 0]}},
        "13": {"class_type": "ModelSamplingFlux",
               "inputs": {"model": ["9", 0], "max_shift": MU, "base_shift": MU, "width": w, "height": h}},
    }
    rm_inputs = {"positive": ["6", 0], "negative": ["27", 0], "vae": ["11", 0],
                 "resolution": "resize", "resolution.megapixels": megapixels}
    for i, name in enumerate(refs):
        nid = str(20 + i)
        g[nid] = {"class_type": "LoadImage", "inputs": {"image": name}}
        rm_inputs["images.image%d" % i] = [nid, 0]
    g["8"] = {"class_type": "ReferenceMultiLatent", "inputs": rm_inputs}
    g["14"] = {"class_type": "KSampler",
               "inputs": {"model": ["13", 0], "positive": ["8", 0], "negative": ["8", 1],
                          "latent_image": ["8", 2], "seed": seed, "steps": steps, "cfg": cfg,
                          "sampler_name": sampler, "scheduler": scheduler, "denoise": 1.0}}
    g["15"] = {"class_type": "VAEDecode", "inputs": {"samples": ["14", 0], "vae": ["11", 0]}}
    g["16"] = {"class_type": "SaveImage", "inputs": {"images": ["15", 0], "filename_prefix": prefix}}
    return g


def post_json(path, payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(HOST + path, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode("utf-8"))


def get_json(path):
    with urllib.request.urlopen(HOST + path, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def main():
    global HOST
    ap = argparse.ArgumentParser()
    ap.add_argument("--refs", nargs="+", required=True)
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--neg", default="")
    ap.add_argument("--out", required=True)
    ap.add_argument("--w", type=int, default=1024)
    ap.add_argument("--h", type=int, default=1024)
    ap.add_argument("--megapixels", type=float, default=1.0)
    ap.add_argument("--seed", type=int, default=-1)
    ap.add_argument("--steps", type=int, default=16)
    ap.add_argument("--cfg", type=float, default=1.0)
    ap.add_argument("--sampler", default="euler")
    ap.add_argument("--scheduler", default="simple")
    ap.add_argument("--port", type=int, default=8189)
    ap.add_argument("--timeout", type=int, default=2400)
    a = ap.parse_args()
    HOST = "http://127.0.0.1:%d" % a.port

    seed = a.seed if a.seed >= 0 else int(time.time() * 1000) % (2 ** 48)
    prefix = "fluxi2i_" + uuid.uuid4().hex[:8]
    graph = build_graph(a.prompt, a.neg, a.refs, a.w, a.h, seed, a.steps, a.cfg,
                        a.sampler, a.scheduler, prefix, a.megapixels)

    t0 = time.time()
    try:
        res = post_json("/prompt", {"prompt": graph, "client_id": uuid.uuid4().hex})
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        print("SUBMIT FAILED", e.code, flush=True)
        print(body[:4000])
        return 2
    pid = res.get("prompt_id")
    print("prompt_id:", pid, "seed:", seed, "refs:", a.refs, flush=True)

    while time.time() - t0 < a.timeout:
        time.sleep(3)
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
                print("no images", entry.get("outputs"))
                return 4
            img = imgs[0]
            q = urllib.parse.urlencode({"filename": img["filename"],
                                        "subfolder": img.get("subfolder", ""),
                                        "type": img.get("type", "output")})
            with urllib.request.urlopen(HOST + "/view?" + q, timeout=180) as r:
                blob = r.read()
            os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
            open(a.out, "wb").write(blob)
            print("SAVED %s  %.1f KB  %.1fs  seed=%d" % (a.out, len(blob) / 1024, time.time() - t0, seed))
            return 0
    print("TIMEOUT")
    return 5


if __name__ == "__main__":
    sys.exit(main())
