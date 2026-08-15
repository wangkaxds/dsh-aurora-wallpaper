// 首帧渲染 CLI：node cli/render-frame.mjs <scene.pkg> <project.json> <输出.png> [jpeg转png目录]
// 无头验证：解析 → 纹理 → CPU 光栅 → PNG + 关键点采样统计
import { readFileSync, writeFileSync } from 'node:fs'
import { parsePkg, getEntry } from '../src/pkg/container.js'
import { decodePng } from '../src/pkg/png.js'
import { encodePng } from '../src/pkg/png-write.js'
import { parseScene } from '../src/scene/parse.js'
import { loadSceneAssets } from '../src/scene/load.js'
import { renderScene } from '../src/render/cpu.js'

globalThis.__weSceneDecodePng = decodePng

const [pkgPath, projectPath, outPng, jpegDir] = process.argv.slice(2)
if (!pkgPath || !projectPath || !outPng) {
  console.log('用法: node cli/render-frame.mjs <scene.pkg> <project.json> <输出.png> [jpeg转png目录]')
  process.exit(1)
}

const pkg = parsePkg(readFileSync(pkgPath))
const sceneJson = JSON.parse(getEntry(pkg, 'scene.json').toString('utf8').replace(/^\uFEFF/, ''))
const project = JSON.parse(readFileSync(projectPath, 'utf8').replace(/^\uFEFF/, ''))
const scene = parseScene(sceneJson, project)

const { textures, resolved, log } = loadSceneAssets(pkg, scene, { jpegDir }, readFileSync)
for (const line of log) console.log(line)

const W = 1920
const H = 1080
const result = renderScene(scene, textures, W, H, 0)
writeFileSync(outPng, encodePng(result.rgba, W, H))
console.log('已渲染 ' + result.drawn + ' 个图层（共 ' + scene.layers.length + ' 个对象，' + resolved + ' 个纹理已解析）→ ' + outPng)

const px = (x, y) => {
  const o = (y * W + x) * 4
  return [result.rgba[o], result.rgba[o + 1], result.rgba[o + 2], result.rgba[o + 3]]
}
console.log('左空白(300,800):', px(300,800), ' 左空白(300,100):', px(300,100))
console.log('右空白(1700,800):', px(1700,800), ' 右上(1700,100):', px(1700,100))
console.log('中心(960,540):', px(960,540), ' 底部中央(960,1050):', px(960,1050))
console.log('顶部边条(960,5):', px(960,5), ' 角(5,5):', px(5,5))
