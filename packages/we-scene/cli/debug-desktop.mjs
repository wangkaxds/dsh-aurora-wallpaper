// 分析用户桌面截图：定位演示画布区域与黑色边条位置
import { readFileSync } from 'node:fs'
import { decodePng } from '../src/pkg/png.js'

const p = decodePng(readFileSync(process.argv[2]))
const W = p.width
const H = p.height
console.log('截图尺寸: ' + W + 'x' + H)

// 1) 找紫色背景区域（演示页画布）
let minX = 1e9
let minY = 1e9
let maxX = -1
let maxY = -1
let count = 0
for (let y = 0; y < H; y += 3) {
  for (let x = 0; x < W; x += 3) {
    const o = (y * W + x) * 4
    const r = p.rgba[o]
    const g = p.rgba[o + 1]
    const b = p.rgba[o + 2]
    if (Math.abs(r - 77) < 10 && Math.abs(g - 54) < 10 && Math.abs(b - 140) < 10) {
      count++
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
}
console.log('紫色区域: x[' + minX + ',' + maxX + '] y[' + minY + ',' + maxY + '] 样本=' + count)

// 2) 在紫色区域内找黑色边条（颜色≈2,1,4）
if (count > 1000) {
  let bx0 = 1e9
  let by0 = 1e9
  let bx1 = -1
  let by1 = -1
  let bn = 0
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const o = (y * W + x) * 4
      const r = p.rgba[o]
      const g = p.rgba[o + 1]
      const b = p.rgba[o + 2]
      if (r < 12 && g < 10 && b < 14) {
        bn++
        if (x < bx0) bx0 = x
        if (x > bx1) bx1 = x
        if (y < by0) by0 = y
        if (y > by1) by1 = y
      }
    }
  }
  console.log('黑边条区域: x[' + bx0 + ',' + bx1 + '] y[' + by0 + ',' + by1 + '] 样本=' + bn)
  const cw = maxX - minX
  const ch = maxY - minY
  console.log('画布相对位置: 黑边条 x[' + ((bx0 - minX) / cw).toFixed(2) + ',' + ((bx1 - minX) / cw).toFixed(2) + '] y[' + ((by0 - minY) / ch).toFixed(2) + ',' + ((by1 - minY) / ch).toFixed(2) + ']')
}
