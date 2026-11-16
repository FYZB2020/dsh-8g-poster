// PosterForge · 工具实现（DSH 插件与 MCP 服务器共用同一份）
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(HERE, '..')
const ASSETS = path.join(ROOT, 'assets')
const SCRIPTS = path.join(ROOT, 'skill', 'scripts')

export const PY = process.env.POSTER_PYTHON || process.env.PYTHON || 'python'

function run(args, opts = {}) {
  return new Promise((resolve) => {
    execFile(PY, args, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      resolve({
        out: (stdout || '').trim(),
        err: (stderr || '').trim(),
        code: err ? (typeof err.code === 'number' ? err.code : 1) : 0,
      })
    })
  })
}

const py = (script, argv) => run([path.join(SCRIPTS, script), ...argv])

const txt = (s) => ({ text: String(s) })

function loadFonts() {
  const f = path.join(ASSETS, 'fonts', 'fonts.json')
  if (!fs.existsSync(f)) return []
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'))
    return Array.isArray(j) ? j : (j.fonts || [])
  } catch (e) {
    return []
  }
}

const OBJ = { type: 'object', properties: {}, required: [], additionalProperties: true }

export const GUIDE = `PosterForge · 使用向导

【整体流程（六步，每步都有明确的"下一步"）】
0. 先选路线（这一步决定后面所有事，必须问用户）
   · A 背景路线（flux）——只出无字背景，文字/元素/码都在工作台里做。可以反复改，改字改色不重出图。
   · B 一次成型路线（moss）——用版面框把标题、主体元素、码位一次画进图里，**成品直接交付、不进工作台**。
     代价必须提前跟用户说清：出的是一张位图，**之后任何改动都只能重新出图**，不能在图上改字。
1. 定模型 —— A 路线用 flux，B 路线用 moss；把强项对比给用户，别替他决定。
2. 出几版 —— poster_generate 一次出 3 版（variants=3）。
   A 路线：提示词写清"不要文字、不要 logo、不要二维码"，只要画面。
   B 路线：附 layout 文件，把标题（type=text + text 字段）、主体元素、码位框一次写全；码位只留空白框，真码后面贴。
3. 排文字 / 放元素 / 贴码（**只有 A 路线有这一步**，顺序不能反）
   a. 先把文字排版落到版面上（标题/副标/三格数据/入口说明），字号层级先定死；
   b. 再放元素：有素材（吉祥物、logo、产品图）就无损贴入，需要融合再用 flux 的 refs 重新出底图；
   c. 最后贴二维码：必须是真码、无损嵌入，不许让模型"画"码；
   d. 用 poster_check 查遮挡与出血，确认元素之间不互相压住、文字不被图压。
4. 挑一版 —— 把排好的版本摆给用户让他选；**用户没选之前不要往下走**。
5. 可选 · 评审 —— 装了评委（创意台 jury）的话，可发一张给评委要建议；用户不想配就跳过，跳过照常往下走。
6. 交付 —— A 路线：把选中的底图装进工作台继续改；B 路线：直接拿去用（不进工作台）。
   印前跑 poster_qr verify 逐张解码；导出 PNG 2048 / 4096 / PDF（**尺寸不锁 A3**，A4/A2/自定义都行）。

【B 路线要改的时候（重要）】
· 任何改动 = 重新出图。不要承诺"在原图上改"。
· 小改（换一处标题、换一个元素）：沿用**同一份 layout + 同一个 seed**，提示词只写那一处改动，其余框位一字不动，
  keepOthers=true（默认）；这样其余元素的位置、配色、文字能最大程度保持。
· 大改（版式变了）：重写 layout，重新出 3 版再选。

【两个模型的强项（都跑在同一台 ComfyUI 上）】
· flux（FLUX 3 Klein int8）—— 16 步 / CFG 1.0 / 1024² 约 40–60 秒
  强：画面质感、光影层次、材质细节；支持 2–10 张参考图融合（refs）。
  弱：中文长提示词理解一般；不支持版面框控；图上文字不可控。
  适合：出"氛围背景 / 场景大图 / 参考图融合定调"。

· moss（MOSS-Image SFT int8）—— 20 步 / CFG 2.5 / 1024² 约 100 秒（**一次成型，不进工作台**）
  强：Qwen3.5-9B 文本编码器，中文理解更好；版面框控（框内能直接渲染文字）；色块+深度控制。
  弱：慢一倍；9B 编码器吃显存；参考图融合不支持；局部编辑在本机 8GB 卡上跑不动（>25 分钟无结果，默认关闭）。
  适合：构图要求死、要"图里就该有那几块东西"。

【重要：生成图进工作台后能改什么】
生成结果是一张位图。进工作台后它只是**一个图层**：
· 能改：整体位置/缩放/旋转/翻转/透明度、裁剪、以及压在它上面的所有新元素（文字、色块、二维码）。
· 不能改：图里"看起来像字"的东西是像素，不能当文字编辑——要改只能盖住重压。
所以：文字与二维码永远在工作台里做，不要指望在生成图里改字。

【一句话选择建议】
先问用户：这次重在"画面好看"，还是"版面必须按我说的来"？前者 flux，后者 moss。

【硬规矩（任何时候都别破）】
· 二维码最终像素 ≥ 0.115 × 画布短边，且逐张 verify。
· 合规/资质表述写清适用边界，别让一行通栏背书被读成全页通过。
· 字体只用作可商用授权的；系统字体需用户自己确认授权。
`

