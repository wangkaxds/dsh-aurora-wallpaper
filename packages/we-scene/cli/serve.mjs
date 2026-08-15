// 本地静态服务器：node cli/serve.mjs → http://localhost:8123/demo/
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildLibBundle } from '../src/bundle.js'

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

async function readFileUtf8(p) {
  return await readFile(p, 'utf8')
}

createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    if (urlPath === '/') {
      res.writeHead(302, { Location: '/demo/' })
      res.end()
      return
    }
    if (urlPath === '/we-assets/noise.png') {
      // 运行时读取本机壁纸引擎自带噪声（不打包、不分发）
      try {
        const data = await readFile('D:\\steam\\steamapps\\common\\wallpaper_engine\\assets\\materials\\util\\noise.png')
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' })
        res.end(data)
      } catch (e) {
        res.writeHead(404)
        res.end('noise not found')
      }
      return
    }
    if (urlPath === '/we-assets/noise.tex') {
      // 官方 util/noise.tex（含 mip 链）
      try {
        const data = await readFile('D:\\steam\\steamapps\\common\\wallpaper_engine\\assets\\materials\\util\\noise.tex')
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' })
        res.end(data)
      } catch (e) {
        res.writeHead(404)
        res.end('noise.tex not found')
      }
      return
    }
    if (urlPath.startsWith('/we-assets/shaders/')) {
      // WE shader 源文件（效果/层 shader 与公共头文件）：运行时读取本机安装，不分发
      const rel = urlPath.slice('/we-assets/shaders/'.length)
      if (!/^[A-Za-z0-9_./-]+$/.test(rel) || rel.includes('..')) {
        res.writeHead(403)
        res.end()
        return
      }
      try {
        const data = await readFile('D:\\steam\\steamapps\\common\\wallpaper_engine\\assets\\shaders\\' + rel)
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
        res.end(data)
      } catch (e) {
        res.writeHead(404)
        res.end('shader not found: ' + rel)
      }
      return
    }
    if (urlPath === '/lib.js') {
      // 渲染器打包模块（Harness 集成用同一套代码）
      const src = buildLibBundle((p) => readFileSyncSafe(p), root)
      res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' })
      res.end(src)
      return
    }
    if (urlPath === '/test-live.html') {
      const src = await readFileUtf8(join(root, 'demo/test-live.html'))
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(src)
      return
    }
    const pkgMatch = /^\/pkg\/(\d+)$/.exec(urlPath)
    if (pkgMatch) {
      const data = await readFile('D:\\steam\\steamapps\\workshop\\content\\431960\\' + pkgMatch[1] + '\\scene.pkg')
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' })
      res.end(data)
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
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' })
    res.end(data)
  } catch (e) {
    res.writeHead(404)
    res.end('not found')
  }
}).listen(port, () => {
  console.log('we-scene 演示: http://localhost:' + port + '/demo/')
})

import { readFileSync } from 'node:fs'
function readFileSyncSafe(p) {
  return readFileSync(p)
}
