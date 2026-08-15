// 调试：量化蕾塞身体/手臂图层的位移来源
import { readFileSync } from 'node:fs'
import { decodePng } from '../src/pkg/png.js'

function stats(name) {
  const p = decodePng(readFileSync('D:/杂活/we-scene-out/2423807815-png/materials__masks__' + name + '.png'))
  let maxR = 0
  let maxG = 0
  let meanAbsR = 0
  let meanAbsG = 0
  let n = 0
  for (let y = 0; y < p.height; y += 4) {
    for (let x = 0; x < p.width; x += 4) {
      const o = (y * p.width + x) * 4
      const dr = Math.abs(p.rgba[o] - 127)
      const dg = Math.abs(p.rgba[o + 1] - 127)
      meanAbsR += dr
      meanAbsG += dg
      n++
      if (dr > maxR) maxR = dr
      if (dg > maxG) maxG = dg
    }
  }
  return { meanR: (meanAbsR / n / 128).toFixed(3), meanG: (meanAbsG / n / 128).toFixed(3), maxR: (maxR / 128).toFixed(2), maxG: (maxG / 128).toFixed(2) }
}

console.log('—— 手臂图层蒙版（shake 44486b13, strength 0.11 → amp²=0.0121uv）——')
const arm = stats('shake_mask_44486b13cda82e54a31194a3588857803f9d1e57')
console.log('flowMask 均值(|R|,|G|)=' + arm.meanR + ',' + arm.meanG + ' 最大=' + arm.maxR + ',' + arm.maxG)
console.log('手臂最大位移 ≈ ' + (0.0121 * arm.maxR * 1110).toFixed(1) + 'px（显示高度 1110px）')

console.log('—— 身体图层蒙版 ——')
const head = stats('shake_mask_0397e8cdb34c96b656d5af09dcf8a6a5ec25bc97')
console.log('Shake Head(0.1): 均值=' + head.meanR + ',' + head.meanG + ' 最大位移≈' + (0.01 * head.maxR * 1110).toFixed(1) + 'px')
const eyes = stats('shake_mask_b8cb6b3de866f2fd1f17996fee01cec4748a03e8')
console.log('Shake Eyes(0.03): 均值=' + eyes.meanR + ',' + eyes.meanG)
const mouth = stats('shake_mask_28daa205cc637404499adf696cad93c021047f54')
console.log('shake mouth(0.03): 均值=' + mouth.meanR + ',' + mouth.meanG)
const swayHair = stats('foliagesway_mask_414ae758318a5838207f1f8e22e7225e22cfab2b')
console.log('Sway Hair 蒙版: 均值=' + swayHair.meanR + ',' + swayHair.meanG + ' 最大=' + swayHair.maxR + ',' + swayHair.maxG)
const swayBody = stats('foliagesway_mask_0ec565074e4c25161a5500f40db395a6ffd70e56')
console.log('Sway Body 蒙版: 均值=' + swayBody.meanR + ',' + swayBody.meanG + ' 最大=' + swayBody.maxR + ',' + swayBody.maxG)
const waves = stats('waterwaves_mask_ee0d9bbc6d0516b8583c8fb3e841485c0b7ec4e8')
console.log('Waves Bangs 蒙版: 均值=' + waves.meanR + ',' + waves.meanG + ' 最大=' + waves.maxR + ',' + waves.maxG)
