// 调试：对比 WE 预览与我的渲染中，手臂区域 vs 身体区域的相对位移
import { readFileSync } from 'node:fs'
import { decodePng } from '../src/pkg/png.js'

function lum(p, x, y) {
  const o = (y * p.width + x) * 4
  return p.rgba[o] + p.rgba[o + 1] + p.rgba[o + 2]
}

// 小窗口互相关（区域局部位移）
function trackWin(p0, p1, x0, y0, w, h, range) {
  const a = []
  const b = []
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      a.push(lum(p0, x, y))
      b.push(lum(p1, x, y))
    }
  }
  const n = a.length
  const bw = w
  let best = 1e18
  let bestDx = 0
  let bestDy = 0
  for (let dy = -range; dy <= range; dy++) {
    for (let dx = -range; dx <= range; dx++) {
      let s = 0
      let c = 0
      for (let i = 0; i < n; i++) {
        const ix = i % bw
        const iy = Math.floor(i / bw)
        const jx = ix + dx
        const jy = iy + dy
        if (jx < 0 || jx >= bw || jy < 0 || jy >= h) continue
        s += Math.abs(a[i] - b[jy * bw + jx])
        c++
      }
      const score = s / c
      if (score < best) {
        best = score
        bestDx = dx
        bestDy = dy
      }
    }
  }
  return { dx: bestDx, dy: bestDy, conf: best }
}

// WE 预览：蕾塞场景，33 帧 / 3.96s。身体+手臂在预览 x 154-255（屏幕 1155-1915）
const p0 = decodePng(readFileSync('D:/杂活/we-scene-out/preview-frames/f01.png'))
const p1 = decodePng(readFileSync('D:/杂活/we-scene-out/preview-frames/f11.png'))
console.log('WE 预览（帧1 vs 帧11，间隔约 1.2s）：')
console.log('  手臂区域(预览x190-220,y80-110):', JSON.stringify(trackWin(p0, p1, 190, 80, 30, 30, 5)))
console.log('  身体区域(预览x160-190,y60-100):', JSON.stringify(trackWin(p0, p1, 160, 60, 30, 40, 5)))
console.log('  头部区域(预览x180-210,y20-50):', JSON.stringify(trackWin(p0, p1, 180, 20, 30, 30, 5)))
