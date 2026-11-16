import { apply } from '../lib/index.js'
const routes = new Map(); const tools = []
const ctx = {
  tools: { register: (t) => tools.push(t) },
  effect: (fn) => { const r = fn(); return () => (typeof r === 'function' ? r() : undefined) },
  get: (k) => (k === 'connection' ? { fetch: { register: (route) => { routes.set(route.path, route); return () => routes.delete(route.path) } } } : undefined),
  logger: { info: (m) => console.log('[ctx]', m) },
}
apply(ctx)
console.log('tools:', tools.length, '| routes:', [...routes.keys()].join(','))
const r1 = await routes.get('/api/poster-forge/editor').fetch(new Request('http://x/api/poster-forge/editor'))
const html = await r1.text()
console.log('editor:', r1.status, (html.length/1048576).toFixed(2) + 'MB', 'hostflag:', html.includes('__POSTER_FORGE_HOST__'), 'inject:', html.includes('api/poster-forge/apply'))
const r2 = await routes.get('/api/poster-forge/apply').fetch(new Request('http://x/api/poster-forge/apply', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ canvas: 2048, elements: [{ id: 'e1', name: '主标题', type: 'text', x: 1, y: 2, w: 3, h: 4, text: '测试' }] }),
}))
console.log('apply:', r2.status, JSON.stringify(await r2.json()))