// 对比两个 PNG 是否逐像素一致
import { readFileSync } from 'node:fs'
import { decodePng } from '../src/pkg/png.js'

const [f1, f2] = process.argv.slice(2)
const a = decodePng(readFileSync(f1))
const b = decodePng(readFileSync(f2))
console.log('尺寸: ' + a.width + 'x' + a.height + ' vs ' + b.width + 'x' + b.height)
let diff = 0
const n = Math.min(a.rgba.length, b.rgba.length)
for (let i = 0; i < n; i++) {
  if (a.rgba[i] !== b.rgba[i]) diff++
}
console.log('差异字节: ' + diff + '/' + n + (diff === 0 ? ' → 完全一致' : ''))
