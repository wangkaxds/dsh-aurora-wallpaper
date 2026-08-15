// CPU 光栅器：与 WebGL 渲染器共享同一套场景模型与矩阵数学，用于无头验证与截图。
// Phase 2 实现：图像/纯色图层 + tint + colorkey 效果（t=0 时 scroll/shake 等恒等，暂跳过）。
import { mat4Identity, mat4Multiply, mat4RotateZ, mat4Translate, mat4TransformPoint, buildCamera } from './math.js'

const WHITE = { width: 1, height: 1, rgba: new Uint8Array([255, 255, 255, 255]) }

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
    const quad = layerQuad(layer)
    const mvp = mat4Multiply(viewProj, layerMatrix(layer))
    // quad = [左, 右, 上, 下]；角点 = (x对, y对) 组合：TL, TR, BR, BL
    const corners = [[quad[0], quad[2]], [quad[1], quad[2]], [quad[1], quad[3]], [quad[0], quad[3]]].map(([x, y]) => {
      const p = mat4TransformPoint(mvp, x, y, 0)
      return [(p[0] + 1) / 2 * width, (1 - p[1]) / 2 * height]
    })
    const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]]
    const fx = effectChain(layer)
    drawTri(rgba, width, height, corners[0], corners[1], corners[2], uvs[0], uvs[1], uvs[2], tex, fx, layer)
    drawTri(rgba, width, height, corners[0], corners[2], corners[3], uvs[0], uvs[2], uvs[3], tex, fx, layer)
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

function layerMatrix(layer) {
  let m = mat4Identity()
  m = mat4Translate(m, layer.origin[0], layer.origin[1], layer.origin[2])
  m = mat4RotateZ(m, layer.angles[2])
  return m
}

// Phase 2 效果链：tint（mix 混合）+ colorkey（距离键控），按 scene.json 列出顺序执行
function effectChain(layer) {
  const tints = []
  const keys = []
  for (const e of layer.effects || []) {
    if (!e.visible) continue
    const pass = e.passes && e.passes[0]
    const c = pass ? pass.constantshadervalues : {}
    if (e.file.endsWith('tint/effect.json') && c.color !== undefined) {
      tints.push({ color: vec3(typeof c.color === 'string' ? c.color : c.color.value), alpha: typeof c.alpha === 'number' ? c.alpha : 1 })
    } else if (e.file.endsWith('colorkey/effect.json') && c.color !== undefined) {
      keys.push({
        key: vec3(typeof c.color === 'string' ? c.color : c.color.value),
        fuzz: typeof c.fuzziness === 'number' ? c.fuzziness : 0,
        tol: typeof c.tolerance === 'number' ? c.tolerance : 0.1,
      })
    }
  }
  return { tints, keys }
}

function sample(tex, u, v) {
  let x = Math.floor(u * tex.width)
  let y = Math.floor(v * tex.height)
  if (x < 0) x = 0
  if (x >= tex.width) x = tex.width - 1
  if (y < 0) y = 0
  if (y >= tex.height) y = tex.height - 1
  const o = (y * tex.width + x) * 4
  return [tex.rgba[o], tex.rgba[o + 1], tex.rgba[o + 2], tex.rgba[o + 3]]
}

function drawTri(buf, W, H, a, b, c, uva, uvb, uvc, tex, fx, layer) {
  const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])))
  const x1 = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])))
  const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])))
  const y1 = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])))
  if (globalThis.__WE_TRACE) {
    console.log('drawTri', JSON.stringify({ a, b, c, x0, x1, y0, y1 }))
  }
  const area = edge(a, b, c)
  if (Math.abs(area) < 1e-9) return
  const ia = 1 / area
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5
      const py = y + 0.5
      const w0 = edge(b, c, [px, py]) * ia
      const w1 = edge(c, a, [px, py]) * ia
      const w2 = edge(a, b, [px, py]) * ia
      if (w0 < 0 || w1 < 0 || w2 < 0) continue
      const u = w0 * uva[0] + w1 * uvb[0] + w2 * uvc[0]
      const v = w0 * uva[1] + w1 * uvb[1] + w2 * uvc[1]
      const t = sample(tex, u, v)
      let r = t[0] / 255 * layer.color[0] * layer.brightness
      let g = t[1] / 255 * layer.color[1] * layer.brightness
      let b2 = t[2] / 255 * layer.color[2] * layer.brightness
      let al = t[3] / 255 * layer.alpha
      for (const tint of fx.tints) {
        r = r * (1 - tint.alpha) + tint.color[0] * tint.alpha
        g = g * (1 - tint.alpha) + tint.color[1] * tint.alpha
        b2 = b2 * (1 - tint.alpha) + tint.color[2] * tint.alpha
      }
      for (const k of fx.keys) {
        const delta = Math.abs(k.key[0] - r) + Math.abs(k.key[1] - g) + Math.abs(k.key[2] - b2)
        const blend = smoothstep(0.001, 0.002 + k.fuzz, delta - k.tol)
        al *= mix(0, 1, blend)
      }
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

function smoothstep(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

function mix(a, b, t) {
  return a * (1 - t) + b * t
}

function vec3(s) {
  const p = String(s).trim().split(/\s+/).map(Number)
  return [p[0] || 0, p[1] || 0, p[2] || 0]
}