export const TOOLS = [
  {
    name: 'poster_editor',
    description: '取回 PosterForge 的可编辑海报工作台（单文件 HTML，离线可用，双击即开）：拖拽/缩放/旋转/裁剪/组合/锁定/翻转/对齐分布/图层/字体库/导 PNG 2048·4096·PDF。改完点「复制给 DSH」把 JSON 粘回对话即可继续改。做海报、改版、导出印刷件时先调它。',
    parameters: OBJ,
  },
  {
    name: 'poster_fonts',
    description: '字体库：每套字体带用途标签（适用场景 / 气质 / 字号区间 / 授权）。可按场景筛选（如「标题」「正文」「庄重」）。首次排版选字体前先查这个。',
    parameters: {
      type: 'object',
      properties: { scene: { type: 'string', description: '场景关键词，如 标题 / 正文 / 庄重 / 活泼' } },
      required: [],
      additionalProperties: true,
    },
  },
  {
    name: 'poster_templates',
    description: '排版约束 + 两个结构起点（密排带多码 / 疏排形象）。返回：必须守的 4 条硬规矩（二维码最小尺寸、逐张解码校验、合规表述边界、字体授权），以及两种常见结构的层级顺序与适用场景。只给结构和规则，不提供坐标——要精确坐标请用 poster_compose 或工作台。',
    parameters: OBJ,
  },
  {
    name: 'poster_qr',
    description: '二维码工具：make 生成 / verify 逐张解码校验 / recolor 换色 / batch 批量。印刷前必须对成品图跑 verify——低于 0.115×画布边长会扫不出来。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['make', 'verify', 'recolor', 'batch'] },
        data: { type: 'string', description: 'make 的内容（URL 或文本）' },
        output: { type: 'string', description: '输出路径' },
        size: { type: 'number', description: '边长像素，默认 1200' },
        dir: { type: 'string', description: 'verify / batch 的目录' },
        fg: { type: 'string', description: 'recolor 前景色 #RRGGBB' },
        bg: { type: 'string', description: 'recolor 背景色 #RRGGBB' },
        input: { type: 'string', description: 'recolor 的原图' },
      },
      required: ['action'],
      additionalProperties: true,
    },
  },
  {
    name: 'poster_cutout',
    description: 'GrabCut 抠图：白底素材 → 透明 PNG，可选放大后再抠让边缘更干净。',
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string' },
        output: { type: 'string' },
        up: { type: 'number', description: '放大倍数，默认 1' },
      },
      required: ['input'],
      additionalProperties: true,
    },
  },
  {
    name: 'poster_detect_slots',
    description: '在底图里识别矩形占位块（二维码位 / 图片位），输出 slots.json 供合成使用。',
    parameters: {
      type: 'object',
      properties: {
        image: { type: 'string' },
        out: { type: 'string' },
        color: { type: 'string', description: 'gray | white | #RRGGBB' },
        maxSize: { type: 'number' },
      },
      required: ['image'],
      additionalProperties: true,
    },
  },
  {
    name: 'poster_compose',
    description: '按 job.json 合成印刷成品：贴素材 / 改文字 / 贴二维码 / 放大锐化 / 印前自检，输出 PNG 与 PDF。',
    parameters: {
      type: 'object',
      properties: { job: { type: 'string', description: 'job.json 路径' } },
      required: ['job'],
      additionalProperties: true,
    },
  },
  {
    name: 'poster_generate',
    description:
      '本机 ComfyUI 出图。model=flux（FLUX 3 Klein，16 步 / CFG 1.0 / 约 40–60 秒 1024²）或 model=moss（MOSS-Image，20 步 / CFG 2.5 / 约 100 秒 1024²）。' +
      'flux 强在画面质感、光影、多图融合；moss 强在中文提示词理解、支持版面框控（一次成型的整版设计）。' +
      'variants>1 时一次出多版供挑选。传 refs 则做参考图融合（仅 flux）。需本地 ComfyUI 在跑（默认 127.0.0.1:8189）。',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        out: { type: 'string', description: '输出路径；variants>1 时自动加 -1/-2 后缀' },
        model: { type: 'string', enum: ['flux', 'moss'], description: '默认 flux' },
        variants: { type: 'number', description: '出几版，默认 1，建议 3' },
        w: { type: 'number' },
        h: { type: 'number' },
        seed: { type: 'number' },
        steps: { type: 'number' },
        cfg: { type: 'number' },
        refs: { type: 'array', items: { type: 'string' }, description: '参考图（最多 10 张，融合用，仅 flux）' },
        keepOthers: { type: 'boolean', description: 'moss 重新出图时，是否要求「只改指定处、其余元素保持不变」，默认 true' },
        host: { type: 'string', description: 'ComfyUI 地址，默认 127.0.0.1:8189' },
      },
      required: ['prompt', 'out'],
      additionalProperties: true,
    },
  },
  {
    name: 'poster_check',
    description:
      '版面自检：读工作台存下的项目 JSON（默认取 .posterforge/latest.json），检查元素互相遮挡、超出画布/出血、二维码尺寸是否够、字号是否过小。' +
      '排完版、交给用户之前必须跑一次。',
    parameters: {
      type: 'object',
      properties: {
        file: { type: 'string', description: '项目 json 路径，省略则用 .posterforge/latest.json' },
        minQR: { type: 'number', description: '二维码最小边长占比，默认 0.115' },
        minFont: { type: 'number', description: '最小字号占比，默认 0.011（按画布短边）' },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'poster_guide',
    description:
      '使用向导：返回 PosterForge 的完整工作流（选模型 → 出几版 → 挑一版 → 装进工作台微调 → 导出/校验）与两种出图模型的强项对比。' +
      '插件打开时先调一次，任何一步不确定下一步做什么时也调它。',
    parameters: OBJ,
  },
  {
    name: 'poster_versions',
    description:
      '工作台版本链。每次在工作台点「保存并发回」都会存一版，并记下「这一版相对上一版改了哪些元素、改了哪些字段」。' +
      '用户说「从最新版开始改」时先调 action=latest 拿到当前状态；说「看看我改了什么」调 action=list；需要对比两版调 action=diff。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'latest', 'diff'], description: '默认 latest' },
        from: { type: 'number', description: 'diff 用：源版本号' },
        to: { type: 'number', description: 'diff 用：目标版本号' },
        full: { type: 'boolean', description: 'latest 时是否附完整元素数组（默认只给摘要）' },
      },
      additionalProperties: true,
    },
  },
]

