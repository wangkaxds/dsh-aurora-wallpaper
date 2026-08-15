// 调试：逐层隔离渲染，找出哪些图层影响关键像素
import { readFileSync } from 'node:fs'
import { parsePkg, getEntry } from '../src/pkg/container.js'
import { decodePng } from '../src/pkg/png.js'
import { parseScene } from '../src/scene/parse.js'
import { loadSceneAssets } from '../src/scene/load.js'
import { renderScene } from '../src/render/cpu.js'
import { mat4Identity, mat4Multiply, mat4RotateZ, mat4Translate, mat4TransformPoint, buildCamera } from '../src/render/math.js'

globalThis.__weSceneDecodePng = decodePng

const [pkgPath, projectPath] = process.argv.slice(2)
const pkg = parsePkg(readFileSync(pkgPath))
const scene = parseScene(
  JSON.parse(getEntry(pkg, 'scene.json').toString('utf8').replace(/^\uFEFF/, '')),
  JSON.parse(readFileSync(projectPath, 'utf8').replace(/^\uFEFF/, '')),
)
const { textures } = loadSceneAssets(pkg, scene, { jpegDir: 'D:/杂活/we-scene-out/jpeg-png' }, readFileSync)

const ALIGN = { center: [0.5, 0.5], left: [0, 0.5], right: [1, 0.5], top: [0.5, 0], bottom: [0.5, 1], topleft: [0, 0], topright: [1, 0], bottomleft: [0, 1], bottomright: [1, 1] }
const cam = buildCamera(scene, 1920, 1080)
const viewProj = mat4Multiply(cam.projection, cam.view)

for (const i of [11, 18, 21, 22]) {
  const layer = scene.layers[i]
  const a = ALIGN[layer.alignment] || [0.5, 0.5]
  const w = layer.size[0] * layer.scale[0]
  const h = layer.size[1] * layer.scale[1]
  let m = mat4Identity()
  m = mat4Translate(m, layer.origin[0], layer.origin[1], layer.origin[2])
  m = mat4RotateZ(m, layer.angles[2])
  const mvp = mat4Multiply(viewProj, m)
  const corners = [[-a[0] * w, -a[1] * h], [(1 - a[0]) * w, -a[1] * h], [(1 - a[0]) * w, (1 - a[1]) * h], [-a[0] * w, (1 - a[1]) * h]].map(([x, y]) => {
    const p = mat4TransformPoint(mvp, x, y, 0)
    return [(p[0] + 1) / 2 * 1920, (1 - p[1]) / 2 * 1080]
  })
  console.log(i, layer.name, 'origin=' + layer.origin.join(','), 'size=' + w.toFixed(1) + 'x' + h.toFixed(1))
  console.log('  corners:', corners.map((c) => c.map((v) => v.toFixed(1)).join(',')).join(' | '))
}

const probes = [[5, 5, 'corner'], [960, 540, 'center'], [300, 100, 'left-top'], [1700, 100, 'right-top']]

for (let i = 0; i < scene.layers.length; i++) {
  const layer = scene.layers[i]
  if (layer.particle) continue
  const sub = { camera: scene.camera, general: scene.general, layers: [layer], properties: scene.properties }
  const r = renderScene(sub, textures, 1920, 1080, 0)
  const hits = probes.map(([x, y, label]) => {
    const o = (y * 1920 + x) * 4
    const c = [r.rgba[o], r.rgba[o + 1], r.rgba[o + 2], r.rgba[o + 3]]
    return c[0] !== 179 || c[1] !== 179 || c[2] !== 179 ? label + '=' + c.join(',') : null
  }).filter(Boolean)
  if (hits.length) console.log(i + ' ' + layer.name.padEnd(28) + hits.join('  '))
}
