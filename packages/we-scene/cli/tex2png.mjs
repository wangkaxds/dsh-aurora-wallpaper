// .tex → PNG 转换器：node cli/tex2png.mjs <.tex 文件或目录> <输出目录>
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'
import { deflateSync } from 'node:zlib'
import { parseTex, decodeMip0, FIF } from '../src/pkg/texture.js'
import { decodePng } from '../src/pkg/png.js'

const target = process.argv[2]
const outDir = process.argv[3] || '.'
if (!target) {
  console.log('用法: node cli/tex2png.mjs <.tex 文件或目录> <输出目录>')
  process.exit(1)
}

let files = []
if (statSync(target).isDirectory()) {
  files = readdirSync(target).filter((f) => f.toLowerCase().endsWith('.tex')).map((f) => join(target, f))
} else {
  files = [target]
}
mkdirSync(outDir, { recursive: true })

// ---- PNG 编码（RGBA8，filter 0） ----
function encodePng(rgba, w, h) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const raw = Buffer.alloc(h * (w * 4 + 1))
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1)
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))])
}

function chunk(type, data) {
  const t = Buffer.from(type, 'latin1')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0)
  return Buffer.concat([len, t, data, crc])
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

let ok = 0
const fails = []
const FIF_EXT = { 2: '.jpg', 13: '.png', 25: '.gif', 35: '.webp' }
for (const f of files) {
  const name = basename(f).replace(/\.tex$/i, '')
  try {
    const buf = readFileSync(f)
    const tex = parseTex(buf)
    const m = decodeMip0(tex)
    let outPath = join(outDir, name + '.png')
    if (m.video !== undefined) {
      outPath = join(outDir, name + '.mp4')
      writeFileSync(outPath, m.video)
      console.log('OK ' + name + '  ' + m.width + 'x' + m.height + '  fmt=' + tex.formatName + ' video=mp4(直通)')
    } else if (m.png !== undefined) {
      writeFileSync(outPath, m.png)
      console.log('OK ' + name + '  ' + m.width + 'x' + m.height + '  fmt=' + tex.formatName + ' fif=PNG(直通)')
    } else if (m.image !== undefined) {
      outPath = join(outDir, name + (FIF_EXT[m.fif] || '.bin'))
      writeFileSync(outPath, m.image)
      console.log('OK ' + name + '  ' + m.width + 'x' + m.height + '  fmt=' + tex.formatName + ' fif=' + m.fif + '(原始直通' + (FIF_EXT[m.fif] || '') + ')')
    } else {
      writeFileSync(outPath, encodePng(m.rgba, m.width, m.height))
      console.log('OK ' + name + '  ' + m.width + 'x' + m.height + '  fmt=' + tex.formatName)
    }
    ok++
  } catch (e) {
    fails.push(name + ': ' + String(e && e.message || e))
    console.log('FAIL ' + name + '  ' + String(e && e.message || e))
  }
}
console.log('\n成功 ' + ok + ' / ' + (ok + fails.length) + (fails.length ? '\n失败: ' + fails.join('\n') : ''))
