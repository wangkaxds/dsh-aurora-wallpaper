// 调试：打印各效果蒙版的活跃区域（非中性像素分布）
import { readFileSync } from 'node:fs'
import { decodePng } from '../src/pkg/png.js'

const names = [
  'shake_mask_b8cb6b3de866f2fd1f17996fee01cec4748a03e8', // Shake mouth
  'shake_mask_0397e8cdb34c96b656d5af09dcf8a6a5ec25bc97', // Shake head
  'shake_mask_28daa205cc637404499adf696cad93c021047f54', // shake mouth 2
  'shake_mask_44486b13cda82e54a31194a3588857803f9d1e57', // arm shake
  'shake_mask_cbb1a2873503c9e0d71b2bd2172f79dbb9ccf013', // eyes
  'waterwaves_mask_ee0d9bbc6d0516b8583c8fb3e841485c0b7ec4e8', // bangs
]
for (const n of names) {
  const p = decodePng(readFileSync('D:/杂活/we-scene-out/2423807815-png/materials__masks__' + n + '.png'))
  let minX = 1e9
  let minY = 1e9
  let maxX = -1
  let maxY = -1
  let count = 0
  for (let y = 0; y < p.height; y += 2) {
    for (let x = 0; x < p.width; x += 2) {
      const o = (y * p.width + x) * 4
      if (Math.abs(p.rgba[o] - 127) > 8 || Math.abs(p.rgba[o + 1] - 127) > 8) {
        count++
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  console.log(n.slice(0, 14) + ' 活跃bbox: x[' + (minX / p.width).toFixed(3) + ',' + (maxX / p.width).toFixed(3) + '] y[' + (minY / p.height).toFixed(3) + ',' + (maxY / p.height).toFixed(3) + '] 样本=' + count)
}
