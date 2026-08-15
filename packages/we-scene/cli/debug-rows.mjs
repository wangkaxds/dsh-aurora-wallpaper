// 调试：按行统计暗像素，定位横向黑线
import { readFileSync } from 'node:fs'
import { decodePng } from '../src/pkg/png.js'

const p = decodePng(readFileSync(process.argv[2]))
const W = p.width
const H = p.height
const out = []
for (let y = 0; y < H; y++) {
  let dark = 0
  for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4
    if (p.rgba[o] < 12 && p.rgba[o + 1] < 10) dark++
  }
  if (dark > W * 0.15) out.push('y=' + y + ' 暗像素=' + dark)
}
console.log(out.length ? out.join('\n') : '(无长横线)')
