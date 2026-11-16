// PosterForge · DSH 插件入口
// 把 8 个海报工具注册进 DSH 的工具表；实现放在 lib/core.js，
// server/index.js（MCP stdio）用的是同一份实现。
import { TOOLS, callTool, ROOT, PY } from './core.js'

export const name = 'poster-forge'
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
  }, 'poster-forge.tools')

  ctx.logger?.info?.(`poster-forge ready · root=${ROOT} python=${PY}`)
}
