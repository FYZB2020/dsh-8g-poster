// 版本链测试：作品文件夹保存 → 快照 → poster_versions list/latest/diff → poster_check
// 全部在临时目录里跑：先把「家目录」指到 tmp，避免污染真实 ~/.posterwright/workspace.json
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'

const HOME = path.join(os.tmpdir(), 'posterwright-test-home')
fs.rmSync(HOME, { recursive: true, force: true })
fs.mkdirSync(HOME, { recursive: true })
process.env.USERPROFILE = HOME
process.env.HOME = HOME

const { callTool } = await import('../lib/core.js')

const WS = path.join(os.tmpdir(), 'posterwright-test-ws')
fs.rmSync(WS, { recursive: true, force: true })
fs.mkdirSync(WS, { recursive: true })

let failed = 0
const ok = (cond, label, extra) => {
  if (cond) console.log('  ok   ' + label)
  else { failed++; console.log('  FAIL ' + label + (extra ? '  ' + extra : '')) }
}

const proj = (title, size, extra) => ({
  canvas: [2048, 2048],
  elements: [
    { id: 'a', name: '主标题', type: 'text', text: title, size, x: 100, y: 300, w: 1200, h: 200 },
    { id: 'b', name: '二维码', type: 'image', x: 200, y: 1400, w: 240, h: 240 },
    ...(extra ? [extra] : []),
  ],
})

const write = (name, obj) => {
  const f = path.join(WS, name)
  fs.writeFileSync(f, JSON.stringify(obj), 'utf8')
  return f
}

console.log('workspace')
const set = await callTool('poster_workspace', { action: 'set', dir: WS })
ok(/已设定/.test(set.text), 'set 作品文件夹', set.text)

console.log('save v1')
const f1 = write('p1.json', proj('旧标题', 100))
const s1 = await callTool('poster_workspace', { action: 'save', file: f1, name: '测试项目' })
ok(/版本链：v1/.test(s1.text), '第一次保存生成 v1', s1.text)
ok(fs.existsSync(path.join(WS, '测试项目.json')), '项目 JSON 落在作品文件夹')
ok(fs.existsSync(path.join(WS, '.posterwright', 'latest.json')), 'latest.json 落在作品文件夹内')

console.log('save v2')
const f2 = write('p2.json', proj('新标题', 112, { id: 'c', name: '新增徽标', type: 'image', x: 900, y: 100, w: 200, h: 200 }))
const s2 = await callTool('poster_workspace', { action: 'save', file: f2, name: '测试项目' })
ok(/版本链：v2/.test(s2.text), '第二次保存生成 v2', s2.text)
ok(/改了 1 个元素/.test(s2.text), 'v2 摘要识别出改动', s2.text)
ok(/新增 1/.test(s2.text), 'v2 摘要识别出新增', s2.text)

console.log('versions list / latest / diff')
const list = await callTool('poster_versions', { action: 'list' })
ok(/共 2 版/.test(list.text), 'list 数到 2 版', list.text)
const latest = await callTool('poster_versions', { action: 'latest' })
ok(/v2/.test(latest.text), 'latest 指向 v2', latest.text)
ok(/新标题/.test(latest.text) || /元素名清单/.test(latest.text), 'latest 带元素清单', latest.text)
const diff = await callTool('poster_versions', { action: 'diff', from: 1, to: 2 })
ok(/主标题/.test(diff.text), 'diff 指出改动元素', diff.text)

console.log('poster_check 走作品文件夹')
const chk = await callTool('poster_check', {})
ok(/版面自检/.test(chk.text), 'poster_check 默认读版本链 latest', chk.text)

console.log('poster_check 抓出问题')
const bad = write('bad.json', {
  canvas: [1000, 1000],
  elements: [
    { id: 'x', name: '小字', type: 'text', text: 'a', size: 6, x: 10, y: 10, w: 100, h: 20 },
    { id: 'y', name: '出界块', type: 'rect', x: 900, y: 900, w: 400, h: 400 },
  ],
})
const badRes = await callTool('poster_check', { file: bad })
ok(/字号过小/.test(badRes.text), '抓到字号过小', badRes.text)
ok(/出画布/.test(badRes.text), '抓到出画布', badRes.text)

fs.rmSync(WS, { recursive: true, force: true })
fs.rmSync(HOME, { recursive: true, force: true })

if (failed) { console.log(`\n${failed} 项失败`); process.exit(1) }
console.log('\nALL PASS')
