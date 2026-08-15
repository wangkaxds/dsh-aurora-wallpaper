// 调试：扫描 logo 品红特征在预览图与我的渲染中的分布（上下半区分开统计）
import { readFileSync } from 'node:fs'
import { decodePng } from '../src/pkg/png.js'

const prev = decodePng(readFileSync('D:/杂活/we-scene-out/preview-frame.png'))
const mine = decodePng(readFileSync('D:/杂活/we-scene-out/frame-2423807815.png'))

function scan(p, label) {
  const S = 256
  let top = 0
  let bottom = 0
  let topY = []
  let botY = []
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      const o = (y * p.width + x) * 4
      const r = p.rgba[o]
      const g = p.rgba[o + 1]
      const b = p.rgba[o + 2]
      if (r > 140 && b > 150 && g < 70 && r - g > 80) {
        if (y < p.height / 2) {
          top++
          topY.push((y / p.height).toFixed(2))
        } else {
          bottom++
          botY.push((y / p.height).toFixed(2))
        }
      }
    }
  }
  console.log(label + ' ' + p.width + 'x' + p.height + '  上半=' + top + ' 下半=' + bottom)
  if (topY.length) console.log('  上半样本 y∈[' + Math.min(...topY) + ',' + Math.max(...topY) + ']')
  if (botY.length) console.log('  下半样本 y∈[' + Math.min(...botY) + ',' + Math.max(...botY) + ']')
}

scan(prev, 'WE预览图')
scan(mine, '我的渲染')
