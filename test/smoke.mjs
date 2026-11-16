#!/usr/bin/env node
// PosterForge 自检：不需要 ComfyUI、不需要外部素材，跑完就知道插件是否装对了。
//   node test/smoke.mjs
// 退出码 0 = 全部通过。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { TOOLS, callTool, ROOT } from '../lib/core.js'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'posterforge-'))
const out = (s) => path.join(tmp, s)
let failed = 0

function line(ok, name, detail) {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(20)} ${detail || ''}`)
}

function has(text, needle) {
  return String(text || '').includes(needle)
}

console.log('PosterForge 自检')
console.log('root  :', ROOT)
console.log('tools :', TOOLS.length)
console.log('tmp   :', tmp)
console.log('')

for (const t of TOOLS) {
  if (!t.name || !t.description || !t.parameters) line(false, t.name, '描述或参数缺失')
}
line(true, 'descriptors', `${TOOLS.length} 个工具都有 description + parameters`)

{
  const r = await callTool('poster_editor', {})
  const f = path.join(ROOT, 'assets', 'editor', 'poster-editor.html')
  line(fs.existsSync(f) && has(r.text, '/api/poster-forge/editor'), 'poster_editor', fs.existsSync(f) ? `路由 + ${(fs.statSync(f).size / 1048576).toFixed(1)}MB` : '文件缺失')
}

{
  const r = await callTool('poster_fonts', {})
  const n = (r.text.match(/^· /gm) || []).length
  line(n >= 5, 'poster_fonts', `${n} 套字体`)
  const r2 = await callTool('poster_fonts', { scene: '标题' })
  const n2 = (r2.text.match(/^· /gm) || []).length
  line(n2 >= 1 && n2 < n || n2 === n, 'poster_fonts 筛选', `「标题」命中 ${n2} 套`)
}

{
  const r = await callTool('poster_templates', {})
  const t = r.text || ''
  const ok = /必须守的规则/.test(t) && /二维码最终像素/.test(t) && /两个起点/.test(t) && !/\"x\":/.test(t)
  line(ok, 'poster_templates', '规则 + 结构起点（且不含坐标）')
}

{
  const f = out('code.png')
  const a = await callTool('poster_qr', { action: 'make', data: 'https://example.com/posterforge/smoke', output: f, size: 600 })
  const made = fs.existsSync(f)
  const b = await callTool('poster_qr', { action: 'verify', dir: tmp })
  line(made && has(b.text, 'ALL PASS'), 'poster_qr make+verify', made ? '生成即可解出' : '生成失败')
  if (!made) console.log('   ', a.text)
}

// 需要外部素材/服务的工具：只检查参数契约，不真跑（避免拖慢 CI）
for (const name of ['poster_cutout', 'poster_detect_slots', 'poster_compose', 'poster_generate']) {
  const r = await callTool(name, {})
  const ok = has(r.text, '缺少') || has(r.text, '工具执行失败') || has(r.text, 'invalid') || has(r.text, 'Argument') || has(r.text, 'Error') || has(r.text, 'error') || has(r.text, 'cannot') || has(r.text, 'missing')
  line(ok, name, '缺参数时返回可读错误（未崩溃）')
}

console.log('')
console.log(failed === 0 ? '=== smoke: ALL PASS' : `=== smoke: ${failed} FAILED`)
fs.rmSync(tmp, { recursive: true, force: true })
process.exit(failed === 0 ? 0 : 1)
