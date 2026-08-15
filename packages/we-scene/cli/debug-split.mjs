// 调试：细分 Makima 波浪/抖动贡献 + 蒙版数值范围
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

// 蒙版数值范围
for (const name of ['waterwaves_mask_a75d6e7d', 'waterwaves_mask_70b6601a', 'shake_mask_4306b63d', 'shake_mask_5adf2dd9']) {
  const t = textures.get('masks/' + name)
  if (!t) { console.log(name + ' 未加载'); continue }
  let sum = 0
  let c = 0
  let max = 0
  const isRg88 = t.rg88
  for (let y = 0; y < t.height; y += 8) {
    for (let x = 0; x < t.width; x += 8) {
      const o = (y * t.width + x) * 4
      const v = isRg88 ? t.rgba[o + 3] : t.rgba[o]
      if (v > 2) {
        sum += v
        c++
        if (v > max) max = v
      }
    }
  }
  console.log(name + (isRg88 ? '(RG88)' : '(PNG)') + ' 非零蒙版值均值=' + (c ? Math.round(sum / c) : 0) + ' 最大=' + max)
}

function diff(a, b) {
  const n = a.rgba.length
  let sum = 0
  let max = 0
  for (let i = 0; i < n; i += 16) {
    const d = Math.abs(a.rgba[i] - b.rgba[i])
    sum += d
    if (d > max) max = d
  }
  return { mean: Math.round(sum / (n / 16) * 100) / 100, max }
}

// 仅波浪
const wavesOnly = JSON.parse(JSON.stringify(scene))
wavesOnly.layers.forEach((l) => { l.effects = l.effects.filter((e) => e.file.includes('waterwaves')) })
// 仅抖动
const shakeOnly = JSON.parse(JSON.stringify(scene))
shakeOnly.layers.forEach((l) => { l.effects = l.effects.filter((e) => e.file.includes('shake')) })

console.log('t=0→1 变化：')
console.log('仅波浪: ' + JSON.stringify(diff(renderScene(wavesOnly, textures, 960, 540, 0), renderScene(wavesOnly, textures, 960, 540, 1))))
console.log('仅抖动: ' + JSON.stringify(diff(renderScene(shakeOnly, textures, 960, 540, 0), renderScene(shakeOnly, textures, 960, 540, 1))))
