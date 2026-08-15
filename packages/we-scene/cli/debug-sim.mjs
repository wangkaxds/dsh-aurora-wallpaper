// 调试：我的渲染 vs WE 官方 preview 的区域相似度对比
import { readFileSync } from 'node:fs'
import { decodePng } from '../src/pkg/png.js'

const mine = decodePng(readFileSync(process.argv[2] || 'D:/杂活/we-scene-out/frame-2423807815.png'))
const prev = decodePng(readFileSync('D:/杂活/we-scene-out/preview-frame.png'))
const S = 256
// 我的渲染缩到 256x256（最近邻）
const mineS = new Uint8Array(S * S * 4)
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const sx = Math.floor((x / S) * mine.width)
    const sy = Math.floor((y / S) * mine.height)
    const o = (sy * mine.width + sx) * 4
    const d = (y * S + x) * 4
    mineS[d] = mine.rgba[o]
    mineS[d + 1] = mine.rgba[o + 1]
    mineS[d + 2] = mine.rgba[o + 2]
    mineS[d + 3] = mine.rgba[o + 3]
  }
}

const regions = {
  '立绘区(x0.60-1.0)': [0.6, 1.0, 0, 1.0],
  '左空白区(x0-0.3)': [0, 0.3, 0, 1.0],
  '中上条带区': [0.3, 0.6, 0.1, 0.45],
  'logo区(中下)': [0.3, 0.7, 0.75, 1.0],
  '全图': [0, 1, 0, 1],
}
for (const [name, [x0, x1, y0, y1]] of Object.entries(regions)) {
  let sum = 0
  let n = 0
  for (let y = Math.floor(y0 * S); y < Math.floor(y1 * S); y += 2) {
    for (let x = Math.floor(x0 * S); x < Math.floor(x1 * S); x += 2) {
      const o = (y * S + x) * 4
      sum += Math.abs(mineS[o] - prev.rgba[o]) + Math.abs(mineS[o + 1] - prev.rgba[o + 1]) + Math.abs(mineS[o + 2] - prev.rgba[o + 2])
      n++
    }
  }
  console.log(name + ' 平均色差=' + (sum / n).toFixed(1))
}
