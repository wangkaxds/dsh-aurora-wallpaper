// 调试：定位 DXT 块级差异。用法: node cli/debug-dxt.mjs <tex> <参考png> <我方png>
import { readFileSync } from 'node:fs'
import { parseTex } from '../src/pkg/texture.js'
import { decodePng } from '../src/pkg/png.js'

const [texPath, refPng, myPng] = process.argv.slice(2)
const tex = parseTex(readFileSync(texPath))
const m = tex.images[0][0]
const ref = decodePng(readFileSync(refPng))
const mine = decodePng(readFileSync(myPng))

console.log('tex fmt=' + tex.formatName + ' mip0=' + m.width + 'x' + m.height + ' tex=' + tex.width + 'x' + tex.height +
  ' refPng=' + ref.width + 'x' + ref.height + ' myPng=' + mine.width + 'x' + mine.height)

// 找第一个差异像素
let fx = -1
let fy = -1
const n = Math.min(ref.rgba.length, mine.rgba.length)
for (let i = 0; i < n; i++) {
  if (ref.rgba[i] !== mine.rgba[i]) {
    const px = Math.floor(i / 4)
    fx = px % ref.width
    fy = Math.floor(px / ref.width)
    break
  }
}
if (fx < 0) {
  console.log('两图完全一致')
  process.exit(0)
}
console.log('首个差异像素 @(' + fx + ',' + fy + ') 参考=' + [...ref.rgba.slice((fy * ref.width + fx) * 4, (fy * ref.width + fx) * 4 + 4)] +
  ' 我方=' + [...mine.rgba.slice((fy * ref.width + fx) * 4, (fy * ref.width + fx) * 4 + 4)])

// 所在 4x4 块
const bx = Math.floor(fx / 4)
const by = Math.floor(fy / 4)
const bw = Math.ceil(m.width / 4)
const blockOff = (by * bw + bx) * 16
const raw = m.data.subarray(blockOff, blockOff + 16)
console.log('块(' + bx + ',' + by + ') 原始 16 字节: [' + [...raw].map((b) => b.toString(16).padStart(2, '0')).join(' ') + ']')
if (tex.format === 4) {
  const a0 = raw[0]
  const a1 = raw[1]
  const abits = raw[2] | (raw[3] << 8) | (raw[4] << 16)
  const c0 = raw[8] | (raw[9] << 8)
  const c1 = raw[10] | (raw[11] << 8)
  const bits = raw[12] | (raw[13] << 8) | (raw[14] << 16)
  console.log('a0=' + a0 + ' a1=' + a1 + ' abits=0x' + abits.toString(16) + ' c0=0x' + c0.toString(16) + ' c1=0x' + c1.toString(16) + ' bits=0x' + bits.toString(16))
  const idx = (bits >> (((fy % 4) * 4 + (fx % 4)) * 2)) & 3
  const aidx = (abits >> ((fy % 4) * 4 + (fx % 4)) * 3) & 7
  console.log('差异像素 colorIdx=' + idx + ' alphaIdx=' + aidx)
}
console.log('参考块 16 像素:')
for (let y = 0; y < 4; y++) {
  const row = []
  for (let x = 0; x < 4; x++) {
    const px = bx * 4 + x
    const py = by * 4 + y
    if (px >= ref.width || py >= ref.height) { row.push('-----'); continue }
    row.push([...ref.rgba.slice((py * ref.width + px) * 4, (py * ref.width + px) * 4 + 4)].join(','))
  }
  console.log('  ' + row.join('  '))
}
console.log('我方块 16 像素:')
for (let y = 0; y < 4; y++) {
  const row = []
  for (let x = 0; x < 4; x++) {
    const px = bx * 4 + x
    const py = by * 4 + y
    if (px >= mine.width || py >= mine.height) { row.push('-----'); continue }
    row.push([...mine.rgba.slice((py * mine.width + px) * 4, (py * mine.width + px) * 4 + 4)].join(','))
  }
  console.log('  ' + row.join('  '))
}
