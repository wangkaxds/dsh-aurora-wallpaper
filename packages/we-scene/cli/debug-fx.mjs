// 合成测试：tint + colorkey 效果链
import { renderScene } from '../src/render/cpu.js'

const purple = { user: 'backgroundcolor', value: '0.30196 0.21176 0.54902' }
const scene = {
  camera: null,
  general: { clearenabled: true, clearcolor: '0.7 0.7 0.7' },
  layers: [{
    id: 1,
    name: 'solid-with-effects',
    visible: true,
    particle: null,
    solid: true,
    origin: [960, 540, 0],
    scale: [1, 1, 1],
    angles: [0, 0, 0],
    size: [1920, 1080],
    alignment: 'center',
    color: [0.30196, 0.21176, 0.54902],
    alpha: 1,
    brightness: 1,
    effects: [
      {
        file: 'effects/tint/effect.json',
        visible: true,
        passes: [{ constantshadervalues: { alpha: 1, color: purple } }],
      },
      {
        file: 'effects/colorkey/effect.json',
        visible: true,
        passes: [{ constantshadervalues: { color: purple, fuzziness: 0.27, tolerance: 0.4 } }],
      },
    ],
  }],
  properties: {},
}
const r = renderScene(scene, new Map(), 1920, 1080, 0)
const o = (540 * 1920 + 960) * 4
console.log('center:', [r.rgba[o], r.rgba[o + 1], r.rgba[o + 2], r.rgba[o + 3]], '（期望 179,179,179,255 = 被键掉）')
