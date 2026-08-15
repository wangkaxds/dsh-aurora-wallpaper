// CPU 光栅器：与 WebGL 渲染器共享同一套场景模型与矩阵数学，用于无头验证与截图。
// 效果链公式在 effects.js（WE shader 逐行翻译，约定见 docs/WE_RENDER_CONVENTIONS.md）。
import { mat4Identity, mat4Multiply, mat4RotateZ, mat4Translate, mat4TransformPoint, buildCamera } from './math.js'
import { sampleTex, applyDisplacements, applyFlowMix, applyShakeMasks, applyColorChain } from './effects.js'

const WHITE = { width: 1, height: 1, rgba: new Uint8Array([255, 255, 255, 255]), rg88: false }

const ALIGN = {
  center: [0.5, 0.5],
  left: [0, 0.5],
  right: [1, 0.5],
  top: [0.5, 0],
  bottom: [0.5, 1],
  topleft: [0, 0],
  topright: [1, 0],
  bottomleft: [0, 1],
  bottomright: [1, 1],
}

export function renderScene(scene, textures, width, height, time = 0) {
  const rgba = new Uint8Array(width * height * 4)
  const general = scene.general || {}
  if (general.clearenabled !== false) {
    const cc = vec3(general.clearcolor || '0 0 0')
    for (let i = 0; i < width * height; i++) {
      rgba[i * 4] = Math.round(cc[0] * 255)
      rgba[i * 4 + 1] = Math.round(cc[1] * 255)
      rgba[i * 4 + 2] = Math.round(cc[2] * 255)
      rgba[i * 4 + 3] = 255
    }
  }
  const cam = buildCamera(scene, width, height)
  const viewProj = mat4Multiply(cam.projection, cam.view)
  let drawn = 0
  for (const layer of scene.layers) {
    if (!layer.visible || layer.particle) continue
    const tex = layer.solid ? WHITE : textures.get(layer.textureName) || WHITE
    if (tex.video) continue // 视频纹理图层：Phase 4 支持播放
    const quad = layerQuad(layer)
    const mvp = mat4Multiply(viewProj, layerMatrix(layer, cam.projH))
    // quad = [左, 右, 上, 下]；角点 = (x对, y对) 组合：TL, TR, BR, BL
    const corners = [[quad[0], quad[2]], [quad[1], quad[2]], [quad[1], quad[3]], [quad[0], quad[3]]].map(([x, y]) => {
      const p = mat4TransformPoint(mvp, x, y, 0)
      return [(p[0] + 1) / 2 * width, (1 - p[1]) / 2 * height]
    })
    // uv：显示空间 v-down（v=0 = 图层画面顶部，纹理第 0 行 = 图顶）
    const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]]
    const fx = effectChain(layer)
    drawTri(rgba, width, height, corners[0], corners[1], corners[2], uvs[0], uvs[1], uvs[2], tex, fx, layer, time, textures)
    drawTri(rgba, width, height, corners[0], corners[2], corners[3], uvs[0], uvs[2], uvs[3], tex, fx, layer, time, textures)
    drawn++
  }
  return { rgba, width, height, drawn }
}

function layerQuad(layer) {
  const a = ALIGN[layer.alignment] || [0.5, 0.5]
  const w = layer.size[0] * layer.scale[0]
  const h = layer.size[1] * layer.scale[1]
  return [-a[0] * w, (1 - a[0]) * w, -a[1] * h, (1 - a[1]) * h]
}

function layerMatrix(layer, sceneHeight) {
  let m = mat4Identity()
  // WE origin = 距屏幕底的距离（参考实现 CImage.cpp:258-262 的 H/2 - y 转换 + X11 XImage 呈现翻转）
  // → 屏幕 y = H - origin.y。层本地 y 向下（层顶 = origin.y 上方）。
  // 旋转：参考实现 y-up 空间 rotate(-angle)，等效 y-down 屏幕 rotate(-angle)。
  m = mat4Translate(m, layer.origin[0], sceneHeight - layer.origin[1], layer.origin[2])
  m = mat4RotateZ(m, -layer.angles[2])
  return m
}

