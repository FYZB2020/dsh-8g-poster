# PosterForge · 海报锻造坊

> 本地生图 → 素材合成 → 二维码防错校验 → 可编辑工作台 → 印刷件。
> 一套给中文商业海报（尤其教育/出版物料）用的工具链，装进 DSH 当插件用。

![icon](assets/icons/export.png)

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

```bash
# 1) 放进 DSH 的 profile
cp -r poster-forge  ~/.dsh/profiles/<your-profile>/node_modules/

# 2) 在 profile 的 settings 里注册 MCP
```

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

`POSTER_PYTHON` 指向装了 `Pillow / numpy / qrcode / opencv-python` 的解释器（见 `skill/requirements.txt`）。

## 工具

| 工具 | 作用 |
|---|---|
| `poster_editor` | 取回可编辑工作台（单文件 HTML，离线可用） |
| `poster_fonts` | 字体库 + 每个字体的用途标签（场景 / 气质 / 字号），可按场景过滤 |
| `poster_templates` | 4 套版式（封面风 / 深蓝书堆 / 暖金醒狮 / 极简几何）+ 硬约束 |
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
3. 评议口径只覆盖「电子样书」；资源库与 ima 知识库不在评议范围，顶部与页脚都要写。

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
