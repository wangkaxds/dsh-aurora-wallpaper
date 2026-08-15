// 调试：定位两图第一个差异像素并打印双方数值
import { readFileSync } from 'node:fs'
import { decodePng } from '../src/pkg/png.js'

const [f1, f2] = process.argv.slice(2)
const a = decodePng(readFileSync(f1))
const b = decodePng(readFileSync(f2))
console.log('尺寸: ' + a.width + 'x' + a.height + ' vs ' + b.width + 'x' + b.height)
const n = Math.min(a.rgba.length, b.rgba.length)
let first = -1
let count = 0
let maxD = 0
for (let i = 0; i < n; i++) {
  const d = Math.abs(a.rgba[i] - b.rgba[i])
  if (d > 0) {
    count++
    if (d > maxD) maxD = d
    if (first < 0) first = i
  }
}
console.log('差异字节: ' + count + '/' + n + ' maxDiff=' + maxD)
if (first >= 0) {
  const px = Math.floor(first / 4)
  const x = px % a.width
  const y = Math.floor(px / a.width)
  console.log('第一个差异像素 @(' + x + ',' + y + ')  参考=[' + [...a.rgba.slice(px * 4, px * 4 + 4)] + ']  我方=[' + [...b.rgba.slice(px * 4, px * 4 + 4)] + ']')
}
