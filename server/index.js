#!/usr/bin/env node
/**
 * PosterForge MCP server (stdio, zero-dependency)
 * 把「本地生图 → 素材合成 → 二维码校验 → 印刷件 → 可编辑网页」串成一套工具。
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PY = process.env.POSTER_PYTHON || 'python';
const ASSETS = path.join(ROOT, 'assets');
const SKILL = path.join(ROOT, 'skill', 'scripts');

function log(...a) { process.stderr.write('[poster-forge] ' + a.join(' ') + '\n'); }

function run(cmd, args, opts = {}) {
  return new Promise(resolve => {
    const p = spawn(cmd, args, { cwd: opts.cwd || ROOT, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    let out = '', err = '';
    p.stdout.on('data', d => { out += d.toString('utf8'); });
    p.stderr.on('data', d => { err += d.toString('utf8'); });
    p.on('error', e => resolve({ code: -1, out, err: String(e) }));
    p.on('close', c => resolve({ code: c, out, err }));
  });
}

async function py(script, args) {
  const r = await run(PY, [path.join(SKILL, script), ...args]);
  return r;
}

function txt(s) { return { content: [{ type: 'text', text: s }] }; }

/* ───────────── 字体库 ───────────── */
function loadFonts() {
  const f = path.join(ASSETS, 'fonts', 'fonts.json');
  if (!fs.existsSync(f)) return [];
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return []; }
}

/* ───────────── 工具表 ───────────── */
const TOOLS = [
  {
    name: 'poster_editor',
    description: '取回可编辑海报工作台（单文件 HTML，画布/图层/文字/二维码全部可拖拽改）。返回文件绝对路径。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'poster_fonts',
    description: '列出内置的可商用字体，含每个字体的用途标签（场景 / 字号 / 气质），可按场景过滤。',
    inputSchema: {
      type: 'object',
      properties: {
        scene: { type: 'string', description: '过滤场景，如 标题 / 正文 / 海报 / 中式 / 活泼' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'poster_templates',
    description: '列出内置海报版式（封面风 / 深蓝书堆 / 暖金醒狮 / 极简几何）与各自的坐标体系说明。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'poster_qr',
    description: '二维码工具：make 生成 / verify 逐张解码校验 / recolor 换色 / batch 批量。verify 是印刷前必跑的那一步。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['make', 'verify', 'recolor', 'batch'] },
        data: { type: 'string', description: 'make 的内容（URL 或文本）' },
        output: { type: 'string', description: '输出路径' },
        size: { type: 'number', description: '边长像素，默认 1200' },
        dir: { type: 'string', description: 'verify / batch 的目录' },
        fg: { type: 'string', description: 'recolor 前景色 #RRGGBB' },
        bg: { type: 'string', description: 'recolor 背景色 #RRGGBB' },
        input: { type: 'string', description: 'recolor 的原图' }
      },
      required: ['action'],
      additionalProperties: false
    }
  },
  {
    name: 'poster_cutout',
    description: 'GrabCut 抠图，把白底素材变成透明 PNG。返回输出路径。',
    inputSchema: {
      type: 'object',
      properties: {
        input: { type: 'string', description: '原图路径' },
        output: { type: 'string', description: '输出 PNG 路径' },
        up: { type: 'number', description: '放大倍数，默认 1' }
      },
      required: ['input'],
      additionalProperties: false
    }
  },
  {
    name: 'poster_detect_slots',
    description: '在底图里识别矩形占位块（二维码位 / 图片位），输出 slots.json 供合成使用。',
    inputSchema: {
      type: 'object',
      properties: {
        image: { type: 'string', description: '底图路径' },
        out: { type: 'string', description: 'slots.json 输出路径' },
        color: { type: 'string', description: '占位块颜色 gray|white|#RRGGBB' },
        maxSize: { type: 'number', description: '占位块最大边长' }
      },
      required: ['image'],
      additionalProperties: false
    }
  },
  {
    name: 'poster_compose',
    description: '按 job.json 合成印刷成品：贴素材、改文字、贴二维码、放大、印前自检，输出 PNG / PDF。',
    inputSchema: {
      type: 'object',
      properties: { job: { type: 'string', description: 'job.json 路径' } },
      required: ['job'],
      additionalProperties: false
    }
  },
  {
    name: 'poster_generate',
    description: '本机 ComfyUI（FLUX 3 Klein）出图：文生图，或给参考图做融合。需要本地 ComfyUI 已在跑（默认 8189）。',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '提示词' },
        out: { type: 'string', description: '输出路径' },
        w: { type: 'number' },
        h: { type: 'number' },
        seed: { type: 'number' },
        steps: { type: 'number', description: '蒸馏版固定 16' },
        refs: { type: 'array', items: { type: 'string' }, description: '参考图（最多 10 张，融合用）' },
        host: { type: 'string', description: 'ComfyUI 地址，默认 127.0.0.1:8189' }
      },
      required: ['prompt', 'out'],
      additionalProperties: false
    }
  }
];

