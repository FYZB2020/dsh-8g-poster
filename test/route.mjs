// 0.6.0：宿主 /api 路由已停用（浏览器直开必 401），这里只验证「不再注册路由」+ 工具数 + launcher 落地。
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const routes = new Map()
const tools = []
const ctx = {
  tools: { register: (t) => tools.push(t) },
  effect: (fn) => { fn(); return () => { } },
  inject: (deps, fn) => fn(ctx),
  get: () => ({ fetch: { register: (r) => { routes.set(r.path, r) } } }),
  logger: { info: (m) => console.log('[ctx]', m) },
}

const mod = await import('../lib/index.js')
mod.apply(ctx)

let bad = 0
const check = (ok, name, note) => {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name.padEnd(22) + (note || ''))
  if (!ok) bad++
}

check(tools.length === 12, 'tools 数量', String(tools.length))
check(routes.size === 0, '宿主路由已停用', `routes=${routes.size}`)

const { callTool } = await import('../lib/core.js')
const r = await callTool('poster_editor', {})
const launcher = path.join(ROOT, 'assets', 'editor', 'poster-open.html')
check(fs.existsSync(launcher) && r.text.includes('poster-open.html'), 'launcher 已生成', 'poster-open.html')

console.log(bad ? `=== route: ${bad} FAILED` : '=== route: ALL PASS')
process.exit(bad ? 1 : 0)
