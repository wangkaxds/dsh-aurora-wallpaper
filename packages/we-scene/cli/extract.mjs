// 提取器：node cli/extract.mjs <scene.pkg> <输出目录> [--all]
// 默认只提取 scene.json 并做冒烟检查；--all 提取全部入口。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { parsePkg, getEntry, verifyLayout } from '../src/pkg/container.js'

const args = process.argv.slice(2)
if (args.length < 2) {
  console.log('用法: node cli/extract.mjs <scene.pkg> <输出目录> [--all]')
  process.exit(1)
}
const [pkgPath, outDir] = args
const all = args.includes('--all')

const buf = readFileSync(pkgPath)
const pkg = parsePkg(buf)
const layout = verifyLayout(pkg)
console.log('magic=' + pkg.magic + ' entries=' + pkg.count +
  ' dataStart=0x' + pkg.dataStart.toString(16) +
  ' dataEnd=0x' + layout.dataEnd.toString(16) +
  ' fileSize=0x' + buf.length.toString(16) +
  ' layout=' + (layout.ok ? 'OK' : 'BAD'))

mkdirSync(outDir, { recursive: true })

const wanted = all
  ? pkg.entries
  : pkg.entries.filter((e) => e.name === 'scene.json')

for (const e of wanted) {
  const data = getEntry(pkg, e.name)
  const target = join(outDir, e.name.replace(/[\\/]/g, '__'))
  mkdirSync(join(target, '..'), { recursive: true })
  writeFileSync(target, data)
  console.log('提取 ' + e.name + ' (' + e.size + ' 字节) -> ' + target)
}

// 冒烟检查 scene.json
const sj = getEntry(pkg, 'scene.json')
if (sj !== null) {
  try {
    const scene = JSON.parse(sj.toString('utf8').replace(/^\uFEFF/, ''))
    const counts = {}
    for (const k of Object.keys(scene)) {
      const v = scene[k]
      counts[k] = Array.isArray(v) ? v.length : typeof v
    }
    console.log('scene.json OK:', JSON.stringify(counts))
    if (Array.isArray(scene.objects)) {
      console.log('对象类型统计:', JSON.stringify(tally(scene.objects.map((o) => o.type || o.name || '?'))))
    }
  } catch (e) {
    console.log('scene.json 解析失败: ' + String(e && e.message || e))
  }
}

function tally(list) {
  const m = {}
  for (const t of list) m[t] = (m[t] || 0) + 1
  return m
}
