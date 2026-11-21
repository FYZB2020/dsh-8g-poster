# Install

From nothing to a print-ready poster: roughly 30–60 minutes, 90% of it spent downloading models.

Written with Windows in mind (the plugin also runs on macOS / Linux — swap `export` for `set` and `/` for `\`).
Model paths below use `D:\ComfyUI\models`; substitute yours.

---

## 0. What you need

| | Requirement | Notes |
|---|---|---|
| GPU | NVIDIA, **8 GB VRAM minimum** | 8 GB works; generations stay at 1024-class, one job at a time |
| Disk | **≥ 25 GB free** | both engines ≈ 23 GB; FLUX alone ≈ 10 GB |
| Node | ≥ 18 | `node -v` |
| Python | ≥ 3.8 | the local scripts run on it; 3.8 and 3.11 both tested |
| ComfyUI | any recent build | the plugin only uses its HTTP API — no custom nodes |

> **About Python:** the plugin runs `python` by default. Point it elsewhere with `POSTER_PYTHON`
> (e.g. `POSTER_PYTHON=C:\Python311\python.exe`). Do **not** point it at a bare interpreter with no
> packages — you will get `qrcode not installed` even though you just installed it somewhere else.

---

## 1. Python packages

```bash
python -m pip install -r skill/requirements.txt
```

Equivalent:

```bash
python -m pip install Pillow numpy opencv-python-headless reportlab qrcode zxing-cpp
```

- `qrcode` **generates** codes; `zxing-cpp` **decodes** them for the pre-print check.
- Neither is needed if you never touch QR.

Check:

```bash
python -c "import PIL, numpy, cv2, reportlab; print('ok')"
```

---

## 2. ComfyUI on port 8189

```bash
git clone https://github.com/comfyanonymous/ComfyUI.git D:\ComfyUI
cd D:\ComfyUI
python -m pip install -r requirements.txt
```

**On an 8 GB card, launch it like this** — `--lowvram` is the part that keeps 1024-class generation from
running out of memory:

```bash
python main.py --listen 127.0.0.1 --port 8189 --lowvram --preview-method none --disable-auto-launch
```

Wait for `To see the GUI go to: http://127.0.0.1:8189`.

> Why 8189 and not the default 8188? Because 8188 is usually already taken by the ComfyUI you opened yourself.
> 8189 keeps the plugin's jobs separate. Override with `POSTER_COMFY` if you disagree.
>
> Warnings like `comfyui-workflow-templates is not installed` in the startup log are harmless.

---

## 3. Models

Install the downloader and set the mirror (huggingface.co is unreachable from most of CN; `hf-mirror.com` works):

```powershell
# Windows PowerShell
python -m pip install -U "huggingface_hub[cli]"
$env:HF_ENDPOINT = "https://hf-mirror.com"
```

```bash
# macOS / Linux
export HF_ENDPOINT=https://hf-mirror.com
```

### 3.1 FLUX 3 Klein (recommended — install this one)

| File | Goes to |
|---|---|
| `split_files/diffusion_models/flux-2-klein-4b.safetensors` | `models\diffusion_models\` |
| `split_files/text_encoders/qwen_3_4b.safetensors` | `models\text_encoders\` |
| `split_files/vae/flux2-vae.safetensors` | `models\vae\` |

```bash
hf download Comfy-Org/Flux-2-Klein-4B --include "split_files/*" --local-dir D:\hf\flux2klein
# then move the three files into the matching ComfyUI models subfolders
```

(Older `huggingface_hub` calls the binary `huggingface-cli download`; same flags.)

### 3.2 MOSS-Image (optional — reads Chinese prompts more literally)

| File | Goes to |
|---|---|
| `diffusion_models/moss_image_sft_int8_convrot.safetensors` | `models\diffusion_models\` |
| `text_encoders/qwen3.5_9b_w4a8_gptq.safetensors` | `models\text_encoders\` |
| `vae/flux2-vae.safetensors` | `models\vae\` |
| `loras/moss_image_color_depth_control.safetensors` | `models\loras\` |
| `loras/moss_image_edit_lora_rank_64_bf16.safetensors` | `models\loras\` |

```bash
hf download Comfy-Org/MOSS-Image --include "*" --local-dir D:\hf\moss
```

### 3.3 When the file names don't match

The plugin looks for these by default:

```
flux3-image-klein-int8-convrot.safetensors
qwen3vl_4b_int8_convrot.safetensors
flux2-vae.safetensors
```

`flux2-vae.safetensors` is the official name — that one just works. The other two are the naming used by
**community int8 builds**. If you downloaded the official bf16 files, pick one:

**Option A — rename** the files to the three names above. Note int8 ≠ bf16: on an 8 GB card bf16 runs out of
memory much sooner, so prefer an int8 build when one exists.

**Option B — point the plugin at your names**

```powershell
$env:POSTER_UNET   = "flux-2-klein-4b.safetensors"
$env:POSTER_CLIP   = "qwen_3_4b.safetensors"
$env:POSTER_VAE    = "flux2-vae.safetensors"
$env:POSTER_COMFY  = "http://127.0.0.1:8189"
```

MOSS equivalents: `POSTER_MOSS_UNET`, `POSTER_MOSS_CLIP`, `POSTER_MOSS_CTRL_LORA`,
`POSTER_MOSS_EDIT_LORA`. `POSTER_COMFY` is shared.

---

## 4. Install the plugin

```bash
dsh plugin add dsh-8g-poster
```

Or install globally and wire it up yourself:

```bash
npm i -g dsh-8g-poster
```

From a local checkout:

```bash
cd path/to/dsh-8g-poster
npm link
dsh plugin add .
```

Reload DSH; the tool list should now show 13 `poster_*` tools.

### MCP only, no DSH?

```bash
node server/index.js        # stdio MCP server
```

```json
{
  "mcpServers": {
    "poster8g": {
      "command": "node",
      "args": ["path/to/dsh-8g-poster/server/index.js"],
      "env": { "POSTER_PYTHON": "python" }
    }
  }
}
```

---

## 5. Verify

Light to heavy:

```bash
node test/smoke.mjs      # tool declarations, fonts, templates, QR generate + decode
node test/route.mjs      # entry points are clean (host routes disabled → routes=0)
node test/ver.mjs        # version chain: save → snapshot → list/latest/diff → pre-flight check
node test/tools.mjs      # end-to-end: cutout → slots → compose to PNG+PDF → QR verify
```

All four `ALL PASS`, then ask for one 1024 image — ~45 s. If a picture comes back, ComfyUI, model names and
port all line up.

---

## 6. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ConnectionRefusedError: [WinError 10061]` | ComfyUI not running, or wrong port | `curl http://127.0.0.1:8189/system_stats`; or set `POSTER_COMFY` |
| `unknown url type: 127.0.0.1` | address missing a scheme | full URL: `http://127.0.0.1:8189` |
| `qrcode not installed` / `No module named cv2` | packages live in another interpreter | set `POSTER_PYTHON` to that one |
| `CUDA out of memory` | not enough VRAM | confirm `--lowvram`; drop to 1024; close other GPU apps |
| `value not in list` / model not found | name mismatch | see 3.3 |
| Workbench 401s in the browser | you opened the host's `/api/*` | it is a **local file**: double-click `assets/editor/poster-editor.html` |
| `hf download` stalls | no mirror | `HF_ENDPOINT=https://hf-mirror.com`, or use a proxy |

---

Next: **[Manual](MANUAL.md)** — how the 13 tools chain into one pipeline, what every workbench button does,
and what to check before you send a file to the printer.
