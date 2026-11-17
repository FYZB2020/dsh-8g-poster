# Changelog

## 1.0.0

首个公开发布版。项目从 `poster-forge` / PosterForge 改名为 **posterwright** / **Posterwright · 海报匠**。

### 新增

- **图层面板**（工作台最右侧，可折叠）：按层序倒序列出全部元素，点名字即选中（Shift/Ctrl 加减选），
  点眼睛隐藏、点锁锁定，双击改名。上层完全盖住下层时，从列表里直接点，不用先挪走上层。
- **Alt+单击穿透选中**：画布上按住 Alt 点一下，选中光标下面被盖住的那一层；再 Alt 点继续往下，
  到底回顶，选中时有 toast 提示「第 N / M 层」。锁定的图层也按同一规则穿透。
- **版本链真正可用**：`poster_workspace action=save` 除了把项目存进作品文件夹，还会写一版快照到
  `<作品文件夹>/.posterwright/versions/`，并更新 `latest.json`；`poster_versions` 的
  `list / latest / diff` 读的就是这条链（以前写版本的路由被删了，链一直是空的）。
- **模型文件名可用环境变量覆盖**：`POSTER_COMFY`、`POSTER_UNET`、`POSTER_CLIP`、`POSTER_VAE`、
  `POSTER_MOSS_UNET`、`POSTER_MOSS_CLIP`、`POSTER_MOSS_CTRL_LORA`、`POSTER_MOSS_EDIT_LORA`。
  官方 HF 文件名与本插件默认的社区 int8 名字不一致时，不用改代码。
- **`test/tools.mjs`**：抠图 / 占位块 / 合成出 PNG+PDF / 二维码生成·校验·换色 的端到端测试。

### 改进

- 删掉已停用的宿主 `/api/poster-forge/*` 死代码（路由 0.5.4 起就没注册，留着只诱导用户开死链）。
- `poster_check` 默认读版本链里的 `latest.json`，跟着作品文件夹走，不再依赖当前工作目录。
- 工作台配置目录 `~/.posterforge` → `~/.posterwright`，同时保留旧目录读取，老用户无感迁移。
- 三个 python 客户端的 ComfyUI 地址/模型名改为环境变量优先。

### 修掉的问题

- `poster_versions` 永远是空链（写版本数据的 HTTP 路由早已删除）。
- `test/ver.mjs` 测的是已删除的 `/api/poster-forge/apply`，`npm test` 一直是崩的。

## 0.1.1

- 图层面板、Alt+单击穿透选中、锁定层可穿透。

## 0.1.0

首个可用版本：一条链解决「中文商业海报从出图到印刷件」。

- **可编辑工作台**（单文件 HTML，离线可开）：拖拽 / 缩放 / 旋转 / 裁剪 / 组合 / 锁定 / 水平垂直翻转 /
  对齐分布 / 图层跳转 / 间距排布 / 画布居中 / 透明度与画面调整 / 字体库 / 导 PNG 2048·4096·PDF。
- **字体库**：随包得意黑 + 系统 7 套，每套带场景 / 气质 / 字号区间 / 授权标签。
- **二维码**：生成、换色、批量、**逐张解码校验**（低于 0.115×画布边长会扫不出来）。
- **素材工具**：GrabCut 抠图、占位块识别、按 job.json 合成（贴素材 / 改字 / 贴码 / 放大 / 印前自检）。
- **本地生图**：接本机 ComfyUI（FLUX / MOSS-Image），文生图与多图融合。
- 双入口：DSH 插件（`lib/index.js`）与 MCP stdio 服务器（`server/index.js`），共用 `lib/core.js`。

### 修掉的问题

- stdio 一次收到多行、末尾无换行时只处理前两行就静默退出 → 串行队列 + `end` 逐行兜底。
- Windows 中文路径 `cv2.imread` 返回 None → 改用 `np.fromfile` + `cv2.imdecode`。
