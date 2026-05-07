import http from 'http'
import { randomBytes } from 'crypto'
import { loadKey, storeKey } from './vault.js'
import { proxyRequest } from './proxy.js'

const PORT = Number(process.env.PORT) || 3000
const DEV_TOKEN = process.env.KS_TOKEN ?? randomBytes(16).toString('hex')

const server = http.createServer(async (req, res) => {
  const token = req.headers['x-ks-token']
  if (token !== DEV_TOKEN) { res.writeHead(401); res.end('Unauthorized'); return }

  const password = req.headers['x-ks-password'] as string | undefined
  if (!password) { res.writeHead(400); res.end('Missing x-ks-password'); return }

  // POST /admin/store?name=<keyName>  body = raw API key
  if (req.method === 'POST' && req.url?.startsWith('/admin/store')) {
    const url = new URL(req.url, `http://localhost`)
    const name = url.searchParams.get('name')
    if (!name) { res.writeHead(400); res.end('Missing ?name='); return }
    const body = await readBody(req)
    if (!body) { res.writeHead(400); res.end('Empty body'); return }
    try {
      storeKey(name, body.toString('utf8').trim(), password)
      res.writeHead(200); res.end('stored')
    } catch (e: any) { res.writeHead(500); res.end(e.message) }
    return
  }

  // Everything else: proxy
  await proxyRequest(req, res, (name) => Promise.resolve(loadKey(name, password)))
})

server.listen(PORT, () => {
  console.log(`KeyShield proxy  http://localhost:${PORT}`)
  console.log(`Dev token        ${DEV_TOKEN}`)
})

function readBody(req: http.IncomingMessage): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(chunks.length ? Buffer.concat(chunks) : null))
  })
}
