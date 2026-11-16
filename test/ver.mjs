import { apply } from '../lib/index.js'
import { callTool } from '../lib/core.js'
import fs from 'node:fs'
const routes = {}
const ctx = {
  tools: { register(t) { } },
  effect(fn) { fn() },
  logger: { info() { }, warn() { }, error() { } },
  get(svc) {
    if (svc !== 'connection') return undefined
    return { fetch: { register(r) { routes[r.path] = r } } }
  },
}
apply(ctx)
const post = routes['/api/poster-forge/apply'].fetch
const base = { canvas: [2048, 2048], elements: [
  { id: 'a', name: '主标题 1', type: 'text', text: '旧标题', size: 100, x: 100, y: 300 },
  { id: 'b', name: '二维码 1', type: 'image', x: 200, y: 1400, w: 240, h: 240 } ] }
const r1 = await (await post({ json: async () => ({ ...base, kind: 'save' }) })).json()
const r2 = await (await post({ json: async () => ({ ...base, kind: 'save', elements: [
  { id: 'a', name: '主标题 1', type: 'text', text: '新标题', size: 112, x: 100, y: 300 },
  { id: 'b', name: '二维码 1', type: 'image', x: 200, y: 1400, w: 240, h: 240 },
  { id: 'c', name: '新增徽标', type: 'image', x: 900, y: 100, w: 200, h: 200 } ] }) })).json()
console.log('save1', JSON.stringify(r1))
console.log('save2', JSON.stringify(r2))
console.log((await callTool('poster_versions', { action: 'list' })).text)
console.log((await callTool('poster_versions', { action: 'latest' })).text)
fs.rmSync(new URL('../.posterforge', import.meta.url), { recursive: true, force: true })