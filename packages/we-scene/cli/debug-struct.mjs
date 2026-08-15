// 调试：立绘顶部区域的透明/暗/亮结构图
import { readFileSync } from 'node:fs'
import { decodePng } from '../src/pkg/png.js'

const file = process.argv[2] || 'D:/杂活/we-scene-out/2423807815-png/materials__reze full main.png'
const CW = Number(process.argv[3] || 60)
const CH = Number(process.argv[4] || 10)
const Y0 = Number(process.argv[5] || 0)
const Y1 = Number(process.argv[6] || 0.2)
const p = decodePng(readFileSync(file))
const W = p.width
const H = p.height
const y0 = Math.floor(Y0 * H)
const y1 = Math.floor(Y1 * H)
for (let ry = 0; ry < CH; ry++) {
  let line = ''
  for (let rx = 0; rx < CW; rx++) {
    let dark = 0
    let bright = 0
    let op = 0
    let n = 0
    const ys = y0 + Math.floor((ry * (y1 - y0)) / CH)
    const ye = y0 + Math.floor(((ry + 1) * (y1 - y0)) / CH)
    const xs = Math.floor((rx * W) / CW)
    const xe = Math.floor(((rx + 1) * W) / CW)
    for (let y = ys; y < ye; y += 2) {
      for (let x = xs; x < xe; x += 2) {
        const o = (y * W + x) * 4
        const r = p.rgba[o]
        const g = p.rgba[o + 1]
        const b = p.rgba[o + 2]
        const a = p.rgba[o + 3]
        n++
        if (a < 50) continue
        op++
        const lum = r + g + b
        if (lum < 240) dark++
        if (lum > 600) bright++
      }
    }
    if (op < n * 0.1) line += '.'
    else if (bright > dark) line += '░'
    else line += '█'
  }
  console.log(line)
}
