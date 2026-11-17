# 使用手册 · Manual

一句话版本：**先问向导，再定作品文件夹，出背景 → 选一版 → 装进工作台排字 → 自检 → 出印刷件。**
13 个工具不是 13 个按钮，是一条流水线上的 13 个工位，你通常只需要说人话。

---

## 一、流水线

```
①poster_guide ─ 问清楚走哪条路
②poster_workspace ─ 定作品文件夹（只做一次）
③poster_generate ─ 出 3 版无字背景（flux / moss）
④选一版  →  ⑤poster_editor ─ 装进工作台，用户双击就开工
                     ↘ poster_cutout / poster_detect_slots / poster_compose（要批量时）
⑥poster_check ─ 印前自检（遮挡 / 出血 / 码尺寸 / 最小字号）
⑦poster_qr verify ─ 有码就逐张扫通
⑧导出 PNG 2048 / 4096 / PDF
```

### 两个入口，一份实现

- **DSH 插件**：`lib/index.js`，把 13 个工具注册进对话。
- **MCP 服务器**：`server/index.js`，`node server/index.js` 起 stdio 服务，给任何 MCP 客户端用。

两边都调 `lib/core.js`，行为完全一致。

---

## 二、工具逐个说

### 1. `poster_guide` —— 先问它
返回完整工作流 + flux / moss 的强项对比。**插件刚装好、或者不确定下一步做什么时，先调它**，
比自己猜快得多。

### 2. `poster_workspace` —— 作品文件夹
所有项目、版本、导出都落在一个文件夹里，AI 读版本、列项目也只看这里。

| action | 作用 |
|---|---|
| `status` | 看有没有设过；没设就该问用户要一个绝对路径 |
| `set` + `dir` | 写入（只做一次，之后别再问） |
| `list` | 列该目录下的项目 JSON |
| `save` + `file` + `name` | 把项目存进去，**同时写一版快照**到 `<文件夹>/.posterwright/versions/` 并更新 `latest.json` |

### 3. `poster_generate` —— 本机出图
| 参数 | 说明 |
|---|---|
| `model` | `flux`（默认，质感/光影强）或 `moss`（读中文提示词更准，支持版面框控） |
| `w` `h` | 1024² 约 45 s，1536² 约 78 s（8GB 卡） |
| `variants` | 一次出几版，建议 3 |
| `refs` | 参考图融合（最多 10 张，仅 flux） |
| `host` | 默认 `http://127.0.0.1:8189`，**必须带 `http://`** |

> ⚠️ 两个必知的坑：
> 1. **提示词里别让它写中文**——模型会把「掼蛋」画成鬼画符。要字的位置留「空白铭牌」，字在工作台排。
> 2. 工具在失败时也可能打印「已出 N 版」，**以 `SAVED` 行为准**。

### 4. `poster_editor` —— 装进工作台
传 `project`（项目 JSON 路径）就把它预装进工作台，用户双击一个文件、打开就是排好的画布；
`list` 会把作品文件夹里最近的项目列进「项目库」，用户自己挑。

工作台是**本地单文件 HTML**，双击用 `file://` 打开即可，**不要**给用户任何 `/api/*` 地址——
宿主只认自己签发的令牌，浏览器标签页直连一律 401。

### 5. `poster_open` —— 直接拉起浏览器
宿主机进程自己打开浏览器，不走 HTTP，因此没有 401 问题。用户说「打开工作台」时用它。

### 6. `poster_fonts` —— 选字体
8 套字体，每套带**适用场景 / 气质 / 字号区间 / 授权**，可按 `scene` 筛（如「标题」「正文」「庄重」）。
随包得意黑是 SIL OFL 1.1 可商用；系统字体只做引用、不分发，**给客户交付前先确认授权**。

### 7. `poster_templates` —— 排版规矩
返回 4 条硬规矩（二维码最小尺寸、逐张解码校验、合规表述边界、字体授权）与两种结构起点
（密排带多码 / 疏排形象）的层级顺序。**只给结构，不给坐标**——要精确坐标用 `poster_compose` 或工作台。

### 8. `poster_cutout` —— 抠图
`input` 白底图 → `output` 透明 PNG。`up=2` 先放大再抠，边缘更干净（代价是慢）。
输出带羽化、按底色去白边、自动裁到内容外框。

### 9. `poster_detect_slots` —— 找占位块
底图里的矩形占位块（二维码位 / 图片位）→ `slots.json`。`color` 取 `gray` / `white` / `#RRGGBB`
决定按什么颜色找。灰度判据是「三通道接近且亮度 150–245」，纯白底图用 `white`。

### 10. `poster_compose` —— 按 job.json 合成
把「放大锐化 → 覆盖重绘 → 贴素材 → 贴码 → 出 PNG / 预览 / 印刷 PDF → 可选解码校验」写成一份配置。
坐标全部用**源图像素**，内部按 `canvas.scale` 统一放大，不用自己换算。示例见
`skill/examples/job.example.json`。

### 11. `poster_check` —— 印前自检
读项目 JSON（默认版本链的 `latest.json`），检查：元素互压、出画布 / 出血、二维码尺寸、最小字号。

