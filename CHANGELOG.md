# Changelog

## 0.1.0

首个可用版本。一条链解决「中文商业海报从出图到印刷件」：

- **可编辑工作台**（单文件 HTML，离线可开）：拖拽 / 缩放 / 旋转 / 裁剪 / 组合 / 锁定 / 水平垂直翻转 /
  对齐分布 / 图层跳转 / 间距排布 / 画布居中 / 透明度与画面调整 / 字体库 / 导 PNG 2048·4096·PDF。
  元素浮动工具条：改字、字号增减、组合、锁定、翻转、发回 AI、删除。
- **图标**：18 个工具栏图标由本地 FLUX 生成后二值化清洗为黑线透明底。
- **字体库**：随包得意黑 + 系统 7 套，每套带场景 / 气质 / 字号区间 / 授权标签，可按场景筛选。
- **二维码**：生成、美化换色、批量、**逐张解码校验**（印刷前必跑，低于 0.115×画布边长会扫不出来）。
- **素材工具**：GrabCut 抠图、占位块识别、按 job.json 合成（贴素材 / 改字 / 贴码 / 放大 / 印前自检）。
- **本地生图**：接本机 ComfyUI（FLUX 3 Klein），文生图与多图融合。
- 双入口：DSH 插件（`lib/index.js`，cordis 工具注册）与 MCP stdio 服务器（`server/index.js`），
  共用 `lib/core.js` 一份实现。

### 修掉的问题

- stdio 一次收到多行、末尾无换行时只处理前两行就静默退出 → 串行队列 + `end` 逐行兜底。
- Windows 中文路径 `cv2.imread` 返回 None → 改用 `np.fromfile` + `cv2.imdecode`。
- `poster_generate` / `poster_cutout` / `poster_detect_slots` / `poster_compose` 缺参数时不报错、
  会用 `undefined` 真跑一次（浪费一次出图）→ 全部前置校验。
- 插件管理器要求 `dsh.bundle.patch` 才认作 bundle，只有 `dsh.mcpServers` 会报 `not-bundle` → 补 cordis 入口。
