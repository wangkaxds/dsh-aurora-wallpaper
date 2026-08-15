// 调试：测量手臂图层与身体图层各自的整体位移（t=0 vs t=π/2 等时刻）
import { readFileSync } from 'node:fs'
import { decodePng } from '../src/pkg/png.js'
import { parsePkg, getEntry } from '../src/pkg/container.js'
import { parseScene } from '../src/scene/parse.js'
import { loadSceneAssets } from '../src/scene/load.js'
import { renderScene } from '../src/render/cpu.js'

globalThis.__weSceneDecodePng = decodePng
const pkg = parsePkg(readFileSync('D:/steam/steamapps/workshop/content/431960/2423807815/scene.pkg'))
const scene = parseScene(
  JSON.parse(getEntry(pkg, 'scene.json').toString('utf8').replace(/^\uFEFF/, '')),
  JSON.parse(readFileSync('D:/steam/steamapps/workshop/content/431960/2423807815/project.json', 'utf8').replace(/^\uFEFF/, '')),
)
const { textures } = loadSceneAssets(pkg, scene, { jpegDir: 'D:/杂活/we-scene-out/jpeg-png', noisePng: 'D:/steam/steamapps/common/wallpaper_engine/assets/materials/util/noise.png' }, readFileSync)

const armLayer = scene.layers.find((l) => l.name === 'reze full arm')
const bodyLayer = scene.layers.find((l) => l.name === 'reze full main')

// 渲染单图层（含全部效果）在指定时刻，提取图层区域，与 t=0 互相关求位移
function layerFrame(layer, t) {
  const sub = { camera: scene.camera, general: scene.general, layers: [layer], properties: scene.properties }
  return renderScene(sub, textures, 1920, 1080, t)
}

function trackDisplacement(a, b) {
  // 在图层包围盒内做二维互相关
  const x0 = 1155
  const x1 = 1915
  const y0 = 20
  const y1 = 1050
  const W = 1920
  let best = -1
  let bestDx = 0
  let bestDy = 0
  for (let dy = -14; dy <= 14; dy += 2) {
    for (let dx = -14; dx <= 14; dx += 2) {
      let s = 0
      let c = 0
      for (let y = y0; y < y1; y += 3) {
        for (let x = x0; x < x1; x += 3) {
          const ax = x + dx
          const ay = y + dy
          if (ax < x0 || ax >= x1 || ay < y0 || ay >= y1) continue
          const oa = (y * W + x) * 4
          const ob = (ay * W + ax) * 4
          s += Math.abs(a.rgba[oa] - b.rgba[ob])
          c++
        }
      }
      const score = s / c
      if (best < 0 || score < best) {
        best = score
        bestDx = dx
        bestDy = dy
      }
    }
  }
  return { dx: bestDx, dy: bestDy, score: best }
}

const armT0 = layerFrame(armLayer, 0)
const armT3 = layerFrame(armLayer, 3.0)
const bodyT0 = layerFrame(bodyLayer, 0)
const bodyT3 = layerFrame(bodyLayer, 3.0)

console.log('手臂图层位移(t=0→3s):', JSON.stringify(trackDisplacement(armT0, armT3)))
console.log('身体图层位移(t=0→3s):', JSON.stringify(trackDisplacement(bodyT0, bodyT3)))
