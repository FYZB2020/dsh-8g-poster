# 安装 · Install

从零到"能出一张印刷级海报"，大约 30–60 分钟，其中 90% 的时间在下载模型。

下文以 Windows 为例（插件也在 macOS / Linux 上跑过，命令自行换成 `export` 与 `/` 路径）。
示例里的模型目录写成 `D:\ComfyUI\models`，换成你自己的。

---

## 0. 你需要准备的东西

| 项 | 要求 | 说明 |
|---|---|---|
| GPU | NVIDIA，**8GB 显存起** | 8GB 能跑，只是出图尺寸压在 1024 级、一次一个任务 |
| 磁盘 | **≥ 25 GB 空余** | 两个引擎全下约 23 GB；只装 FLUX 约 10 GB |
| Node | ≥ 18 | `node -v` 自查 |
| Python | ≥ 3.8 | 插件调用的本地脚本用它。3.8 / 3.11 都实测过 |
| ComfyUI | 任意近期版本 | 本插件只走它的 HTTP API，不装自定义节点 |

> 关于 Python：插件默认执行 `python`，也可以用环境变量 `POSTER_PYTHON` 指到指定解释器
> （例如 `POSTER_PYTHON=C:\Python311\python.exe`）。**注意别指到没有第三方库的裸解释器**，
> 否则会报 `qrcode not installed` 之类的错——那说明依赖装在了另一个 Python 里。

---

## 1. 装 Python 依赖

```bash
python -m pip install -r skill/requirements.txt
```

等价于手装：

```bash
python -m pip install Pillow numpy opencv-python-headless reportlab qrcode zxing-cpp
```

- `qrcode` 只管**生成**二维码；`zxing-cpp` 管**解码校验**（印刷前必跑那步）。
- 不用二维码功能的话，这两个可以不装，其他功能照常。

验证：

```bash
python -c "import PIL, numpy, cv2, reportlab; print('ok')"
```

---

## 2. 装 ComfyUI 并起在 8189

```bash
git clone https://github.com/comfyanonymous/ComfyUI.git D:\ComfyUI
cd D:\ComfyUI
python -m pip install -r requirements.txt
```

**8GB 显卡用这行启动**（把 `--lowvram` 打开是关键，否则 1024 级出图就可能爆显存）：

```bash
python main.py --listen 127.0.0.1 --port 8189 --lowvram --preview-method none --disable-auto-launch
```

看到 `To see the GUI go to: http://127.0.0.1:8189` 就成了。

> 端口为什么是 8189 而不是默认 8188？因为插件跑后台任务时，8188 常常已经被你自己开的另一份 ComfyUI
> 占着。用 8189 是刻意的隔离。真要改，设 `POSTER_COMFY`。
>
> 启动日志里 `comfyui-workflow-templates is not installed` 这类警告**不影响出图**，可以无视。

---

## 3. 下模型

先装下载器，并**把镜像指好**（国内直连 huggingface.co 基本不通，`hf-mirror.com` 实测可用）：

```powershell
# Windows PowerShell
python -m pip install -U "huggingface_hub[cli]"
$env:HF_ENDPOINT = "https://hf-mirror.com"
```

```bash
# macOS / Linux
export HF_ENDPOINT=https://hf-mirror.com
```

### 3.1 FLUX 3 Klein（推荐，必装）

