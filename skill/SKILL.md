---
name: poster-assembly
description: 海报/展板/长图的本地合成与印前自检。当需要把设计底图做成可印刷成品时使用——包括主体抠图（GrabCut 透明 PNG）、识别图中的矩形占位块（二维码位/图片位/图标位）、覆盖重绘模板错误文字、按配置贴入素材、放大锐化、输出 2000×1000mm 级印刷 PNG 与 PDF。二维码是完整的一等能力模块（可选使用）：按 URL 生成美化码、把官方品牌码换色美化（不改编码）、批量出码并生成可转发总览图、逐码解码校验、自动贴入占位块。没有二维码任务时，其余能力照常可用。适用于「创客贴/AI 出底图 + 本地精修出印刷件」的工作流，也适用于任意「底图 + 素材 → 成品」的合成任务。
agent_created: true
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, ViewImage
---

# 海报合成与印前自检（poster-assembly）

把「设计底图」变成「可交付的印刷件」，并把容易出错的环节变成可验证的步骤。
核心原则：**每一步都留一个能自动校验的结果**，不靠肉眼猜。

## 何时使用

- 甲方给了设计稿/创客贴底图，需要出 2m×1m 这类大幅面印刷件
- 底图里的二维码位、图片位是灰色占位块，需要替换成真实素材
- AI 生成的图上有个别错字，需要覆盖重绘（不想整张重生成）
- 需要从封面/插画里抠出主体做透明素材
- 需要生成美化二维码并证明「扫得出来、链接没串」

## 工作流

### 步骤 0：环境自查
```bash
python -c "import PIL, numpy, cv2, reportlab; print('ok')"
# 需要二维码时才装：pip install qrcode zxing-cpp
```
缺库时按 `requirements.txt` 安装，不要跳过。

### 步骤 1：量图
```bash
python scripts/detect_slots.py --image base.png --color gray --out slots.json
```
输出每个占位块的 `box=[x,y,w,h]`，并在 stderr 打印尺寸/间距摘要。
**先看摘要再动手**：块间距过小时直接贴码会互相压住静区，必须在步骤 3 限制码尺寸。

颜色判据：`gray`（浅灰占位块）、`white`（白色卡片）、或任意 `#RRGGBB` 近似色。

### 步骤 2：抠图（可选）
```bash
python scripts/cutout.py --input raw.png --output out.png --up 3 --edge-band 0.04
```
GrabCut 两遍 + 形态学 + 最大连通域 + 羽化，输出透明 PNG 与三色预览。
若原图带细线、色块边框，把 `--edge-band` 调到 0.05–0.07 强制切掉边缘。

> 经验：如果主体只是要「当背景纹样」，不要抠图——直接对整块区域做高斯模糊＋向底色混合＋大羽化蒙版（见 `references/pitfalls.md`），效果更稳。

### 步骤 3：合成
写一个 job JSON（照抄 `examples/job.example.json` 改），然后：
```bash
python scripts/compose.py --job job.json
```
支持的四类操作：
1. `canvas`：放大倍数、锐化、页面物理尺寸（mm）
2. `patches`：矩形填色 + 重写文字（修错字/遮旧标签），文字可多段、可指定字体字号锚点
3. `slots`：自动占位块 → 按顺序贴入 `img_dir` 里的素材（二维码、图标、图片），可设 `scale` 上限与 `gap_factor` 防止互相压占
4. `pastes`：显式坐标贴图（`box` + `fit: contain|cover`），用于精确控制

输出：`<name>_原尺寸.png`、`<name>_预览.png`、`<name>_印刷版.pdf`（页面尺寸精确等于 canvas 的 mm 值）。

### 步骤 4：二维码模块（能力齐备，按需选用）

四种场景，全都能自动校验：

```bash
# 场景 A：按 URL 生成美化码（纠错 H + 圆点模块 + 圆角定位角 + 中心社标）
python scripts/make_qr.py --data "https://..." --output qr/a.png \
    --fg "#1B3A6B" --logo logo.png --verify

# 场景 B：官方品牌码换色美化（如 ima 绿码 → 海报深蓝），编码零改动
#   自动剔除原图的标题/订阅数/平台 logo 等杂讯，只保留码区，补足静区
python scripts/recolor_qr.py --input 官方码.png --output qr/b.png \
    --fg "#1B3A6B" --expect "https://期望内容（可选）"

# 场景 C：批量出码 + 可转发总览图（生成与美化可混排，照抄 examples/qr.example.json）
python scripts/qr_batch.py --list qr.json --outdir qr/

# 场景 D：校验已有码/成品图内的码（单图、坐标批量、目录三种模式）
python scripts/verify_qr.py --job job.json --strict
```

要点：
- **美化不改编码**是硬原则——颜色替换按「墨色浓度」做混合，矩阵一个像素不动，
  所以美化前后扫出的内容逐字一致；`--expect` 用来证明这一点。
- 生成码一律 **纠错等级 H**（30% 冗余），中心压社标才安全；静区 ≥4 模块。
- 批量条目里 `url` 走生成、`source` 走美化，同一张总览图里可混排。

### 步骤 5：印前自检
按 `references/print-checklist.md` 逐条过，至少确认：
- [ ] 页面 mm 尺寸精确（PDF 用 `pdfinfo` 或 reportlab 属性复核）
- [ ] 最小字号 ≥ 12mm 实物（2m 展板、3m 视距）
- [ ] 二维码实物边长 ≥ 80mm，静区 4 模块完整
- [ ] 无元素越界、无文字被裁、无贴图压字
- [ ] 有二维码则逐码 PASS
- [ ] 交付说明写明出血、色值、材质、字体授权

## 关键参数与坑

详细清单在 `references/pitfalls.md`，最容易踩的三条：

1. **码不能一律放大 1.28 倍**：块间距 100px 时，1.28 倍会把邻码静区吃掉。
   `slots.gap_factor` 默认 0.86 已做限制；标签紧贴块下缘时再降到 `scale=1.02`。
2. **校验要跟生成源头比对**：手抄 URL 常漏参数（`crId` 之类），造成假 FAIL。把期望值写进 job 的 `expect`，别现场手打。
3. **底图分辨率先量再放大**：AI 底图多为 2160×1088，2m 宽只有 27dpi。必须 `scale: 4` 放大 + 锐化，并只对素材（二维码）用原生分辨率贴入。

## 交付
用 `present_files` 交付：预览图、原尺寸 PNG、印刷 PDF、印前说明。
若某一步失败（解码 FAIL、尺寸不符），如实说明卡在哪，不要用「大致可以」掩盖。
