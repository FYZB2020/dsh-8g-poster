// 端到端功能测试：抠图 → 占位块识别 → 合成出 PNG/PDF → 二维码 生成/校验/换色/批量
// 依赖 python（POSTER_PYTHON 或 python）。全部在系统临时目录里跑。
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const { callTool, PY } = await import('../lib/core.js')

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-tools-'))
let failed = 0
const ok = (cond, label, extra) => {
  if (cond) console.log('  ok   ' + label)
  else { failed++; console.log('  FAIL ' + label + (extra ? '\n       ' + String(extra).split('\n').slice(0, 6).join('\n       ') : '')) }
}

// ---------- 夹具 ----------
const py = (code) => execFileSync(PY, ['-c', code], { cwd: TMP, encoding: 'utf8', stdio: 'pipe' })

try {
  py(`
from PIL import Image, ImageDraw
w = Image.new('RGB', (600, 600), (255, 255, 255))
d = ImageDraw.Draw(w)
d.ellipse([150, 120, 450, 420], fill=(198, 26, 26))
d.rectangle([210, 450, 390, 520], fill=(196, 143, 101))
w.save('white.png')

b = Image.new('RGB', (900, 500), (246, 243, 236))
db = ImageDraw.Draw(b)
for x in (60, 340, 620):
    db.rectangle([x, 80, x + 120, 200], fill=(205, 205, 205))
b.save('base.png')
`)
  console.log('fixtures  white.png  base.png')
} catch (e) {
  console.log('fixtures 失败：' + ((e.stderr || e.message) + '').slice(0, 400))
  process.exit(1)
}

// ---------- 抠图 ----------
console.log('poster_cutout')
const cut = path.join(TMP, 'cut.png')
const cutRes = await callTool('poster_cutout', { input: path.join(TMP, 'white.png'), output: cut })
ok(fs.existsSync(cut), '输出透明 PNG', cutRes.text)
if (fs.existsSync(cut)) {
  const probe = py(`
from PIL import Image
im = Image.open(${JSON.stringify(cut)})
print(im.mode, im.size)
print('corner', im.getpixel((0, 0)))
`)
  ok(/RGBA/.test(probe), '带 alpha 通道', probe)
  const corner = (probe.match(/corner \(([\d, ]+)\)/) || [])[1] || '0,0,0,255'
  const alpha0 = Number(corner.split(',').pop())
  ok(alpha0 < 40, '四角已透明', probe)
}

// ---------- 占位块 ----------
console.log('poster_detect_slots')
const slotsFile = path.join(TMP, 'slots.json')
const slotRes = await callTool('poster_detect_slots', { image: path.join(TMP, 'base.png'), color: 'gray', out: slotsFile })
const slots = JSON.parse(fs.readFileSync(slotsFile, 'utf8'))
ok(slots.summary && slots.summary.count >= 3, '识别出 3 个灰块', slotRes.text + '\n' + JSON.stringify(slots.summary))

// ---------- 合成 ----------
console.log('poster_compose')
const job = {
  canvas: { source: path.join(TMP, 'base.png'), scale: 3, sharpen: true, page_mm: [900, 500] },
  output: { name: 'out_poster', dir: path.join(TMP, 'out'), preview_width: 900 },
  patches: [{
    box: [60, 300, 520, 80], fill: '#FBF3E6', radius: 6,
    texts: [{ x: 80, y: 340, text: '测试标题 — 合成成功', size: 34, color: '#B8281E', font: 'msyhbd.ttc', anchor: 'lm' }],
  }],
  pastes: [{ image: cut, box: [600, 260, 200, 200], fit: 'contain' }],
  verify: false,
}
const jobFile = path.join(TMP, 'job.json')
fs.writeFileSync(jobFile, JSON.stringify(job, null, 2), 'utf8')
const compRes = await callTool('poster_compose', { job: jobFile })
const outDir = path.join(TMP, 'out')
const produced = fs.existsSync(outDir) ? fs.readdirSync(outDir) : []
ok(produced.some((f) => f.endsWith('.png')), '出 PNG', compRes.text + '\n' + produced.join(','))
ok(produced.some((f) => f.endsWith('.pdf')), '出 PDF', produced.join(','))
const pdf = path.join(outDir, produced.find((f) => f.endsWith('.pdf')) || 'x.pdf')
if (fs.existsSync(pdf)) {
  const head = fs.readFileSync(pdf).subarray(0, 5).toString()
  ok(head === '%PDF-', 'PDF 文件头合法', head)
}

// ---------- 二维码 ----------
console.log('poster_qr')
const QRDIR = path.join(TMP, 'qr')
fs.mkdirSync(QRDIR, { recursive: true })
const qr1 = path.join(QRDIR, 'qr1.png')
const qrRes = await callTool('poster_qr', { action: 'make', data: 'https://example.com/posterwright', output: qr1, size: 600 })
ok(fs.existsSync(qr1), '生成二维码', qrRes.text)
const ver = await callTool('poster_qr', { action: 'verify', dir: QRDIR })
ok(/PASS/.test(ver.text) && !/FAIL/.test(ver.text), '解码校验通过', ver.text)
const qr2 = path.join(QRDIR, 'qr2.png')
const rec = await callTool('poster_qr', { action: 'recolor', input: qr1, output: qr2, fg: '#7E2A1F', bg: '#F6F3EC' })
ok(fs.existsSync(qr2), '换色出图', rec.text)
if (fs.existsSync(qr2)) {
  const v2 = await callTool('poster_qr', { action: 'verify', dir: QRDIR })
  ok(/PASS/.test(v2.text) && !/FAIL/.test(v2.text), '换色后仍可解码', v2.text)
}

fs.rmSync(TMP, { recursive: true, force: true })
if (failed) { console.log(`\n=== tools: ${failed} FAILED`); process.exit(1) }
console.log('\n=== tools: ALL PASS')
