// 调试：Makima 抖动/波浪蒙版活跃区域分布图
import { readFileSync } from 'node:fs'
import { decodePng } from '../src/pkg/png.js'
import { parsePkg, getEntry } from '../src/pkg/container.js'
import { parseScene } from '../src/scene/parse.js'
import { loadSceneAssets } from '../src/scene/load.js'

globalThis.__weSceneDecodePng = decodePng
const pkg = parsePkg(readFileSync('D:/steam/steamapps/workshop/content/431960/2884796594/scene.pkg'))
const scene = parseScene(
  JSON.parse(getEntry(pkg, 'scene.json').toString('utf8').replace(/^\uFEFF/, '')),
  JSON.parse(readFileSync('D:/steam/steamapps/workshop/content/431960/2884796594/project.json', 'utf8').replace(/^\uFEFF/, '')),
)
const { textures } = loadSceneAssets(pkg, scene, { noisePng: 'D:/steam/steamapps/common/wallpaper_engine/assets/materials/util/noise.png' }, readFileSync)

function mapActive(t, label, CW = 40, CH = 22) {
  const isRg88 = t.rg88
  let total = 0
  const grid = new Array(CW * CH).fill(0)
  for (let y = 0; y < t.height; y += 3) {
    for (let x = 0; x < t.width; x += 3) {
      const o = (y * t.width + x) * 4
      const v1 = isRg88 ? t.rgba[o + 3] : t.rgba[o]
      const v2 = isRg88 ? t.rgba[o] : t.rgba[o + 1]
      const active = Math.abs(v1 - 127) > 10 || Math.abs(v2 - 127) > 10
      if (active) {
        total++
        grid[Math.floor(x / t.width * CW) + Math.floor(y / t.height * CH) * CW]++
      }
    }
  }
  console.log(label + ' 活跃像素占比=' + (total / (t.width * t.height / 9) * 100).toFixed(1) + '%')
  const mx = Math.max(...grid, 1)
  for (let r = 0; r < CH; r += 2) {
    let line = ''
    for (let c = 0; c < CW; c += 2) {
      const v = grid[r * CW + c]
      line += v === 0 ? '.' : v > mx * 0.5 ? '█' : v > mx * 0.1 ? '▒' : '░'
    }
    console.log('  ' + line)
  }
}

for (const name of ['shake_mask_5adf2dd9', 'shake_mask_99a2f716', 'shake_mask_78b27904', 'shake_mask_274f828a']) {
  const t = textures.get('masks/' + name)
  if (t) mapActive(t, name)
}
for (const name of ['waterwaves_mask_a75d6e7d', 'waterwaves_mask_70b6601a']) {
  const t = textures.get('masks/' + name)
  if (t) mapActive(t, name)
}
