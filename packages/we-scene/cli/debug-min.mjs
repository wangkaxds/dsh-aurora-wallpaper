// 最小复现：单图层合成场景渲染
import { renderScene } from '../src/render/cpu.js'

const scene = {
  camera: null,
  general: { clearenabled: true, clearcolor: '0.7 0.7 0.7' },
  layers: [{
    id: 1,
    name: 'bar',
    visible: true,
    particle: null,
    solid: true,
    origin: [314, 10, 0],
    scale: [1.16582, 0.0385, 1],
    angles: [0, 0, 0],
    size: [512, 512],
    alignment: 'center',
    color: [0.00784, 0.00392, 0.01569],
    alpha: 1,
    brightness: 1,
    effects: [],
  }],
  properties: {},
}
const r = renderScene(scene, new Map(), 1920, 1080, 0)
const px = (x, y) => {
  const o = (y * 1920 + x) * 4
  return [r.rgba[o], r.rgba[o + 1], r.rgba[o + 2], r.rgba[o + 3]]
}
console.log('drawn:', r.drawn)
console.log('(300,10) 应黑:', px(300, 10))
console.log('(300,100) 应灰:', px(300, 100))
console.log('(960,540) 应灰:', px(960, 540))
console.log('(5,5) 应灰:', px(5, 5))

// 扫描实际绘制的非灰色像素包围盒
let minX = 1e9
let minY = 1e9
let maxX = -1
let maxY = -1
let count = 0
for (let y = 0; y < 1080; y++) {
  for (let x = 0; x < 1920; x++) {
    const o = (y * 1920 + x) * 4
    if (r.rgba[o] !== 179 || r.rgba[o + 1] !== 179 || r.rgba[o + 2] !== 179) {
      count++
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
}
console.log('实际绘制区域: x[' + minX + ',' + maxX + '] y[' + minY + ',' + maxY + '] 共 ' + count + ' 像素')