// 解析效果参数（scene.json 的 effects 列表顺序）。
// 位移/流类进 items；颜色类进 colorItems（保持列表相对顺序）。
function effectChain(layer) {
  const items = []
  const colorItems = []
  for (const e of layer.effects || []) {
    if (!e.visible) continue
    const pass = e.passes && e.passes[0]
    const c = pass ? pass.constantshadervalues || {} : {}
    const combos = (pass && pass.combos) || {}
    const texAt = (i, def) => (pass && pass.textures && pass.textures[i]) || def
    // 纹理关联 combo（ShaderUnit.cpp:545-617）：槽提供了纹理且无显式 combo → 1
    const comboMask = (slot) => (combos.MASK !== undefined ? combos.MASK === 1 : texAt(slot, null) !== null)
    if (e.file.endsWith('scroll/effect.json')) {
      const sx = typeof c.speedx === 'number' ? c.speedx : 0
      const sy = typeof c.speedy === 'number' ? c.speedy : 0
      const repeat = c.repeat !== undefined ? vec2(c.repeat) : [1, 1]
      items.push({ type: 'scroll', sx, sy, rx: repeat[0], ry: repeat[1] })
    } else if (e.file.endsWith('shake/effect.json')) {
      items.push({
        type: 'shake',
        flow: texAt(1, 'util/noflow'),
        phase: texAt(2, 'util/white'),
        mask: texAt(3, 'util/white'),
        masked: comboMask(3),
        speed: typeof c.speed === 'number' ? c.speed : 1,
        amp: typeof c.strength === 'number' ? c.strength : 0.1,
        fx: (c.friction !== undefined ? vec2(c.friction) : [1, 1])[0],
        fy: (c.friction !== undefined ? vec2(c.friction) : [1, 1])[1],
        bounds: c.bounds !== undefined ? vec2(c.bounds) : [0, 1],
        direction: combos.DIRECTION || 0,
      })
    } else if (e.file.endsWith('waterwaves/effect.json')) {
      items.push({
        type: 'waves',
        mask: texAt(1, 'util/white'),
        speed: typeof c.speed === 'number' ? c.speed : 5,
        scale: typeof c.scale === 'number' ? c.scale : 200,
        strength: typeof c.strength === 'number' ? c.strength : 0.1,
        direction: typeof c.direction === 'number' ? c.direction : 0,
        perspective: typeof c.perspective === 'number' ? c.perspective : 0,
      })
    } else if (e.file.endsWith('waterflow/effect.json')) {
      items.push({
        type: 'flow',
        flow: texAt(1, 'util/noflow'),
        phase: texAt(2, 'util/white'),
        speed: typeof c.speed === 'number' ? c.speed : 1,
        strength: typeof c.strength === 'number' ? c.strength : 1,
        phaseScale: typeof c.phasescale === 'number' ? c.phasescale : 2,
      })
    } else if (e.file.endsWith('foliagesway/effect.json')) {
      items.push({
        type: 'sway',
        mask: texAt(1, null),
        noise: texAt(2, 'util/noise'),
        masked: comboMask(1),
        strength: typeof c.strength === 'number' ? c.strength : 0.4,
        speed: typeof c.speeduv === 'number' ? c.speeduv : 5,
        direction: typeof c.scrolldirection === 'number' ? c.scrolldirection : 0,
        phase: typeof c.phase === 'number' ? c.phase : 0.5,
        power: typeof c.power === 'number' ? c.power : 1,
        noiseScale: typeof c.scale === 'number' ? c.scale : 0.05,
        ratio: typeof c.ratio === 'number' ? c.ratio : 0.3,
      })
    } else if (e.file.endsWith('tint/effect.json') && c.color !== undefined) {
      colorItems.push({
        type: 'tint',
        color: vec3(colorValue(c.color)),
        alpha: typeof c.alpha === 'number' ? c.alpha : 1,
        // WE combo 语义：未显式提供 → 用声明 default（BLENDMODE default:30 = BlendTint）
        blendMode: combos.BLENDMODE !== undefined ? combos.BLENDMODE : 30,
        mask: texAt(1, 'util/white'),
        masked: comboMask(1),
      })
    } else if (e.file.endsWith('pulse/effect.json')) {
      // 音频驱动脉冲（AUDIOPROCESSING）：无音频支持时跳过（WE 中无音频则 pulse=0）
      if (combos.AUDIOPROCESSING) continue
      colorItems.push({
        type: 'pulse',
        noise: texAt(1, 'util/noise'),
        mask: texAt(2, 'util/white'),
        masked: comboMask(2),
        speed: typeof c.speed === 'number' ? c.speed : 3,
        phase: typeof c.phase === 'number' ? c.phase : 0,
        amount: typeof c.amount === 'number' ? c.amount : 1,
        bounds: c.bounds !== undefined ? vec2(c.bounds) : [0, 1],
        power: typeof c.power === 'number' ? c.power : 1,
        tintLow: c.tintlow !== undefined ? vec3(c.tintlow) : [1, 1, 1],
        tintHigh: c.tinthigh !== undefined ? vec3(c.tinthigh) : [1, 1, 1],
        // WE combo 语义：未显式提供 → 声明 default（BLENDMODE:9=Add、PULSECOLOR:1=开启、PULSEALPHA:0=关闭）
        blendMode: combos.BLENDMODE !== undefined ? combos.BLENDMODE : 9,
        noiseSpeed: typeof c.noisespeed === 'number' ? c.noisespeed : 0.1,
        noiseAmount: typeof c.noiseamount === 'number' ? c.noiseamount : 0,
        pulseColor: combos.PULSECOLOR !== undefined ? combos.PULSECOLOR === 1 : true,
        pulseAlpha: combos.PULSEALPHA !== undefined ? combos.PULSEALPHA === 1 : false,
      })
    } else if (e.file.endsWith('colorkey/effect.json') && c.color !== undefined) {
      colorItems.push({
        type: 'key',
        key: vec3(colorValue(c.color)),
        fuzz: typeof c.fuzziness === 'number' ? c.fuzziness : 0,
        tol: typeof c.tolerance === 'number' ? c.tolerance : 0.1,
        keyAlpha: typeof c.alpha === 'number' ? c.alpha : 0,
        invert: combos.INVERT === 1,
        flatten: combos.FLATTEN === 1,
      })
    }
  }
  return { items, colorItems }
}

