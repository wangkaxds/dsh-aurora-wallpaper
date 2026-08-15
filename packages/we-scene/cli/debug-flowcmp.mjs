// 调试：同尺度对比 Makima 水流——预览图 vs 我的渲染（半分辨率快速版）
import { readFileSync } from 'node:fs'
import { decodePng } from '../src/pkg/png.js'
import { encodePng } from '../src/pkg/png-write.js'
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

// 半分辨率渲染 + 中心裁剪 → 252x252（与预览同尺寸）
function myFrame(t) {
  const r = renderScene(scene, textures, 960, 540, t)
  const out = new Uint8Array(252 * 252 * 4)
  for (let y = 0; y < 252; y++) {
    for (let x = 0; x < 252; x++) {
      const sx = Math.floor(210 + (x / 252) * 540)
      const sy = Math.floor((y / 252) * 540)
      const so = (sy * 960 + sx) * 4
      const o = (y * 252 + x) * 4
      out[o] = r.rgba[so]
      out[o + 1] = r.rgba[so + 1]
      out[o + 2] = r.rgba[so + 2]
      out[o + 3] = 255
    }
  }
  return decodePng(encodePng(out, 252, 252))
}

function lum(p, x, y) {
  const o = (y * p.width + x) * 4
  return p.rgba[o] + p.rgba[o + 1] + p.rgba[o + 2]
}

// 互相关追踪（大窗口、双向）
function track(p0, p1, vertical) {
  const a = []
  const b = []
  const W = p0.width
  const H = p0.height
  const margin = 30
  if (vertical) {
    const x = Math.floor(W / 2)
    for (let y = margin; y < H - margin; y++) {
      a.push(lum(p0, x, y))
      b.push(lum(p1, x, y))
    }
  } else {
    const y = Math.floor(H / 2)
    for (let x = margin; x < W - margin; x++) {
      a.push(lum(p0, x, y))
      b.push(lum(p1, x, y))
    }
  }
  const n = a.length
  let best = 1e18
  let bestShift = 0
  let second = 1e18
  for (let d = -20; d <= 20; d++) {
    let s = 0
    let c = 0
    for (let i = 0; i < n; i++) {
      const j = i + d
      if (j < 0 || j >= n) continue
      s += Math.abs(a[i] - b[j])
      c++
    }
    const score = s / c
    if (score < best) {
      second = best
      best = score
      bestShift = d
    } else if (score < second) {
      second = score
    }
  }
  return { shift: bestShift, conf: second / best - 1 }
}

// 预览帧（0.1s/帧，25 帧）
const dir = 'D:/杂活/we-scene-out/makima-preview/'
const prev = []
for (let i = 1; i <= 25; i += 2) prev.push(decodePng(readFileSync(dir + 'f' + String(i).padStart(2, '0') + '.png')))

const mine = [0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.2].map(myFrame)

console.log('t(s)   预览dy(conf)   我的dy(conf)   预览dx   我的dx')
let pdy = 0
let mdy = 0
for (let i = 1; i < prev.length; i++) {
  const pv = track(prev[i - 1], prev[i], true)
  const mv = track(mine[i - 1], mine[i], true)
  const ph = track(prev[i - 1], prev[i], false)
  const mh = track(mine[i - 1], mine[i], false)
  pdy += pv.shift
  mdy += mv.shift
  console.log(
    ((i * 0.2).toFixed(1)).padStart(4) + '     ' +
    String(pdy).padStart(3) + '(' + pv.conf.toFixed(2) + ')     ' +
    String(mdy).padStart(3) + '(' + mv.conf.toFixed(2) + ')     ' +
    String(ph.shift).padStart(3) + '     ' +
    String(mh.shift).padStart(3),
  )
}
