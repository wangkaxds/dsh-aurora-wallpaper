// 调试：互相关追踪 preview 动画中条带内容的滚动方向
import { readFileSync } from 'node:fs'
import { decodePng } from '../src/pkg/png.js'

const dir = 'D:/杂活/we-scene-out/preview-frames/'
const f0 = decodePng(readFileSync(dir + 'f01.png'))
const f1 = decodePng(readFileSync(dir + 'f10.png'))
const W = f0.width
const H = f0.height

function lum(p, x, y) {
  const o = (y * W + x) * 4
  return p.rgba[o] + p.rgba[o + 1] + p.rgba[o + 2]
}

// 纵向条带：列 x=40（屏幕 x 300 附近），行 30..120（避开上下边框），互相关找 dy
function trackVertical(p0, p1) {
  const x = 40
  const y0 = 30
  const y1 = 120
  const a = []
  const b = []
  for (let y = y0; y < y1; y++) {
    a.push(lum(p0, x, y))
    b.push(lum(p1, x, y))
  }
  const n = a.length
  let best = -1
  let bestShift = 0
  for (let dy = -12; dy <= 12; dy++) {
    let s = 0
    let c = 0
    for (let i = 0; i < n; i++) {
      const j = i + dy
      if (j < 0 || j >= n) continue
      s += Math.abs(a[i] - b[j])
      c++
    }
    const score = s / c // 越小越相似
    if (best < 0 || score < best) {
      best = score
      bestShift = dy
    }
  }
  return bestShift
}

// 横向条带：行 y=40（屏幕 y 300 附近），列 60..200，互相关找 dx
function trackHorizontal(p0, p1) {
  const y = 40
  const x0 = 60
  const x1 = 200
  const a = []
  const b = []
  for (let x = x0; x < x1; x++) {
    a.push(lum(p0, x, y))
    b.push(lum(p1, x, y))
  }
  const n = a.length
  let best = -1
  let bestShift = 0
  for (let dx = -20; dx <= 20; dx++) {
    let s = 0
    let c = 0
    for (let i = 0; i < n; i++) {
      const j = i + dx
      if (j < 0 || j >= n) continue
      s += Math.abs(a[i] - b[j])
      c++
    }
    const score = s / c
    if (best < 0 || score < best) {
      best = score
      bestShift = dx
    }
  }
  return bestShift
}

const dy = trackVertical(f0, f1)
const dx = trackHorizontal(f0, f1)
console.log('纵向条带内容位移 dy=' + dy + (dy > 0 ? '（内容向下移动）' : dy < 0 ? '（内容向上移动）' : '（无位移）'))
console.log('横向条带内容位移 dx=' + dx + (dx > 0 ? '（内容向右移动）' : dx < 0 ? '（内容向左移动）' : '（无位移）'))
console.log('')
console.log('我的公式预测：纵向 speedy=+0.07 → 内容向上；横向 speedx=-0.06 → 内容向左')
