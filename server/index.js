#!/usr/bin/env node
// PosterForge · MCP stdio 服务器（给任意 MCP 客户端用）
// DSH 作为插件加载时走 lib/index.js，两份共用 lib/core.js 的实现。
import { TOOLS, callTool } from '../lib/core.js'

const send = (o) => process.stdout.write(JSON.stringify(o) + '\n')
const log = (...a) => console.error('[poster-forge]', ...a)

let buf = ''
let chain = Promise.resolve()

function drain() {
  chain = chain.then(async () => {
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (!line) continue
      let msg
      try { msg = JSON.parse(line) } catch { continue }
      await handle(msg)
    }
  }).catch((e) => log('drain error', e && e.message))
  return chain
}

async function handle(msg) {
  const { id, method, params } = msg
  const isNotification = id === undefined || id === null
  try {
    if (method === 'initialize') {
      send({
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: (params && params.protocolVersion) || '2024-11-05',
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'poster-forge', version: '0.1.0' },
        },
      })
      return
    }
    if (method === 'notifications/initialized' || method === 'initialized') return
    if (method === 'ping') { if (!isNotification) send({ jsonrpc: '2.0', id, result: {} }); return }
    if (method === 'tools/list') {
      send({ jsonrpc: '2.0', id, result: { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.parameters })) } })
      return
    }
    if (method === 'tools/call') {
      const res = await callTool(params && params.name, (params && params.arguments) || {})
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: res.text }] } })
      return
    }
    if (!isNotification) send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found: ' + method } })
  } catch (e) {
    log('ERR', method, e && e.message)
    if (!isNotification) send({ jsonrpc: '2.0', id, error: { code: -32603, message: String((e && e.message) || e) } })
  }
}

process.stdin.setEncoding('utf8')
process.stdin.on('data', (d) => { buf += d; drain() })
process.stdin.on('end', () => {
  chain = chain.then(async () => {
    const rest = buf.trim()
    buf = ''
    for (const line of rest.split('\n')) {
      const s = line.trim()
      if (!s) continue
      try { await handle(JSON.parse(s)) } catch { }
    }
  })
})

log('ready')