async function callTool(name, args) {
  log('call', name, JSON.stringify(args).slice(0, 120));
  try {
    return await callToolInner(name, args);
  } catch (e) {
    log('callTool threw', name, e && e.message);
    return txt('工具执行失败：' + (e && e.message || e));
  }
}

async function callToolInner(name, args) {
  switch (name) {
    case 'poster_editor': {
      const f = path.join(ASSETS, 'editor', 'poster-editor.html');
      if (!fs.existsSync(f)) return txt('编辑器文件缺失：' + f);
      return txt('可编辑工作台：\n' + f + '\n\n浏览器直接打开即可（单文件、离线可用）。改完点「复制给 DSH」把 JSON 粘回对话，我按 id 合并。');
    }
    case 'poster_fonts': {
      const fonts = loadFonts();
      if (!fonts.length) return txt('字体库为空：' + path.join(ASSETS, 'fonts', 'fonts.json'));
      const scene = (args.scene || '').trim();
      const list = scene
        ? fonts.filter(f => (f.scenes || []).some(s => s.includes(scene)) ||
          (f.mood || []).some(s => s.includes(scene)) || (f.name || '').includes(scene))
        : fonts;
      const body = list.map(f =>
        `· ${f.name}（${f.license}）\n   文件：${f.file}\n   适合：${(f.scenes || []).join(' / ')}\n   气质：${(f.mood || []).join(' / ')}\n   字号：${f.sizeRange || '—'}\n   备注：${f.note || '—'}`
      ).join('\n');
      return txt(`共 ${fonts.length} 套，命中 ${list.length} 套：\n\n${body}`);
    }
    case 'poster_templates': {
      const f = path.join(ASSETS, 'templates', 'templates.json');
      if (!fs.existsSync(f)) return txt('无 templates.json');
      return txt(fs.readFileSync(f, 'utf8'));
    }
    case 'poster_qr': {
      const a = args || {};
      const map = { make: 'make_qr.py', verify: 'verify_qr.py', recolor: 'recolor_qr.py', batch: 'qr_batch.py' };
      const script = map[a.action];
      if (!script) return txt('未知 action：' + a.action);
      const argv = [];
      if (a.data) argv.push('--data', a.data);
      if (a.output) argv.push('--output', a.output);
      if (a.size) argv.push('--size', String(a.size));
      if (a.dir) argv.push('--dir', a.dir);
      if (a.fg) argv.push('--fg', a.fg);
      if (a.bg) argv.push('--bg', a.bg);
      if (a.input) argv.push('--input', a.input);
      const r = await py(script, argv);
      return txt((r.out || '') + (r.err ? '\n[stderr]\n' + r.err : '') + (r.code ? `\n[exit ${r.code}]` : ''));
    }
    case 'poster_cutout': {
      const argv = ['--input', args.input];
      if (args.output) argv.push('--output', args.output);
      if (args.up) argv.push('--up', String(args.up));
      const r = await py('cutout.py', argv);
      return txt((r.out || '') + (r.err ? '\n[stderr]\n' + r.err : '') + (r.code ? `\n[exit ${r.code}]` : ''));
    }
    case 'poster_detect_slots': {
      const argv = ['--image', args.image];
      if (args.out) argv.push('--out', args.out);
      if (args.color) argv.push('--color', args.color);
      if (args.maxSize) argv.push('--max-size', String(args.maxSize));
      const r = await py('detect_slots.py', argv);
      return txt((r.out || '') + (r.err ? '\n[stderr]\n' + r.err : '') + (r.code ? `\n[exit ${r.code}]` : ''));
    }
    case 'poster_compose': {
      const r = await py('compose.py', ['--job', args.job]);
      return txt((r.out || '') + (r.err ? '\n[stderr]\n' + r.err : '') + (r.code ? `\n[exit ${r.code}]` : ''));
    }
    case 'poster_generate': {
      const client = path.join(ROOT, 'python', 'comfy_client.py');
      const argv = ['--prompt', args.prompt, '--out', args.out];
      if (args.w) argv.push('--w', String(args.w));
      if (args.h) argv.push('--h', String(args.h));
      if (args.seed != null) argv.push('--seed', String(args.seed));
      if (args.steps) argv.push('--steps', String(args.steps));
      if (args.host) argv.push('--host', args.host);
      if (Array.isArray(args.refs) && args.refs.length) {
        const r = await run(PY, [path.join(ROOT, 'python', 'flux_i2i.py'), '--refs', ...args.refs,
          '--prompt', args.prompt, '--out', args.out,
          ...(args.seed != null ? ['--seed', String(args.seed)] : []),
          ...(args.host ? ['--port', args.host.split(':').pop()] : [])]);
        return txt((r.out || '') + (r.err ? '\n[stderr]\n' + r.err : '') + (r.code ? `\n[exit ${r.code}]` : ''));
      }
      const r = await run(PY, [client, ...argv]);
      return txt((r.out || '') + (r.err ? '\n[stderr]\n' + r.err : '') + (r.code ? `\n[exit ${r.code}]` : ''));
    }
    default:
      return txt('未知工具：' + name);
  }
}

