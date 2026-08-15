// 调试：追踪 Makima preview 的水流位移速率 + 蕾塞条带多帧斜率验证
import { readFileSync } from 'node:fs'
import { decodePng } from '../src/pkg/png.js'

function lum(p, x, y) {
  const o = (y * p.width + x) * 4
  return p.rgba[o] + p.rgba[o + 1] + p.rgba[o + 2]
}

function track(p0, p1, x0, x1, y0, y1, vertical) {
  const a = []
  const b = []
  if (vertical) {
    const x = Math.floor((x0 + x1) / 2)
    for (let y = y0; y < y1; y++) {
      a.push(lum(p0, x, y))
      b.push(lum(p1, x, y))
    }
  } else {
    const y = Math.floor((y0 + y1) / 2)
    for (let x = x0; x < x1; x++) {
      a.push(lum(p0, x, y))
      b.push(lum(p1, x, y))
    }
  }
  const n = a.length
  let best = -1
  let bestShift = 0
  const range = vertical ? 12 : 25
  for (let d = -range; d <= range; d++) {
    let s = 0
    let c = 0
    for (let i = 0; i < n; i++) {
      const j = i + d
      if (j < 0 || j >= n) continue
      s += Math.abs(a[i] - b[j])
      c++
    }
    const score = s / c
    if (best < 0 || score < best) {
      best = score
      bestShift = d
    }
  }
  return bestShift
}

// ---- Makima 水流：25 帧 / 2.5s，追踪全图位移 ----
const dir = 'D:/杂活/we-scene-out/makima-preview/'
const frames = []
for (let i = 1; i <= 25; i += 4) {
  frames.push(decodePng(readFileSync(dir + 'f' + String(i).padStart(2, '0') + '.png')))
}
console.log('Makima preview 帧数=' + frames.length + '（间隔 4 帧=0.4s，' + frames[0].width + 'x' + frames[0].height + '）')
for (let i = 1; i < frames.length; i++) {
  const dy = track(frames[0], frames[i], 40, 216, 40, 216, true)
  const dx = track(frames[0], frames[i], 40, 216, 40, 216, false)
  console.log('帧' + i + ': dy=' + dy + ' dx=' + dx)
}

// ---- 蕾塞横条带：多帧斜率验证 ----
console.log('')
console.log('--- 蕾塞横向条带（行 y=40，列 60-200）---')
const rezeDir = 'D:/杂活/we-scene-out/preview-frames/'
const r0 = decodePng(readFileSync(rezeDir + 'f01.png'))
for (const n of [5, 10, 15, 20]) {
  const rf = decodePng(readFileSync(rezeDir + 'f' + String(n).padStart(2, '0') + '.png'))
  const dx = track(r0, rf, 60, 200, 40, 40, false)
  console.log('帧' + n + '（' + (n * 0.12).toFixed(1) + 's）: dx=' + dx)
}
