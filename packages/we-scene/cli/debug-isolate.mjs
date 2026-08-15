// 调试：隔离测试 Makima 各效果对画面变化的贡献
import { readFileSync } from 'node:fs'
import { decodePng } from '../src/pkg/png.js'
import { parsePkg, getEntry } from '../src/pkg/container.js'
import { parseScene } from '../src/scene/parse.js'
import { loadSceneAssets } from '../src/scene/load.js'
import { renderScene } from '../src/render/cpu.js'

globalThis.__weSceneDecodePng = decodePng
const pkg = parsePkg(readFileSync('D:/steam/steamapps/workshop/content/431960/2884796594/scene.pkg'))
const scene = parseScene(
  JSON.parse(getEntry(pkg, 'scene.json').toString('utf8').replace(/^\uFEFF/, '')),
  JSON.parse(readFileSync('D:/steam/steamapps/workshop/content/431960/2884796594/project.json', 'utf8').replace(/^\uFEFF/, '')),
)
const { textures } = loadSceneAssets(pkg, scene, { noisePng: 'D:/steam/steamapps/common/wallpaper_engine/assets/materials/util/noise.png' }, readFileSync)

function diff(full, only) {
  const n = full.rgba.length
  let sum = 0
  let max = 0
  for (let i = 0; i < n; i += 16) {
    const d = Math.abs(full.rgba[i] - only.rgba[i])
    sum += d
    if (d > max) max = d
  }
  return { mean: sum / (n / 16), max }
}

// 全效果渲染
const full = { 0: renderScene(scene, textures, 960, 540, 0), 1: renderScene(scene, textures, 960, 540, 1) }

// 仅 flow 效果
const flowOnly = JSON.parse(JSON.stringify(scene))
flowOnly.layers.forEach((l) => { l.effects = l.effects.filter((e) => e.file.includes('waterflow')) })
const flowR = { 0: renderScene(flowOnly, textures, 960, 540, 0), 1: renderScene(flowOnly, textures, 960, 540, 1) }

// 仅 waves + shake（除 flow/pulse 外）
const noFlow = JSON.parse(JSON.stringify(scene))
noFlow.layers.forEach((l) => { l.effects = l.effects.filter((e) => !e.file.includes('waterflow') && !e.file.includes('pulse')) })
const noFlowR = { 0: renderScene(noFlow, textures, 960, 540, 0), 1: renderScene(noFlow, textures, 960, 540, 1) }

console.log('t=0→1 画面变化（均值/最大像素差）：')
console.log('全效果:      ' + JSON.stringify(diff(full[0], full[1])))
console.log('仅水流:      ' + JSON.stringify(diff(flowR[0], flowR[1])))
console.log('除水流脉冲外: ' + JSON.stringify(diff(noFlowR[0], noFlowR[1])))
