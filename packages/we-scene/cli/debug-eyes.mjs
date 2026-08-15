// 调试：对比立绘两个候选区域的暗像素密度，判定眼睛位置
import { readFileSync } from 'node:fs'
import { decodePng } from '../src/pkg/png.js'

const p = decodePng(readFileSync('D:/杂活/we-scene-out/2423807815-png/materials__reze full main.png'))
const W = p.width
const H = p.height

// 候选区域（归一化）：A = 蒙版坐标直接映射（比例1），B = 蒙版坐标×0.5（比例2）
const regions = {
  '比例1(右侧 0.586-0.716, 0.125-0.165)': [0.586, 0.716, 0.125, 0.165],
  '比例2(左侧 0.293-0.358, 0.063-0.083)': [0.293, 0.358, 0.063, 0.083],
  '比例2b(左侧 0.293-0.358, 0.125-0.165)': [0.293, 0.358, 0.125, 0.165],
  '中间(0.44-0.56, 0.125-0.165)': [0.44, 0.56, 0.125, 0.165],
}
for (const [name, [x0, x1, y0, y1]] of Object.entries(regions)) {
  let dark = 0
  let total = 0
  let colored = 0
  for (let y = Math.floor(y0 * H); y < Math.floor(y1 * H); y++) {
    for (let x = Math.floor(x0 * W); x < Math.floor(x1 * W); x++) {
      const o = (y * W + x) * 4
      const r = p.rgba[o]
      const g = p.rgba[o + 1]
      const b = p.rgba[o + 2]
      const a = p.rgba[o + 3]
      total++
      if (a < 50) continue
      colored++
      if (r < 80 && g < 80 && b < 80) dark++
    }
  }
  console.log(name + '  暗像素=' + dark + '  着色像素=' + colored + '/' + total + '  暗占比=' + (dark / Math.max(1, colored) * 100).toFixed(1) + '%')
}
