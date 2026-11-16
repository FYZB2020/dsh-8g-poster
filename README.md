# PosterForge · 海报锻造坊

> 本地生图 → 素材合成 → 二维码防错校验 → 可编辑工作台 → 印刷件。
> 一套给中文商业海报（尤其教育/出版物料）用的工具链，装进 DSH 当插件用。

![icon](assets/icons/export.png)

> 仓库里自带的工作台是**演示项目**：文案、数字、二维码全是占位内容（码指向 example.com），
> 直接打开就能改、能导图。换成自己的素材后再出正式件。

## 它解决什么

做一张能贴出去的中文海报，通常要跨五个工具：出图、抠图、排版、贴码、导印刷件。
中间最容易出事的是**二维码**——图上看着好好的，印出来扫不出来。

PosterForge 把这条链收成一个插件，并且把「印前必过的检查」做成了硬约束：

| 环节 | 工具 | 关键约束 |
|---|---|---|
| 出图 | 本地 ComfyUI（FLUX 3 Klein）| 1024² 约 40–60s，16 步 / CFG 1.0 / euler / simple / shift=ln(16) |
| 抠图 | GrabCut | 白底素材 → 透明 PNG，边缘去白 |
| 合成 | `poster_compose` | 按 job.json 贴素材 / 改字 / 贴码 / 放大 / 印前自检 |
| 扫码 | `poster_qr` | **逐张解码校验**，边长 ≥ 0.115 × 画布 |
| 改版 | 可编辑工作台 | 单文件 HTML，图层/文字/二维码都能拖，撤销/组合/锁定/翻转 |
| 出件 | 工作台 | PNG 2048 / PNG 4096 / PDF（手写生成器，不依赖外部库）|

## 安装

### 方式 A：当 DSH 插件装（推荐，工具直接进对话的工具表）

```bash
# 在 DSH 里用插件管理器装本地目录，或：
cd <你的 profile 目录>            # 例：~/.dsh/profiles/desktop
pnpm add "file:<绝对路径>/poster-forge"
```

再把它加进 `package.json` 的 `dsh.profile.bundles`，**重启 DSH** 生效。
入口是 `lib/index.js`（cordis 插件，`inject: ['tools']`），`cordis.patch.yml` 负责插入。

### 方式 B：当 MCP 服务器装（任何 MCP 客户端都能用）

```json
{
  "mcpServers": {
    "poster-forge": {
      "command": "node",
      "args": ["<绝对路径>/poster-forge/server/index.js"],
      "env": { "POSTER_PYTHON": "<你的 python 绝对路径>" }
    }
  }
}
```

两种方式共用 `lib/core.js` 的同一份实现，行为一致。

`POSTER_PYTHON` 指向装了 `Pillow / numpy / qrcode / opencv-python / zxing-cpp` 的解释器（见 `skill/requirements.txt`）。
没设则依次回退到 `PYTHON`、`python`。

## 工具

| 工具 | 作用 |
|---|---|
| `poster_editor` | 取回可编辑工作台（单文件 HTML，离线可用） |
| `poster_fonts` | 字体库 + 每个字体的用途标签（场景 / 气质 / 字号），可按场景过滤 |
| `poster_templates` | 排版约束 + 两个结构起点（密排多码 / 疏排形象） |
| `poster_qr` | `make` / `verify` / `recolor` / `batch` |
| `poster_cutout` | GrabCut 抠图 |
| `poster_detect_slots` | 识别底图里的二维码位 / 图片位 |
| `poster_compose` | 按 job.json 出印刷成品 |
| `poster_generate` | 本地 ComfyUI 出图（文生图 / 参考图融合） |

## 字体库

随包 1 套 + 系统 7 套，每套都带 AI 打的标签（`assets/fonts/fonts.json`）：

- **得意黑 Smiley Sans**（SIL OFL）—— 海报主标题、活泼、40–160px
- **华文中宋**（系统）—— 教辅封面、庄重、36–120px
- **思源宋体 / 思源黑体**（SIL OFL）—— 正文到标题通吃
- **微软雅黑 / 雅黑 Bold / 黑体 / 宋体**（系统）—— 通用、强调、强对比、印刷感正文

标注 `bundled:false` 的是系统字体，商用授权请自行确认。想加字体：把 ttf 丢进 `assets/fonts/`，补一条 `fonts.json` 记录即可。

## 三条硬规矩（写在 `templates.json` 里）

1. 二维码最终像素 **≥ 0.115 × 画布边长**；这批点点码 + 中心 logo 在 235px 会解不出，242px 才稳。
2. 扫码区**必须逐张解码校验**，不能只看图。
3. 审核口径只覆盖「样书」；资源库与 知识库不在审核范围，顶部与页脚都要写。

## 目录