| 文件 | 放到 |
|---|---|
| `split_files/diffusion_models/flux-2-klein-4b.safetensors` | `models\diffusion_models\` |
| `split_files/text_encoders/qwen_3_4b.safetensors` | `models\text_encoders\` |
| `split_files/vae/flux2-vae.safetensors` | `models\vae\` |

```bash
hf download Comfy-Org/Flux-2-Klein-4B --include "split_files/*" --local-dir D:\hf\flux2klein
# 然后把 split_files 下三个文件分别拷进 ComfyUI 对应的 models 子目录
```

（老版本 huggingface_hub 里命令叫 `huggingface-cli download`，参数一样。）

### 3.2 MOSS-Image（可选，中文提示词理解更好）

| 文件 | 放到 |
|---|---|
| `diffusion_models/moss_image_sft_int8_convrot.safetensors` | `models\diffusion_models\` |
| `text_encoders/qwen3.5_9b_w4a8_gptq.safetensors` | `models\text_encoders\` |
| `vae/flux2-vae.safetensors` | `models\vae\` |
| `loras/moss_image_color_depth_control.safetensors` | `models\loras\` |
| `loras/moss_image_edit_lora_rank_64_bf16.safetensors` | `models\loras\` |

```bash
hf download Comfy-Org/MOSS-Image --include "*" --local-dir D:\hf\moss
```

### 3.3 文件名对不上怎么办

插件默认读这几个名字：

```
flux3-image-klein-int8-convrot.safetensors
qwen3vl_4b_int8_convrot.safetensors
flux2-vae.safetensors
```

`flux2-vae.safetensors` 官方就是这个名字，直接能用。另外两个是**社区 int8 量化版**的命名；
你下的是官方 bf16 文件名（`flux-2-klein-4b.safetensors` / `qwen_3_4b.safetensors`）时，二选一：

**做法 A：改名（最省事）** —— 把文件改成上面那三个名字。注意 int8 与 bf16 不是同一个东西，
8GB 卡上 bf16 更容易爆显存，能下 int8 就下 int8。

**做法 B：用环境变量指过去（不改文件）**

```powershell
$env:POSTER_UNET   = "flux-2-klein-4b.safetensors"
$env:POSTER_CLIP   = "qwen_3_4b.safetensors"
$env:POSTER_VAE    = "flux2-vae.safetensors"
$env:POSTER_COMFY  = "http://127.0.0.1:8189"
```

MOSS 对应的四个变量：`POSTER_MOSS_UNET`、`POSTER_MOSS_CLIP`、`POSTER_MOSS_CTRL_LORA`、
`POSTER_MOSS_EDIT_LORA`。`POSTER_COMFY` 两个引擎共用。

---

## 4. 装插件

```bash
dsh plugin add dsh-8g-poster
```

或者从 npm 装到全局后手动挂：

```bash
npm i -g dsh-8g-poster
```

本地开发（就是本仓库）：

```bash
cd path\to\dsh-8g-poster
npm link
dsh plugin add .            # 或在你 profile 的 package.json 里写 "dsh-8g-poster": "link:path/to/dsh-8g-poster"
```

装完重载 DSH，工具表里应出现 13 个 `poster_*` 工具。

### 只想要 MCP，不用 DSH？

```bash
node server/index.js        # stdio MCP server
```

任意 MCP 客户端里这样配：

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

## 5. 装完验证

由轻到重，四条命令：

```bash
node test/smoke.mjs      # 13 个工具的声明、字体、模板、二维码生成+解码
node test/route.mjs      # 入口是否干净（宿主路由已停用，应为 routes=0）
node test/ver.mjs        # 版本链：保存 → 快照 → list / latest / diff → 印前自检
node test/tools.mjs      # 端到端：抠图 → 占位块 → 合成出 PNG+PDF → 二维码校验
```

四条都 `ALL PASS` 之后，在对话里说一句"出张海报试试"，让它跑 `poster_generate` 出一张 1024 图——
约 45 秒。能出图就说明 ComfyUI、模型名、端口三件事都对上了。

---

## 6. 常见报错

| 现象 | 原因 | 怎么修 |
|---|---|---|
| `ConnectionRefusedError: [WinError 10061]` | ComfyUI 没起，或端口不对 | 先 `curl http://127.0.0.1:8189/system_stats`；不对就改 `POSTER_COMFY` |
| `unknown url type: 127.0.0.1` | 地址少了 `http://` | 传完整 URL：`http://127.0.0.1:8189` |
| `qrcode not installed` / `No module named cv2` | 依赖装在了别的 Python 里 | 用 `POSTER_PYTHON` 指到装好依赖的那个解释器 |
| 出图时 `CUDA out of memory` | 显存不够 | 确认启动参数带 `--lowvram`；把尺寸降到 1024；关掉其他占显存的程序 |
| 模型找不到 / `value not in list` | 文件名与默认名不一致 | 见 3.3，改名或设 `POSTER_UNET` 等变量 |
| 工作台打不开、浏览器报 401 | 直接访问了宿主的 `/api/*` | 工作台是**本地文件**：双击 `assets/editor/poster-editor.html`，不走 HTTP |
| `hf download` 卡住 / 超时 | 没设镜像 | `HF_ENDPOINT=https://hf-mirror.com`，或挂代理 |

---

装好了就去读 **[使用手册](MANUAL.zh.md)**：13 个工具怎么串成一条流水线、工作台每个按钮干什么、
印前该查哪几项。
