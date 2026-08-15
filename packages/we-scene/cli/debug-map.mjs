// 调试：ASCII 图显示立绘皮肤分布
import { readFileSync } from 'node:fs'
import { decodePng } from '../src/pkg/png.js'

const file = process.argv[2] || 'D:/杂活/we-scene-out/2423807815-png/materials__reze full main.png'
const CW = Number(process.argv[3] || 32)
const CH = Number(process.argv[4] || 16)
const Y0 = Number(process.argv[5] || 0)
const Y1 = Number(process.argv[6] || 1)
const p = decodePng(readFileSync(file))
const W = p.width
const H = p.height
const y0 = Math.floor(Y0 * H)
const y1 = Math.floor(Y1 * H)
for (let ry = 0; ry < CH; ry++) {
  let line = ''
  for (let rx = 0; rx < CW; rx++) {
    let skin = 0
    let n = 0
    for (let y = y0 + Math.floor(((ry * (y1 - y0)) / CH)); y < y0 + Math.floor(((ry + 1) * (y1 - y0)) / CH); y += 2) {
      for (let x = Math.floor((rx * W) / CW); x < Math.floor(((rx + 1) * W) / CW); x += 2) {
        const o = (y * W + x) * 4
        const r = p.rgba[o]
        const g = p.rgba[o + 1]
        const b = p.rgba[o + 2]
        const a = p.rgba[o + 3]
        if (a < 100) continue
        n++
        if (r > 140 && r > g + 10 && g > b + 5) skin++
      }
    }
    line += n === 0 ? ' ' : skin > n * 0.4 ? '█' : skin > n * 0.1 ? '▒' : '.'
  }
  console.log(line)
}
