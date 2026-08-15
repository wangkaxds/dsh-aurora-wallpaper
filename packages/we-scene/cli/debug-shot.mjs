// 调试：定位用户截图中的白色横幅带与紫色背景区域
import { readFileSync } from 'node:fs'
import { decodePng } from '../src/pkg/png.js'

const p = decodePng(readFileSync(process.argv[2]))
const W = p.width
const H = p.height
console.log('截图: ' + W + 'x' + H)

// 白色像素行分布（漫画横幅 = 白色背景）
for (let y = 0; y < H; y += 1) {
  let white = 0
  for (let x = 0; x < W; x += 2) {
    const o = (y * W + x) * 4
    if (p.rgba[o] > 230 && p.rgba[o + 1] > 230 && p.rgba[o + 2] > 230) white++
  }
  if (white > W / 2 * 0.15) console.log('y=' + y + ' 白色像素=' + white)
}

// 紫色背景分布
let purpleY = []
for (let y = 0; y < H; y += 3) {
  let pu = 0
  for (let x = 0; x < W; x += 3) {
    const o = (y * W + x) * 4
    if (Math.abs(p.rgba[o] - 77) < 12 && Math.abs(p.rgba[o + 1] - 54) < 12 && Math.abs(p.rgba[o + 2] - 140) < 12) pu++
  }
  if (pu > (W / 3) * 0.3) purpleY.push(y)
}
console.log('紫色背景行范围: y[' + (purpleY.length ? Math.min(...purpleY) + ',' + Math.max(...purpleY) : '无') + ']')
