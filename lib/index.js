// Posterwright · 海报匠 · DSH 插件入口
// 把海报工具注册进 DSH 的工具表；实现放在 lib/core.js，
// server/index.js（MCP stdio）用的是同一份实现。
import { TOOLS, callTool, ROOT, PY } from './core.js'

export const name = 'posterwright'
export const inject = ['tools']

const OUTPUT = {
  schema: {
    type: 'object',
    properties: { text: { type: 'string' }, data: { type: 'object', additionalProperties: true } },
    required: ['text'],
    additionalProperties: true,
  },
  render: (_a, v) => [{ type: 'text', text: (v && v.text) || '' }],
}

// 出图要排队等 GPU，给足时间；其余都是本地脚本，几秒到几十秒。
const TIMEOUT = {
  poster_generate: 20 * 60_000,
  poster_compose: 5 * 60_000,
  poster_cutout: 3 * 60_000,
  poster_qr: 3 * 60_000,
  poster_detect_slots: 2 * 60_000,
}

export function apply(ctx) {
  ctx.effect(() => {
    for (const t of TOOLS) {
      ctx.tools.register({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
        timeoutMs: TIMEOUT[t.name] || 60_000,
        isConcurrencySafe: () => t.name !== 'poster_generate',
        output: OUTPUT,
        async execute(args) {
          return callTool(t.name, args || {})
        },
      })
    }
    return () => {}
  }, 'posterwright.tools')

  // 工作台是纯本地单文件（file:// 双击即开），不经过宿主 /api：
  // 浏览器标签页直连 /api/* 一律 401，那条路只会让人点进死胡同，0.5.4 起已移除。
  ctx.logger?.info?.(`posterwright ready · root=${ROOT} python=${PY}`)
}
