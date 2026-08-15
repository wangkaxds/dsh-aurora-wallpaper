// 本地静态服务器：node cli/serve.mjs → http://localhost:8123/demo/
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const port = 8123
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}

createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    if (urlPath === '/') {
      res.writeHead(302, { Location: '/demo/' })
      res.end()
      return
    }
    let rel = urlPath.replace(/^\/+/, '') || 'demo/index.html'
    if (rel.endsWith('/')) rel += 'index.html'
    const file = join(root, rel)
    if (!file.startsWith(root)) {
      res.writeHead(403)
      res.end()
      return
    }
    const data = await readFile(file)
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' })
    res.end(data)
  } catch (e) {
    res.writeHead(404)
    res.end('not found')
  }
}).listen(port, () => {
  console.log('we-scene 演示: http://localhost:' + port + '/demo/')
})
