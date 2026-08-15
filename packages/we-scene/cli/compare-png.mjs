// 交叉验证：逐像素对比两个目录下的同名图片（we-scene 解码 vs RePKG 参考输出）
// 用法: node cli/compare-png.mjs <参考目录(树)> <我方目录(扁平名)>
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { decodePng } from '../src/pkg/png.js'

const [dirA, dirB] = process.argv.slice(2)
if (!dirA || !dirB) {
  console.log('用法: node cli/compare-png.mjs <参考目录> <我方目录>')
  process.exit(1)
}

function collect(dir) {
  const out = new Map()
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.(png|jpg)$/i.test(name)) {
        const rel = p.slice(dir.length + 1)
        const key = rel.replace(/\\/g, '__').toLowerCase()
        out.set(key, p)
      }
    }
  }
  walk(dir)
  return out
}

const A = collect(dirA)
const B = collect(dirB)
let total = 0
let bad = 0
let missing = 0

for (const [key, pathA] of A) {
  const pathB = B.get(key)
  if (pathB === undefined) {
    missing++
    console.log('MISS ' + key)
    continue
  }
  total++
  const bytesA = readFileSync(pathA)
  const bytesB = readFileSync(pathB)
  const isJpeg = (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8
  if (isJpeg(bytesA) || isJpeg(bytesB)) {
    if (isJpeg(bytesA) && isJpeg(bytesB)) {
      console.log((bytesA.equals(bytesB) ? 'OK   ' : 'DIFF ') + key + ' (JPEG 字节' + (bytesA.equals(bytesB) ? '一致' : '不一致') + ')')
      if (!bytesA.equals(bytesB)) bad++
    } else {
      console.log('SKIP ' + key + ' (一侧为 JPEG，无 JS 解码器，跳过像素对比)')
    }
    continue
  }
  if (key.endsWith('.jpg')) {
    if (bytesA.equals(bytesB)) {
      console.log('OK   ' + key + ' (字节一致)')
    } else {
      bad++
      console.log('DIFF ' + key + ' (JPEG 字节不一致)')
    }
    continue
  }
  try {
    const a = decodePng(bytesA)
    const b = decodePng(bytesB)
    if (a.width !== b.width || a.height !== b.height) {
      bad++
      console.log('DIM  ' + key + ' ' + a.width + 'x' + a.height + ' vs ' + b.width + 'x' + b.height)
      continue
    }
    let diffPixels = 0
    let maxDiff = 0
    let sum = 0
    const n = a.rgba.length
    for (let i = 0; i < n; i++) {
      const d = Math.abs(a.rgba[i] - b.rgba[i])
      if (d > maxDiff) maxDiff = d
      sum += d
    }
    const pixels = a.width * a.height
    for (let p = 0; p < pixels; p++) {
      let over = false
      for (let c = 0; c < 4; c++) {
        if (Math.abs(a.rgba[p * 4 + c] - b.rgba[p * 4 + c]) > 3) over = true
      }
      if (over) diffPixels++
    }
    const mean = (sum / n).toFixed(3)
    if (diffPixels === 0 && maxDiff <= 3) {
      console.log('OK   ' + key + '  ' + a.width + 'x' + a.height + '  maxDiff=' + maxDiff + ' mean=' + mean)
    } else {
      bad++
      console.log('DIFF ' + key + '  ' + a.width + 'x' + a.height + '  差异像素=' + diffPixels + '/' + pixels + '  maxDiff=' + maxDiff + ' mean=' + mean)
    }
  } catch (e) {
    bad++
    console.log('ERR  ' + key + '  ' + String(e && e.message || e))
  }
}

console.log('\n对比 ' + total + ' 个，一致 ' + (total - bad) + '，不一致 ' + bad + '，我方缺失 ' + missing)