```
poster-forge/
├─ server/index.js           # MCP 服务（stdio，零依赖）
├─ assets/
│  ├─ editor/poster-editor.html   # 可编辑工作台（单文件）
│  ├─ icons/*.png            # 18 个界面图标（FLUX 生成 + 阈值清理）
│  ├─ fonts/                 # 字体 + fonts.json + previews/
│  └─ templates/templates.json
├─ python/                   # comfy_client.py / flux_i2i.py
└─ skill/                    # 合成 / 抠图 / 二维码 脚本 + SKILL.md
```

## 许可

代码 MIT。字体见各自的 LICENSE（OFL / 系统字体）。图标由本地 FLUX 生成，随包 MIT。

## 工作流（五步）

插件打开（工作台首开）会先弹一屏说明，之后每一步都可以问「下一步做什么」（工具 `poster_guide` 返回完整流程）。

1. **选模型** —— 先问用户这次用哪个：`flux` 还是 `moss`。
2. **出几版** —— `poster_generate` 一次出 3 版（`variants=3`），提示词明确「不要文字、不要 logo」。
3. **挑一版** —— 用户没选定之前不要往下走。
4. **装进工作台** —— 用选中的那张当底图打开工作台，拖拽排版、改字贴码。
5. **校验交付** —— `poster_qr action=verify` 逐张解码，导 2048 / 4096 / PDF。

## 两个出图模型的分工

| | flux（FLUX 3 Klein int8） | moss（MOSS-Image SFT int8） |
|---|---|---|
| 采样 | 16 步 / CFG 1.0 | 20 步 / CFG 2.5 |
| 1024² 实测 | 40–60 秒 | **103.9 秒**（20 步） |
| 文本编码器 | Qwen3-VL-4B(4.9GB) | **Qwen3.5-9B(6.8GB)**，中文理解更好 |
| 画面质感 / 光影 | 强 | 中 |
| 参考图融合 | 支持（2–10 张） | 不支持（走 flux） |
| 版面框控 | 无 | **有**：`MOSSImageLayoutPrompt`（框内可渲染文字） |
| 结构控制 | 无 | **有**：`MOSSImageControl` 色块 + 深度 LoRA |
| 局部编辑 | 无 | **有**：`TextEncodeMOSSImageEdit` edit LoRA |

一句话：要「画面好看」用 flux，要「版面按我说的来」用 moss。

## 宿主内路由（一键交回）

插件在 DSH 宿主里注册两条 exact Fetch route（`ctx.get('connection').fetch.register`）：

- `GET /api/poster-forge/editor[?bg=<绝对路径>]` —— 同源打开工作台，`bg` 可把任意图当底图注入
- `POST /api/poster-forge/apply` —— 工作台里点「✦ 发回 AI」时提交选中元素，落到 `<cwd>/.posterforge/latest.json`

因为是同源页面，浏览器自身的鉴权即可通过（外部页面调这些路由会 401）。


## 版本链：保存就是一次「发回」

不只是导出 JSON。在工作台点 **存项目** 时，如果工作台是从宿主里打开的（`/api/poster-forge/editor`），它会同时：

1. 存本地副本（浏览器 localStorage，防丢）；
2. `POST /api/poster-forge/apply {kind:'save'}`；
3. 宿主把它写成 `.posterforge/versions/vNNNN-<时间>.json` 并覆盖 `latest.json`；
4. 自动算 **这一版相对上一版改了什么**：哪些元素改了哪些字段、新增几个、删掉几个。

所以可以连着存 20 版，然后说一句「从最新版开始改」，AI 调 `poster_versions action=latest` 就知道当前是什么样；
`action=list` 看完整版本史，`action=diff from=3 to=7` 看两版之间到底动了什么。

## MOSS 的三个强项（工具参数）

`poster_generate model=moss` 支持三种控制方式：

| 参数 | 作用 | 实测 |
|---|---|---|
| `layout`（JSON 文件） | 版面框控：给若干带 bbox 的元素，模型在框里生成内容；type=text 的元素会把文字直接渲染进图 | 通过，中文标题一次成 |
| `colorMap` / `depthMap` | 色块 / 深度控制：按分区色块图与深度图构图 | 通过，分区遵循但会自发加字 |
| `editRef` | 局部编辑（edit LoRA） | 实验：当前 500，待修 |

框控元素格式（坐标 0-1000，y 在前）：

```json
{"elements": [
  {"type": "text", "text": "数字教学资源", "bbox": [60, 50, 190, 520]},
  {"type": "object", "desc": "golden lion head", "bbox": [40, 540, 520, 980], "color_palette": ["#f0c040"]}
]}
```

注意：框里除 text 之外的小字仍是模型自编（假字），二维码也是画的假码 —— 文字与二维码以工作台后期压的为准。
