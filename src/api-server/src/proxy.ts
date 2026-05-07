import type { IncomingMessage, ServerResponse } from 'http'
import https from 'https'
import http from 'http'
import { URL } from 'url'

const UPSTREAMS: Record<string, string> = {
  helius: 'https://mainnet.helius-rpc.com',
  openrouter: 'https://openrouter.ai/api',
}

// URL shape: /<provider>/<keyName>[/<...path>][?<query>]
export async function proxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  loadApiKey: (name: string) => Promise<string>
): Promise<void> {
  const parts = (req.url ?? '/').split('?')
  const segments = parts[0].split('/').filter(Boolean)
  const [provider, keyName, ...rest] = segments

  const base = UPSTREAMS[provider]
  if (!base) { res.writeHead(404); res.end(`Unknown provider: ${provider}`); return }

  let apiKey: string
  try { apiKey = await loadApiKey(keyName) }
  catch (e: any) { res.writeHead(400); res.end(e.message); return }

  const upstreamUrl = new URL('/' + rest.join('/') + (parts[1] ? '?' + parts[1] : ''), base)

  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(req.headers)) {
    if (k === 'host') continue
    if (v != null) headers[k] = Array.isArray(v) ? v.join(', ') : v
  }

  if (provider === 'helius') {
    upstreamUrl.searchParams.set('api-key', apiKey)
  } else {
    headers['authorization'] = `Bearer ${apiKey}`
  }

  const body = await readBody(req)
  const client = upstreamUrl.protocol === 'https:' ? https : http
  const upReq = client.request(upstreamUrl, { method: req.method, headers }, (upRes) => {
    res.writeHead(upRes.statusCode ?? 200, upRes.headers as Record<string, string>)
    upRes.pipe(res)
  })
  upReq.on('error', (e) => { res.writeHead(502); res.end(e.message) })
  if (body) upReq.write(body)
  upReq.end()
}

function readBody(req: IncomingMessage): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(chunks.length ? Buffer.concat(chunks) : null))
  })
}
