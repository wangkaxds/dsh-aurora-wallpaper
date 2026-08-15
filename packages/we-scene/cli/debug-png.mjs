// 调试：检查 PNG 的颜色类型与头几个像素
import { readFileSync } from 'node:fs'
import { decodePng } from '../src/pkg/png.js'

for (const f of process.argv.slice(2)) {
  const buf = readFileSync(f)
  const colorType = buf[25]
  const bitDepth = buf[24]
  const w = buf.readUInt32BE(16)
  const h = buf.readUInt32BE(20)
  console.log(f.split(/[\\/]/).pop(), w + 'x' + h, 'bitDepth=' + bitDepth, 'colorType=' + colorType)
  const img = decodePng(buf)
  console.log('  px0:', [...img.rgba.slice(0, 8)], ' px100:', [...img.rgba.slice(400, 408)], ' px1M:', [...img.rgba.slice(4 * 1000000, 4 * 1000000 + 8)])
}
