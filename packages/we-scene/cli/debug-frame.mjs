// 调试：打印每个图层的屏幕包围盒及关键点覆盖情况
import { readFileSync } from 'node:fs'
import { parsePkg, getEntry } from '../src/pkg/container.js'
import { parseScene } from '../src/scene/parse.js'
import { mat4Identity, mat4Multiply, mat4RotateZ, mat4Translate, mat4TransformPoint, buildCamera } from '../src/render/math.js'

const [pkgPath, projectPath] = process.argv.slice(2)
const pkg = parsePkg(readFileSync(pkgPath))
const scene = parseScene(
  JSON.parse(getEntry(pkg, 'scene.json').toString('utf8').replace(/^\uFEFF/, '')),
  JSON.parse(readFileSync(projectPath, 'utf8').replace(/^\uFEFF/, '')),
)
const W = 1920
const H = 1080
const cam = buildCamera(scene, W, H)
const viewProj = mat4Multiply(cam.projection, cam.view)
const probes = [[960, 540, 'center'], [5, 5, 'corner'], [300, 800, 'left'], [300, 100, 'left-top'], [1700, 800, 'right'], [960, 5, 'topbar']]

const ALIGN = { center: [0.5, 0.5], left: [0, 0.5], right: [1, 0.5], top: [0.5, 0], bottom: [0.5, 1], topleft: [0, 0], topright: [1, 0], bottomleft: [0, 1], bottomright: [1, 1] }

for (const layer of scene.layers) {
  if (layer.particle) continue
  const a = ALIGN[layer.alignment] || [0.5, 0.5]
  const w = layer.size[0] * layer.scale[0]
  const h = layer.size[1] * layer.scale[1]
  let m = mat4Identity()
  m = mat4Translate(m, layer.origin[0], layer.origin[1], layer.origin[2])
  m = mat4RotateZ(m, layer.angles[2])
  const mvp = mat4Multiply(viewProj, m)
  const corners = [[-a[0] * w, -a[1] * h], [(1 - a[0]) * w, -a[1] * h], [(1 - a[0]) * w, (1 - a[1]) * h], [-a[0] * w, (1 - a[1]) * h]].map(([x, y]) => {
    const p = mat4TransformPoint(mvp, x, y, 0)
    return [(p[0] + 1) / 2 * W, (1 - p[1]) / 2 * H]
  })
  const xs = corners.map((c) => c[0])
  const ys = corners.map((c) => c[1])
  const bbox = [Math.min(...xs).toFixed(0), Math.min(...ys).toFixed(0), Math.max(...xs).toFixed(0), Math.max(...ys).toFixed(0)]
  const covers = probes.filter(([px, py]) => inside(corners, px, py)).map((p) => p[2])
  console.log(layer.name.padEnd(28) + ' bbox=[' + bbox.join(',') + ']' + (covers.length ? ' 覆盖: ' + covers.join(' ') : ''))
}

function inside(corners, x, y) {
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const a = corners[i]
    const b = corners[(i + 1) % 4]
    const e = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])
    const s = Math.sign(e)
    if (s !== 0) {
      if (sign === 0) sign = s
      else if (sign !== s) return false
    }
  }
  return true
}
