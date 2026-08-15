// 调试：量化 Makima 水流蒙版数值分布 + 我的渲染位移幅度
import { readFileSync } from 'node:fs'
import { decodePng } from '../src/pkg/png.js'

// 1) 水流蒙版（RG88 → 我的解码：gray=G, alpha=R；flow = (R,G) = (alpha, gray)）
const p = decodePng(readFileSync('D:/杂活/we-scene-out/2884796594-png/materials__masks__waterflow_mask_d3b76329.png'))
let hist = new Array(10).fill(0)
let maxD = 0
let sumD = 0
let n = 0
for (let y = 0; y < p.height; y += 4) {
  for (let x = 0; x < p.width; x += 4) {
    const o = (y * p.width + x) * 4
    const R = p.rgba[o + 3] / 255
    const G = p.rgba[o] / 255
    const mx = (R - 0.498) * 2
    const my = (G - 0.498) * 2
    const d = Math.hypot(mx, my)
    sumD += d
    n++
    if (d > maxD) maxD = d
    const bin = Math.min(9, Math.floor(d * 10))
    hist[bin]++
  }
}
console.log('水流蒙版 flow 矢量幅度：均值=' + (sumD / n).toFixed(4) + ' 最大=' + maxD.toFixed(3))
console.log('分布(0~1.4,10档):', hist.map((v, i) => (i / 10).toFixed(1) + ':' + v).join(' '))

// 理论位移 = flow × strength×0.1 × 半幅±0.5 → 最大像素 = maxD × 0.01 × 0.5 × 3840
console.log('理论最大位移: ' + (maxD * 0.01 * 0.5 * 3840).toFixed(1) + 'px（3840 宽下）')
