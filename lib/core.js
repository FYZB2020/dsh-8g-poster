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

【整体流程（五步，每步都有明确的"下一步")】
1. 定模型 —— 先问用户这次用哪个出图模型（flux / moss），把下面的强项对比给他，别替他决定。
2. 出几版 —— 用 poster_generate 一次出 3 版（variants=3），提示词里写清画面语言，明确"不要文字、不要 logo"。
3. 挑一版 —— 把 3 版摆给用户，让他选；**用户没选之前不要往下走**。
4. 装进工作台 —— 拿选中的那张当底图，调 poster_editor 打开工作台，提示用户：拖拽排版、改字号字体、贴二维码、导 PNG/PDF。
5. 校验与交付 —— 印前必须跑 poster_qr action=verify 逐张解码；导出 2048 / 4096 / PDF；最后核对合规表述边界。

【两个模型的强项（都跑在同一台 ComfyUI 上）】
· flux（FLUX 3 Klein int8）—— 16 步 / CFG 1.0 / 1024² 约 40–60 秒
  强：画面质感、光影层次、材质细节；支持 2–10 张参考图融合（refs）。
  弱：中文长提示词理解一般；不支持版面框控；图上文字不可控。
  适合：出"氛围背景 / 场景大图 / 参考图融合定调"。

· moss（MOSS-Image SFT int8）—— 20 步 / CFG 2.5 / 1024² 约 100 秒
  强：Qwen3.5-9B 文本编码器，中文提示词理解更好；支持版面框控（MOSSImageLayoutPrompt，框内可直接渲染文字）、色块+深度控制（MOSSImageControl，LoRA）、局部编辑（TextEncodeMOSSImageEdit，edit LoRA）。
  弱：慢一倍；显存更吃紧（9B 编码器 6.8GB）；参考图融合暂不支持（走 flux）。
  适合：构图要求死、要"图里就该有那几块东西"、或后续要局部改图。

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
      'flux 强在画面质感、光影、多图融合；moss 强在中文提示词理解、支持版面框控与局部编辑。' +
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
        host: { type: 'string', description: 'ComfyUI 地址，默认 127.0.0.1:8189' },
      },
      required: ['prompt', 'out'],
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
      for (let i = 0; i < variants; i++) {
        const out = variants === 1 ? outPath : `${stem}-${i + 1}${ext || '.png'}`
        const seed = args.seed != null ? Number(args.seed) + i : undefined
        let r
        if (model === 'moss') {
          if (Array.isArray(args.refs) && args.refs.length) return txt('MOSS 暂不支持参考图融合，请把 model 设为 flux 或去掉 refs')
          r = await run([
            path.join(ROOT, 'python', 'moss_client.py'),
            '--prompt', args.prompt, '--out', out,
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
            '--prompt', args.prompt, '--out', out,
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
    case 'poster_guide': {
      return txt(GUIDE)
    }
    default:
      return txt('未知工具：' + name)
  }
}
