// 调试：查看 waterflowphase 纹理内容（32x32）
import { readFileSync } from 'node:fs'
import { decodePng } from '../src/pkg/png.js'

const p = decodePng(readFileSync('D:/杂活/we-scene-out/2884796594-png/materials__effects__waterflowphase.png'))
console.log('尺寸: ' + p.width + 'x' + p.height)
console.log('角点(31,31) r=' + p.rgba[(31 * p.width + 31) * 4] + ' g=' + p.rgba[(31 * p.width + 31) * 4 + 1])
console.log('(0,0) r=' + p.rgba[0] + ' (16,16) r=' + p.rgba[(16 * p.width + 16) * 4])
// 全图 r 值分布
let hist = new Array(8).fill(0)
for (let y = 0; y < p.height; y++) {
  for (let x = 0; x < p.width; x++) {
    const v = p.rgba[(y * p.width + x) * 4]
    hist[Math.min(7, Math.floor(v / 32))]++
  }
}
console.log('r 值分布(0-255, 8档):', hist.join(' '))
// ASCII 图
for (let y = 0; y < p.height; y += 2) {
  let line = ''
  for (let x = 0; x < p.width; x += 2) {
    const v = p.rgba[(y * p.width + x) * 4]
    line += v > 200 ? '█' : v > 120 ? '▒' : v > 40 ? '░' : ' '
  }
  console.log(line)
}