export async function callTool(name, args = {}) {
  try {
    return await dispatch(name, args || {})
  } catch (e) {
    return txt('工具执行失败：' + ((e && e.message) || e))
  }
}

async function dispatch(name, args) {
  switch (name) {
    case 'poster_editor': {
      const f = path.join(ASSETS, 'editor', 'poster-editor.html')
      if (!fs.existsSync(f)) return txt('编辑器文件缺失：' + f)
      return txt('可编辑工作台：\n' + f + '\n\n浏览器直接打开即可（单文件、离线可用）。改完点「复制给 DSH」把 JSON 粘回对话，我按 id 合并。')
    }
    case 'poster_fonts': {
      const fonts = loadFonts()
      if (!fonts.length) return txt('字体库为空：' + path.join(ASSETS, 'fonts', 'fonts.json'))
      const scene = String(args.scene || '').trim()
      const list = scene
        ? fonts.filter((f) => (f.scenes || []).some((s) => s.includes(scene)) ||
          (f.mood || []).some((s) => s.includes(scene)) || (f.name || '').includes(scene))
        : fonts
      const body = list.map((f) =>
        `· ${f.name}（${f.license}）\n   文件：${f.file}\n   适合：${(f.scenes || []).join(' / ')}\n   气质：${(f.mood || []).join(' / ')}\n   字号：${f.sizeRange || '—'}\n   备注：${f.note || '—'}`
      ).join('\n')
      return txt(`共 ${fonts.length} 套，命中 ${list.length} 套：\n\n${body}`)
    }
    case 'poster_templates': {
      const f = path.join(ASSETS, 'templates', 'templates.json')
      if (!fs.existsSync(f)) return txt('无 templates.json')
      const j = JSON.parse(fs.readFileSync(f, 'utf8'))
      const rules = (j.rules || []).map(r => `- [${r.id}] ${r.must}\n  （为什么：${r.why}）`).join('\n')
      const ex = (j.examples || []).map(e =>
        `· ${e.id}（${e.ratio}）— 什么时候用：${e.useWhen}\n` +
        e.structure.map((s, i) => `    ${i + 1}. ${s}`).join('\n') +
        (e.note ? `\n    要点：${e.note}` : '')
      ).join('\n\n')
      return txt(
        `这是排版约束 + 起点，不是版式库：规则必须守，结构照思路走，坐标不要从这里推。\n\n` +
        `【必须守的规则】\n${rules}\n\n` +
        `【两个起点】\n${ex}\n\n` +
        `${j.whenYouNeedPrecision || ''}`
      )
    }
    case 'poster_qr': {
      const map = { make: 'make_qr.py', verify: 'verify_qr.py', recolor: 'recolor_qr.py', batch: 'qr_batch.py' }
      const script = map[args.action]
      if (!script) return txt('未知 action：' + args.action)
      const argv = []
      if (args.data) argv.push('--data', args.data)
      if (args.output) argv.push('--output', args.output)
      if (args.size) argv.push('--size', String(args.size))
      if (args.dir) argv.push('--dir', args.dir)
      if (args.fg) argv.push('--fg', args.fg)
      if (args.bg) argv.push('--bg', args.bg)
      if (args.input) argv.push('--input', args.input)
      const r = await py(script, argv)
      return txt((r.out || '') + (r.err ? '\n[stderr]\n' + r.err : '') + (r.code ? `\n[exit ${r.code}]` : ''))
    }
    case 'poster_cutout': {
      if (!args.input || !String(args.input).trim()) return txt('缺少 input（原图路径必填）')
      const argv = ['--input', args.input]
      if (args.output) argv.push('--output', args.output)
      if (args.up) argv.push('--up', String(args.up))
      const r = await py('cutout.py', argv)
      return txt((r.out || '') + (r.err ? '\n[stderr]\n' + r.err : '') + (r.code ? `\n[exit ${r.code}]` : ''))
    }
    case 'poster_detect_slots': {
      if (!args.image || !String(args.image).trim()) return txt('缺少 image（底图路径必填）')
      const argv = ['--image', args.image]
      if (args.out) argv.push('--out', args.out)
      if (args.color) argv.push('--color', args.color)
      if (args.maxSize) argv.push('--max-size', String(args.maxSize))
      const r = await py('detect_slots.py', argv)
      return txt((r.out || '') + (r.err ? '\n[stderr]\n' + r.err : '') + (r.code ? `\n[exit ${r.code}]` : ''))
    }
    case 'poster_compose': {
      if (!args.job || !String(args.job).trim()) return txt('缺少 job（job.json 路径必填）')
      const r = await py('compose.py', ['--job', args.job])
      return txt((r.out || '') + (r.err ? '\n[stderr]\n' + r.err : '') + (r.code ? `\n[exit ${r.code}]` : ''))
    }
    case 'poster_generate': {
      if (!args.prompt || !String(args.prompt).trim()) return txt('缺少 prompt（提示词必填）')
      if (!args.out || !String(args.out).trim()) return txt('缺少 out（输出路径必填）')
      const host = args.host || '127.0.0.1:8189'
      const port = host.includes(':') ? host.split(':').pop() : '8189'
      const model = args.model === 'moss' ? 'moss' : 'flux'
      const variants = Math.max(1, Math.min(6, Number(args.variants) || 1))
      const outPath = String(args.out)
      const ext = path.extname(outPath)
      const stem = ext ? outPath.slice(0, -ext.length) : outPath
      const lines = []
      const keepOthers = args.keepOthers !== false
      const mossPrompt = keepOthers && model === 'moss'
        ? String(args.prompt) + '\n\n只修改上面明确提到的那一处；其余元素的位置、大小、配色、文字一律保持完全不变。'
        : String(args.prompt)
      for (let i = 0; i < variants; i++) {
        const out = variants === 1 ? outPath : `${stem}-${i + 1}${ext || '.png'}`
        const seed = args.seed != null ? Number(args.seed) + i : undefined
        let r
        if (model === 'moss') {
          if (Array.isArray(args.refs) && args.refs.length) return txt('MOSS 暂不支持参考图融合，请把 model 设为 flux 或去掉 refs')
          r = await run([
            path.join(ROOT, 'python', 'moss_client.py'),
            '--prompt', mossPrompt, '--out', out,
            ...(args.w ? ['--w', String(args.w)] : []),
            ...(args.h ? ['--h', String(args.h)] : []),
            ...(seed != null ? ['--seed', String(seed)] : []),
            ...(args.steps ? ['--steps', String(args.steps)] : []),
            ...(args.cfg ? ['--cfg', String(args.cfg)] : []),
            '--timeout', '1800',
          ], { timeout: 1900 * 1000 })
        } else if (Array.isArray(args.refs) && args.refs.length) {
          r = await run([
            path.join(ROOT, 'python', 'flux_i2i.py'),
            '--refs', ...args.refs,
            '--prompt', args.prompt,
            '--out', out,
            ...(args.w ? ['--w', String(args.w)] : []),
            ...(args.h ? ['--h', String(args.h)] : []),
            ...(seed != null ? ['--seed', String(seed)] : []),
            ...(args.steps ? ['--steps', String(args.steps)] : []),
            '--port', String(port),
          ], { timeout: 1900 * 1000 })
        } else {
          r = await run([
            path.join(ROOT, 'python', 'comfy_client.py'),
            '--prompt', mossPrompt, '--out', out,
            ...(args.w ? ['--w', String(args.w)] : []),
            ...(args.h ? ['--h', String(args.h)] : []),
            ...(seed != null ? ['--seed', String(seed)] : []),
            ...(args.steps ? ['--steps', String(args.steps)] : []),
            ...(args.host ? ['--host', args.host] : []),
          ], { timeout: 1900 * 1000 })
        }
        lines.push((r.out || '') + (r.err ? '\n[stderr]\n' + r.err : '') + (r.code ? `\n[exit ${r.code}]` : ''))
        if (r.code) break
      }
      if (variants > 1) {
        lines.push(`\n已出 ${variants} 版（model=${model}）。下一步：让用户挑一版，再把选中的那张作为底图调 poster_editor 装进工作台微调。`)
      }
      return txt(lines.join('\n---\n'))
    }
    case 'poster_versions': {
      const dir = path.join(process.cwd(), '.posterforge')
      const vdir = path.join(dir, 'versions')
      const latestF = path.join(dir, 'latest.json')
      const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch (e) { return null } }
      const latest = readJson(latestF)
      const list = fs.existsSync(vdir) ? fs.readdirSync(vdir).filter((f) => f.endsWith('.json')).sort() : []
      const action = args.action || 'latest'
      if (action === 'list') {
        if (!list.length) return txt('还没有保存过版本。在工作台点「保存并发回」就会存第 1 版。')
        const rows = list.map((f) => {
          const v = readJson(path.join(vdir, f)) || {}
          return `v${v.version || '?'}  ${(v.at || '').slice(0, 19).replace('T', ' ')}  ${v.count || 0} 个元素  ${v.summary || ''}`
        })
        return txt(`共 ${list.length} 版（最新在最后）：\n\n${rows.join('\n')}\n\n要接着改就调 action=latest。`)
      }
      if (action === 'diff') {
        const pick = (n) => {
          const f = list.find((x) => x.startsWith('v' + String(n).padStart(4, '0')))
          return f ? readJson(path.join(vdir, f)) : null
        }
        const a = pick(args.from), b = pick(args.to)
        if (!a || !b) return txt('找不到指定版本，先调 action=list 看有哪些版本号。')
        return txt(`v${a.version} → v${b.version}\n\n${b.summary || '（无变化摘要）'}\n\n改动明细：\n` +
          (b.changed || []).map((c) => `· ${c.name}：${c.fields.join('、')}`).join('\n'))
      }
      if (!latest) return txt('还没有保存过版本。在工作台点「保存并发回」就会存第 1 版。')
      if (!args.full) {
        return txt(`当前最新：v${latest.version}（${(latest.at || '').slice(0, 19).replace('T', ' ')}）\n` +
          `画布：${JSON.stringify(latest.canvas || {})}　元素：${latest.count}\n` +
          `这一版相对上一版：${latest.summary || '（首个版本）'}\n\n` +
          `元素名清单：${(latest.elements || []).map((e) => e.name || e.type).slice(0, 40).join('、')}\n\n` +
          '要改就从这一版开始；需要完整字段调 action=latest full=true。')
      }
      return txt(`当前最新：v${latest.version}\n\n${JSON.stringify({ canvas: latest.canvas, elements: latest.elements }, null, 2).slice(0, 12000)}`)
    }
    case 'poster_check': {
      const f = args.file ? path.resolve(String(args.file)) : path.join(process.cwd(), '.posterforge', 'latest.json')
      if (!fs.existsSync(f)) return txt('找不到项目文件：' + f + '（先在工作台点「存项目」）')
      let proj
      try { proj = JSON.parse(fs.readFileSync(f, 'utf8')) } catch (e) { return txt('项目文件不是合法 JSON：' + e.message) }
      const canvas = proj.canvas || [2048, 2048]
      const S = Math.min(canvas[0], canvas[1])
      const els = (proj.elements || []).filter((e) => !e.hidden)
      const box = (e) => ({ x: e.x || 0, y: e.y || 0, w: e.w || 0, h: e.h || 0, size: e.size || 0, name: e.name || e.type, type: e.type })
      const bs = els.map(box)
      const issues = []
      const minQR = args.minQR || 0.115
      const minFont = args.minFont || 0.011
      for (const b of bs) {
        if (b.type === 'image' && /码|qr|qr code/i.test(b.name) && Math.min(b.w, b.h) / S < minQR) {
          issues.push(`二维码偏小：${b.name} 只有 ${Math.round(Math.min(b.w, b.h))}px（画布短边 ${S}px 的 ${(Math.min(b.w, b.h) / S * 100).toFixed(1)}%，应 ≥ ${(minQR * 100).toFixed(1)}%）`)
        }
        if (b.type === 'text' && (b.size || 0) / S < minFont) {
          issues.push(`字号过小：${b.name} ${Math.round(b.size)}px（占短边 ${((b.size || 0) / S * 100).toFixed(2)}%，建议 ≥ ${(minFont * 100).toFixed(1)}%）`)
        }
        if (b.x < -2 || b.y < -2 || b.x + b.w > canvas[0] + 2 || b.y + b.h > canvas[1] + 2) {
          issues.push(`出画布：${b.name} 超出画布范围（${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}×${Math.round(b.h)}）`)
        }
      }
      const ov = []
      for (let i = 0; i < bs.length; i++) {
        for (let j = i + 1; j < bs.length; j++) {
          const a = bs[i], b = bs[j]
          if (a.type === 'rect' && a.w * a.h > canvas[0] * canvas[1] * 0.3) continue // 大底板不算遮挡
          const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
          const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
          if (ix <= 2 || iy <= 2) continue
          const area = ix * iy
          const ratio = area / Math.min(a.w * a.h || 1, b.w * b.h || 1)
          if (ratio > 0.12) ov.push({ a: a.name, b: b.name, pct: Math.round(ratio * 100), ix: Math.round(ix), iy: Math.round(iy) })
        }
      }
      const head = `版面自检：${path.basename(f)}　画布 ${canvas[0]}×${canvas[1]}　${els.length} 个元素`
      const body = []
      if (!issues.length && !ov.length) body.push('没有发现出画布、遮挡、字号或二维码尺寸问题。')
      if (ov.length) {
        body.push(`\n遮挡 ${ov.length} 处（重叠面积占较小元素 >12%）：`)
        ov.slice(0, 12).forEach((o) => body.push(`· ${o.a} × ${o.b}　重叠 ${o.pct}%（${o.ix}×${o.iy}px）`))
        if (ov.length > 12) body.push(`… 另有 ${ov.length - 12} 处`)
      }
      if (issues.length) {
        body.push(`\n尺寸/越界 ${issues.length} 处：`)
        issues.slice(0, 12).forEach((s) => body.push('· ' + s))
      }
      body.push('\n提示：如果遮挡的是「文字压在底图上」这种设计意图，且文字底下有实心底板，可以接受；两个文字块互相压住必须改。')
      return txt(head + '\n' + body.join('\n'))
    }
    case 'poster_guide': {
      return txt(GUIDE)
    }
    default:
      return txt('未知工具：' + name)
  }
}