function colorValue(v) {
  return typeof v === 'string' ? v : v && v.value !== undefined ? v.value : '0 0 0'
}

function drawTri(buf, W, H, a, b, c, uva, uvb, uvc, tex, fx, layer, time, textures) {
  const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])))
  const x1 = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])))
  const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])))
  const y1 = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])))
  if (globalThis.__WE_TRACE) {
    console.log('drawTri', JSON.stringify({ a, b, c, x0, x1, y0, y1 }))
  }
  const area = edge(a, b, c)
  if (Math.abs(area) < 1e-9) return
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5
      const py = y + 0.5
      // 半边规则（GL top-left）：共享对角线上的像素只归属其中一个三角形，避免二次混合
      if (!edgeIn(b, c, [px, py]) || !edgeIn(c, a, [px, py]) || !edgeIn(a, b, [px, py])) continue
      const area2 = edge(b, c, [px, py]) + edge(c, a, [px, py]) + edge(a, b, [px, py])
      if (Math.abs(area2) < 1e-12) continue
      const w0 = edge(b, c, [px, py]) / area2
      const w1 = edge(c, a, [px, py]) / area2
      const w2 = edge(a, b, [px, py]) / area2
      const u0 = w0 * uva[0] + w1 * uvb[0] + w2 * uvc[0]
      const v0 = w0 * uva[1] + w1 * uvb[1] + w2 * uvc[1]
      // 1) 位移类：累加采样坐标（输入一律采样原始 uv）
      const { su, sv } = applyDisplacements(fx.items, u0, v0, tex, textures, time)
      // 2) 采样基础纹理
      let t = sampleTex(tex, su, sv)
      // 3) waterflow 颜色混合（在累积位移后的坐标上镜像取样）
      t = applyFlowMix(fx.items, u0, v0, su, sv, tex, textures, time, t)
      // 4) shake MASK 路径（当前场景无 MASK==1 shake，公式完整性保留）
      t = applyShakeMasks(fx.items, u0, v0, su, sv, tex, textures, time, t)
      // 5) 颜色类效果（按 effect 列表顺序）
      t = applyColorChain(fx.colorItems, t, textures, time, u0, v0)
      const r = t[0] / 255 * layer.color[0] * layer.brightness
      const g = t[1] / 255 * layer.color[1] * layer.brightness
      const b2 = t[2] / 255 * layer.color[2] * layer.brightness
      const al = t[3] / 255 * layer.alpha
      const o = (y * W + x) * 4
      const da = al
      const sa = 1 - da
      buf[o] = Math.round(r * 255 * da + buf[o] * sa)
      buf[o + 1] = Math.round(g * 255 * da + buf[o + 1] * sa)
      buf[o + 2] = Math.round(b2 * 255 * da + buf[o + 2] * sa)
      buf[o + 3] = Math.round(255 * da + buf[o + 3] * sa)
    }
  }
}

function edge(a, b, p) {
  return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
}

// GL top-left 半边规则：w>0 在内；w==0 时仅当边为 top 边（向左）或水平且向右时在内
function edgeIn(a, b, p) {
  const w = edge(a, b, p)
  if (w > 0) return true
  if (w < 0) return false
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  return dy < 0 || (dy === 0 && dx > 0)
}

function vec3(s) {
  const p = String(s).trim().split(/\s+/).map(Number)
  return [p[0] || 0, p[1] || 0, p[2] || 0]
}

function vec2(s) {
  const p = String(s).trim().split(/\s+/).map(Number)
  return [p[0] || 0, p[1] || 0]
}
