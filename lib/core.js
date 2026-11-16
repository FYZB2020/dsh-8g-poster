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
    description: '内置海报版式（封面风 / 深蓝书堆 / 暖金醒狮 / 极简几何）与各自的坐标体系、配色、以及四条硬规矩（二维码尺寸、逐张校验、合规口径、字体授权）。',
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
    description: '本机 ComfyUI（FLUX 3 Klein）出图：文生图；传 refs 则做多图融合。需本地 ComfyUI 已在跑（默认 127.0.0.1:8189）。16 步 / CFG 1.0 / euler / simple。',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        out: { type: 'string' },
        w: { type: 'number' },
        h: { type: 'number' },
        seed: { type: 'number' },
        steps: { type: 'number' },
        refs: { type: 'array', items: { type: 'string' }, description: '参考图（最多 10 张，融合用）' },
        host: { type: 'string', description: 'ComfyUI 地址，默认 127.0.0.1:8189' },
      },
      required: ['prompt', 'out'],
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
      return txt(fs.readFileSync(f, 'utf8'))
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
      let r
      if (Array.isArray(args.refs) && args.refs.length) {
        r = await run([
          path.join(ROOT, 'python', 'flux_i2i.py'),
          '--refs', ...args.refs,
          '--prompt', args.prompt,
          '--out', args.out,
          ...(args.w ? ['--w', String(args.w)] : []),
          ...(args.h ? ['--h', String(args.h)] : []),
          ...(args.seed != null ? ['--seed', String(args.seed)] : []),
          ...(args.steps ? ['--steps', String(args.steps)] : []),
          '--port', String(port),
        ])
      } else {
        r = await run([
          path.join(ROOT, 'python', 'comfy_client.py'),
          '--prompt', args.prompt, '--out', args.out,
          ...(args.w ? ['--w', String(args.w)] : []),
          ...(args.h ? ['--h', String(args.h)] : []),
          ...(args.seed != null ? ['--seed', String(args.seed)] : []),
          ...(args.steps ? ['--steps', String(args.steps)] : []),
          ...(args.host ? ['--host', args.host] : []),
        ])
      }
      return txt((r.out || '') + (r.err ? '\n[stderr]\n' + r.err : '') + (r.code ? `\n[exit ${r.code}]` : ''))
    }
    default:
      return txt('未知工具：' + name)
  }
}