- 阈值：二维码 ≥ 画布短边 **11.5%**；字号 ≥ 短边 **1.1%**（A4 300dpi 下约 30px）。
- 它会报「底板 × 压在上面的文字」这类遮挡——**文字底下有实心底板就是设计意图，可以放行**；
  **两个文字块互相压住必须改**。

### 12. `poster_versions` —— 版本链
`list` 看历史、`latest` 取当前（`full=true` 给完整字段）、`diff` 对比两版。
每版都记了「改了哪些元素、改了哪些字段」，所以「我上一版改了什么」有据可查。

### 13. `poster_qr` —— 二维码
| action | 作用 |
|---|---|
| `make` | 按 URL/文本生成（`size` 默认 1200） |
| `verify` + `dir` | **逐张解码**，印刷前必跑 |
| `recolor` | 换前景/背景色，**不改编码** |
| `batch` | 批量出码 |

> 低于画布短边 11.5% 的码在纸面上会扫不出来。`verify` 是唯一能证明"印出来还能扫"的手段。

---

## 三、工作台（`assets/editor/poster-editor.html`）

双击即开，离线可用，**所有改动都在本地**。

### 常用操作

| 想做 | 怎么做 |
|---|---|
| 选中被上层盖住的东西 | **Alt + 单击**画布，穿透到下一层；连点继续往下，到底回顶 |
| 从一堆层里精确选一个 | 右侧**图层面板**点名字（Shift / Ctrl 加减选） |
| 隐藏 / 锁定 | 图层面板里点 👁 / 🔒；双击名字改名 |
| 改字号 | 选中文字后 `A-` / `A+`，或拖边框把手（按 Ctrl 不折行） |
| 组合 | 多选后「组合」，之后当整体拖 |
| 对齐 / 分布 | 工具栏对齐区；拖动时靠近别人的边会出红线吸附 |
| 缩放视图 | `Ctrl + 滚轮`，或工具栏「画布」的 − / 100% / ＋ |
| 导出 | `PNG 2048` / `PNG 4096` / `导出 PDF`（PDF 页尺寸跟随画布 mm） |
| 存档 | 工具栏「存项目」→ 下载 JSON → 拖回对话，AI 用 `poster_versions` 接上 |

### 英文对照（UI 为中文界面）

| 中文 | English |
|---|---|
| 添加 / 文本 / 矩形 / 图片 | Add / Text / Rect / Image |
| 选择 / 层级 / 顶 / 底 | Select / Layer / Top / Bottom |
| 对齐 / 分布 / 排布 | Align / Distribute / Spacing |
| 锁定 / 组合 / 翻转 | Lock / Group / Flip |
| 不透明度 / 饱和 / 亮度 / 对比 | Opacity / Saturation / Brightness / Contrast |
| 字体 / 字号 / 颜色 / 对齐 | Font / Size / Color / Alignment |
| 存项目 / 打开项目 / 还原 | Save project / Open project / Reset |
| 导出 PNG / 导出 PDF | Export PNG / Export PDF |
| 图层面板 | Layers panel |

---

## 四、一条完整流水线（示例）

```
你：用海报匠做一张掼蛋扑克牌海报
AI：poster_guide → poster_workspace(status) → 问你路径
你：N:\海报项目
AI：poster_workspace(set) → 问走 flux 还是 moss
你：flux
AI：poster_generate ×3（1024×1448，无字背景）
AI：发三版给你看
你：选第二版
AI：排字 → poster_cutout 产品图 → 贴进去 → poster_check
AI：poster_editor 装进工作台 → 你双击那个 HTML 继续改
你：改完 → 存项目 → 拖回对话
AI：poster_versions(latest) → 接着改 → 导 2048 / 4096 / PDF
```

---

## 五、印前清单（交给印厂之前逐条打勾）

1. `poster_check` 跑过一次，出画布与字号过小为 0，文字块互相不压。
2. 有二维码：`poster_qr verify` **逐张 PASS**，码边长 ≥ 画布短边 11.5%。
3. 出血：需要 3mm 出血的，画布尺寸要按成品 + 出血算（成品 210×297mm → 216×303mm）。
4. 字体授权：随包得意黑可商用；系统字体（微软雅黑、宋体等）**不要嵌进对外交付的印刷件**。
5. 合规表述：价格、资质、功效、排名这类话，写清适用范围与时间；示例海报底下那行小字就是留的位。
6. 色彩：导出是 RGB PDF。要 CMYK 请印厂转，并让他们回一份打样确认。
7. 分辨率：A4 300dpi 需要 2480×3508；本插件默认就是这个尺寸，别拿 2048 的图去印 A4。

---

## 六、常见问题

**Q：为什么工作台打开是空白？**
A：用 `poster_open`，或 `poster_editor` 传 `project` 生成入口；直接开 `poster-editor.html` 只会得到空画布
（它记不住"上次那个项目"，除非预装）。

**Q：改了字，导出还是旧的？**
A：工作台导出的是当前画布。改完记得「存项目」把 JSON 存下来，之后从这份 JSON 继续。

**Q：AI 出的图里的字是乱的。**
A：正常。见"两个必知的坑"。让它留空白铭牌，字在工作台排。

**Q：能不能批量出 50 张一样的版式、只换标题和二维码？**
A：能。`poster_compose` 的 job.json 就是干这个的：`patches` 改字、`slots` 贴码、`labels` 批注，
配脚本循环喂不同的 JSON 即可。
