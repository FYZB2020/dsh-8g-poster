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

  // 宿主内的两条本地路由：工作台同源打开 + 元素一键交回宿主
  try {
    const conn = ctx.get?.('connection')
    const reg = conn?.fetch?.register
    if (reg) {
      ctx.effect(() => reg({
        path: '/api/poster-forge/editor',
        methods: ['GET'],
        requestBody: 'none',
        fetch: (request) => serveEditor(request),
      }), 'poster-forge.editor-route')

      ctx.effect(() => reg({
        path: '/api/poster-forge/apply',
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: (request) => applyFromEditor(request),
      }), 'poster-forge.apply-route')
    } else {
      ctx.logger?.info?.('poster-forge: connection.fetch 不可用，工作台仍可离线打开，但「一键交回宿主」不可用')
    }
  } catch (e) {
    ctx.logger?.info?.('poster-forge: 注册本地路由失败 ' + ((e && e.message) || e))
  }

  ctx.logger?.info?.(`poster-forge ready · root=${ROOT} python=${PY}`)
}

/* ---------- 工作台：同源打开 + 一键交回 ---------- */

const INJECT = `
<script>
(function () {
  if (!window.__POSTER_FORGE_HOST__) return;
  window.sendToAI = function () {
    var els = (typeof selEls === 'function') ? selEls() : [];
    if (!els.length) { toast('先选中元素'); return; }
    var body = {
      canvas: S(),
      pickedAt: new Date().toISOString(),
      elements: els.map(function (e) {
        return { id: e.id, name: e.name || e.type, type: e.type, x: e.x, y: e.y, w: e.w, h: e.h,
          rot: e.rot || 0, flipX: !!e.flipX, flipY: !!e.flipY, opacity: e.opacity == null ? 1 : e.opacity,
          text: e.text, size: e.size, font: e.font, color: e.color, align: e.align,
          weight: e.weight, fill: e.fill, locked: !!e.locked, crop: e.crop || null,
          children: e.children ? e.children.length : undefined };
      })
    };
    toast('交给宿主中…');
    fetch('/api/poster-forge/apply', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.ok) toast('已交回宿主：' + j.file + '（回到对话说「读一下」即可）');
      else toast('宿主拒收：' + ((j && j.error) || '未知原因'));
    }).catch(function (e) { toast('提交失败：' + e.message); });
  };

  // 首次打开讲清整体流程（可关闭，一次会话只弹一次）
  if (!sessionStorage.getItem('pf-welcome')) {
    sessionStorage.setItem('pf-welcome', '1');
    var box = document.createElement('div');
    box.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(16,20,26,.62);display:flex;align-items:center;justify-content:center';
    box.innerHTML =
      '<div style="width:520px;background:#141a22;color:#e8e2d6;border:1px solid #2c3542;border-radius:14px;padding:26px 28px;font:14px/1.85 -apple-system,Segoe UI,Microsoft YaHei">' +
      '<div style="font:600 17px/1.4 -apple-system,Segoe UI,Microsoft YaHei;margin-bottom:12px">PosterForge · 海报工作台</div>' +
      '<div style="color:#a9b3c0;margin-bottom:14px">完整流程五步，你随时可以问我要下一步：</div>' +
      '<div style="margin-bottom:6px">1　<b>选模型</b>　flux 出质感 / moss 出构图（我会给你对比）</div>' +
      '<div style="margin-bottom:6px">2　<b>出几版</b>　一次生成 3 版背景</div>' +
      '<div style="margin-bottom:6px">3　<b>挑一版</b>　你选定后我才往下走</div>' +
      '<div style="margin-bottom:6px">4　<b>装进工作台</b>　就是这里：拖拽排版、改字、贴码</div>' +
      '<div style="margin-bottom:14px">5　<b>校验交付</b>　二维码逐张扫通、导 PNG/PDF</div>' +
      '<div style="color:#8b96a5;font-size:12.5px;margin-bottom:16px">提示：选中元素后浮出的工具条里有「✦ 发回 AI」——点了会直接交回对话，不会丢内容。</div>' +
      '<button id="pf-go" style="width:100%;padding:11px;border:0;border-radius:9px;background:#c0392f;color:#fff;font:600 14px -apple-system,Segoe UI,Microsoft YaHei;cursor:pointer">知道了，开始</button>' +
      '</div>';
    document.body.appendChild(box);
    box.querySelector('#pf-go').onclick = function () { box.remove(); };
  }
})();
</script>
`

async function serveEditor(request) {
  const fs = await import('node:fs/promises')
  const path = await import('node:path')
  const f = path.join(ROOT, 'assets', 'editor', 'poster-editor.html')
  let html = await fs.readFile(f, 'utf8')
  const url = new URL(request.url)
  const bg = url.searchParams.get('bg')
  if (bg) {
    try {
      const buf = await fs.readFile(bg)
      const ext = path.extname(bg).toLowerCase()
      const mime = ext === '.png' ? 'image/png' : 'image/jpeg'
      const uri = `data:${mime};base64,${buf.toString('base64')}`
      html = html.replace(/("bg"\s*:\s*")[^"]*(")/, `$1${uri}$2`)
    } catch (e) {
      // 底图读不到就按原样返回，不阻断打开
    }
  }
  html = html.replace('<head>', `<head>\n<script>window.__POSTER_FORGE_HOST__ = true;</script>`)
  html = html.replace('</body>', INJECT + '</body>')
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
}

async function applyFromEditor(request) {
  const fs = await import('node:fs/promises')
  const path = await import('node:path')
  try {
    const body = await request.json()
    const dir = path.join(process.cwd(), '.posterforge')
    await fs.mkdir(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const file = path.join(dir, `apply-${stamp}.json`)
    await fs.writeFile(file, JSON.stringify(body, null, 2), 'utf8')
    await fs.writeFile(path.join(dir, 'latest.json'), JSON.stringify(body, null, 2), 'utf8')
    return Response.json({ ok: true, file })
  } catch (e) {
    return Response.json({ ok: false, error: (e && e.message) || String(e) }, { status: 400 })
  }
}
