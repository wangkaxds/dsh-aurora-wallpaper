// 调试：检查官方 util/noise 的 G 通道（摆动相位场）性质
import { readFileSync } from 'node:fs'
import { decodePng } from '../src/pkg/png.js'

const p = decodePng(readFileSync('D:/steam/steamapps/common/wallpaper_engine/assets/materials/util/noise.png'))
console.log('noise 尺寸: ' + p.width + 'x' + p.height)
// G 通道统计
let min = 255
let max = 0
let sum = 0
const vals = []
for (let y = 0; y < p.height; y++) {
  for (let x = 0; x < p.width; x++) {
    const g = p.rgba[(y * p.width + x) * 4 + 1]
    vals.push(g)
    sum += g
    if (g < min) min = g
    if (g > max) max = g
  }
}
console.log('G 通道: min=' + min + ' max=' + max + ' 均值=' + (sum / vals.length).toFixed(1))
// G 通道 ASCII 图（16x16）
console.log('G 通道结构图（█=高 . =低）:')
for (let ry = 0; ry < 16; ry++) {
  let line = ''
  for (let rx = 0; rx < 16; rx++) {
    let s = 0
    for (let y = ry * 16; y < (ry + 1) * 16; y++) {
      for (let x = rx * 16; x < (rx + 1) * 16; x++) {
        s += p.rgba[(y * p.width + x) * 4 + 1]
      }
    }
    const v = s / 256
    line += v > 200 ? '█' : v > 150 ? '▒' : v > 100 ? '░' : v > 50 ? '·' : ' '
  }
  console.log(line)
}
// R 通道同样
console.log('R 通道结构图:')
for (let ry = 0; ry < 16; ry++) {
  let line = ''
  for (let rx = 0; rx < 16; rx++) {
    let s = 0
    for (let y = ry * 16; y < (ry + 1) * 16; y++) {
      for (let x = rx * 16; x < (rx + 1) * 16; x++) {
        s += p.rgba[(y * p.width + x) * 4]
      }
    }
    const v = s / 256
    line += v > 200 ? '█' : v > 150 ? '▒' : v > 100 ? '░' : v > 50 ? '·' : ' '
  }
  console.log(line)
}