/* ───────────── JSON-RPC over stdio ───────────── */
const send = (o) => process.stdout.write(JSON.stringify(o) + '\n');

let buf = '';
let chain = Promise.resolve();

function drain() {
  chain = chain.then(async () => {
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch (e) { continue; }
      await handle(msg);
    }
  }).catch(e => log('drain error', e && e.message));
  return chain;
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', d => { buf += d; drain(); });

process.stdin.on('end', () => {
  chain = chain.then(async () => {
    const rest = buf.trim();
    buf = '';
    if (!rest) return;
    // 最后一行可能没换行；也可能是若干行都没换行结尾，逐行兜底
    for (const line of rest.split('\n')) {
      const s = line.trim();
      if (!s) continue;
      try { await handle(JSON.parse(s)); } catch (e) { }
    }
  }).catch(() => { });
});

async function handle(msg) {
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;
  try {
    if (method === 'initialize') {
      send({
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: (params && params.protocolVersion) || '2024-11-05',
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'poster-forge', version: '0.1.0' }
        }
      });
      return;
    }
    if (method === 'notifications/initialized' || method === 'initialized') return;
    if (method === 'ping') { if (!isNotification) send({ jsonrpc: '2.0', id, result: {} }); return; }
    if (method === 'tools/list') { send({ jsonrpc: '2.0', id, result: { tools: TOOLS } }); return; }
    if (method === 'tools/call') {
      const name = params && params.name;
      const args = (params && params.arguments) || {};
      const res = await callTool(name, args);
      send({ jsonrpc: '2.0', id, result: res });
      return;
    }
    if (!isNotification) send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found: ' + method } });
  } catch (e) {
    log('ERR', method, e && e.message);
    if (!isNotification) send({ jsonrpc: '2.0', id, error: { code: -32603, message: String(e && e.message || e) } });
  }
}
log('ready · python=' + PY + ' root=' + ROOT);
