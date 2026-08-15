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
    if (tex.video) continue // 视频纹理图层：Phase 4 支持播放
    const quad = layerQuad(layer)
    const mvp = mat4Multiply(viewProj, layerMatrix(layer))
    // quad = [左, 右, 上, 下]；角点 = (x对, y对) 组合：TL, TR, BR, BL
    const corners = [[quad[0], quad[2]], [quad[1], quad[2]], [quad[1], quad[3]], [quad[0], quad[3]]].map(([x, y]) => {
      const p = mat4TransformPoint(mvp, x, y, 0)
      return [(p[0] + 1) / 2 * width, (1 - p[1]) / 2 * height]
    })
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

function layerMatrix(layer) {
  let m = mat4Identity()
  m = mat4Translate(m, layer.origin[0], layer.origin[1], layer.origin[2])
  m = mat4RotateZ(m, layer.angles[2])
  return m
}

// Phase 3 效果链（按 scene.json 列出顺序）：
// 位移类：scroll / shake / waterwaves（修改采样 uv）；颜色类：tint / colorkey（作用于采样后的颜色）
function effectChain(layer) {
  const items = []
  const tints = []
  const pulses = []
  const keys = []
  for (const e of layer.effects || []) {
    if (!e.visible) continue
    const pass = e.passes && e.passes[0]
    const c = pass ? pass.constantshadervalues : {}
    const combos = pass ? pass.combos : {}
    if (e.file.endsWith('scroll/effect.json')) {
      const sx = typeof c.speedx === 'number' ? c.speedx : 0
      const sy = typeof c.speedy === 'number' ? c.speedy : 0
      const repeat = c.repeat !== undefined ? vec2(c.repeat) : [1, 1]
      items.push({ type: 'scroll', sx, sy, rx: repeat[0], ry: repeat[1] })
    } else if (e.file.endsWith('shake/effect.json')) {
      items.push({
        type: 'shake',
        mask: pass && pass.textures && pass.textures[1],
        speed: typeof c.speed === 'number' ? c.speed : 1,
        amp: typeof c.strength === 'number' ? c.strength : 0.1,
        friction: c.friction !== undefined ? vec2(c.friction) : [1, 1],
        bounds: c.bounds !== undefined ? vec2(c.bounds) : [0, 1],
        direction: combos.DIRECTION || 0,
      })
    } else if (e.file.endsWith('waterwaves/effect.json')) {
      items.push({
        type: 'waves',
        mask: pass && pass.textures && pass.textures[1],
        speed: typeof c.speed === 'number' ? c.speed : 5,
        scale: typeof c.scale === 'number' ? c.scale : 200,
        strength: typeof c.strength === 'number' ? c.strength : 0.1,
        direction: typeof c.direction === 'number' ? c.direction : 0,
        perspective: typeof c.perspective === 'number' ? c.perspective : 0,
      })
    } else if (e.file.endsWith('waterflow/effect.json')) {
      items.push({
        type: 'flow',
        mask: pass && pass.textures && pass.textures[1],
        phase: pass && pass.textures && pass.textures[2],
        speed: typeof c.speed === 'number' ? c.speed : 1,
        strength: typeof c.strength === 'number' ? c.strength : 1,
        phaseScale: typeof c.phasescale === 'number' ? c.phasescale : 2,
      })
    } else if (e.file.endsWith('foliagesway/effect.json')) {
      items.push({
        type: 'sway',
        mask: pass && pass.textures && pass.textures[1],
        masked: (pass && pass.combos && pass.combos.MASK) === 1,
        strength: typeof c.strength === 'number' ? c.strength : 0.4,
        speed: typeof c.speeduv === 'number' ? c.speeduv : 5,
        direction: typeof c.scrolldirection === 'number' ? c.scrolldirection : 0,
        phase: typeof c.phase === 'number' ? c.phase : 0.5,
        power: typeof c.power === 'number' ? c.power : 1,
        noiseScale: typeof c.scale === 'number' ? c.scale : 0.05,
        ratio: typeof c.ratio === 'number' ? c.ratio : 0.3,
      })
    } else if (e.file.endsWith('tint/effect.json') && c.color !== undefined) {
      tints.push({ color: vec3(typeof c.color === 'string' ? c.color : c.color.value), alpha: typeof c.alpha === 'number' ? c.alpha : 1 })
    } else if (e.file.endsWith('pulse/effect.json')) {
      // 音频驱动脉冲（AUDIOPROCESSING）：无音频支持时跳过（WE 中无音频则 pulse=0）
      if (pass && pass.combos && pass.combos.AUDIOPROCESSING) continue
      pulses.push({
        tintLow: c.tintlow !== undefined ? vec3(c.tintlow) : [1, 1, 1],
        tintHigh: c.tinthigh !== undefined ? vec3(c.tinthigh) : [1, 1, 1],
        speed: typeof c.speed === 'number' ? c.speed : 3,
        phase: typeof c.phase === 'number' ? c.phase : 0,
        amount: typeof c.amount === 'number' ? c.amount : 1,
        bounds: c.bounds !== undefined ? vec2(c.bounds) : [0, 1],
      })
    } else if (e.file.endsWith('colorkey/effect.json') && c.color !== undefined) {
      keys.push({
        key: vec3(typeof c.color === 'string' ? c.color : c.color.value),
        fuzz: typeof c.fuzziness === 'number' ? c.fuzziness : 0,
        tol: typeof c.tolerance === 'number' ? c.tolerance : 0.1,
      })
    }
  }
  return { items, tints, pulses, keys }
}

function sample(tex, u, v) {
  // 双线性过滤（与 WE 纹理线性过滤一致；噪声/流向等高频纹理依赖平滑相位）
  const x = u * tex.width - 0.5
  const y = v * tex.height - 0.5
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const cx = (xi) => (xi < 0 ? 0 : xi >= tex.width ? tex.width - 1 : xi)
  const cy = (yi) => (yi < 0 ? 0 : yi >= tex.height ? tex.height - 1 : yi)
  const o00 = (cy(y0) * tex.width + cx(x0)) * 4
  const o10 = (cy(y0) * tex.width + cx(x0 + 1)) * 4
  const o01 = (cy(y0 + 1) * tex.width + cx(x0)) * 4
  const o11 = (cy(y0 + 1) * tex.width + cx(x0 + 1)) * 4
  const out = [0, 0, 0, 0]
  for (let c = 0; c < 4; c++) {
    const a = tex.rgba[o00 + c] * (1 - fx) + tex.rgba[o10 + c] * fx
    const b = tex.rgba[o01 + c] * (1 - fx) + tex.rgba[o11 + c] * fx
    out[c] = a * (1 - fy) + b * fy
  }
  return out
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
  const ia = 1 / area
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5
      const py = y + 0.5
      const w0 = edge(b, c, [px, py]) * ia
      const w1 = edge(c, a, [px, py]) * ia
      const w2 = edge(a, b, [px, py]) * ia
      if (w0 < 0 || w1 < 0 || w2 < 0) continue
      const u0 = w0 * uva[0] + w1 * uvb[0] + w2 * uvc[0]
      const v0 = w0 * uva[1] + w1 * uvb[1] + w2 * uvc[1]
      // 位移类效果：WE 各效果 = 独立滤镜层，其输入（噪声/蒙版/流向/相位）一律采样自原始 uv，
      // 位移只累加到最终采样坐标（不链式污染下一个效果的输入）
      let su = u0
      let sv = v0
      for (const it of fx.items) {
        if (it.type === 'scroll') {
          const ox = Math.sign(it.sx) * it.sx * it.sx * time
          const oy = Math.sign(it.sy) * it.sy * it.sy * time
          su = frac((u0 + ox) * it.rx)
          sv = frac((v0 + oy) * it.ry)
        } else if (it.type === 'shake') {
          const m = textures.get(it.mask) || WHITE
          const f = sample(m, u0, v0)
          const flow = m.rg88 ? [f[3] / 255, f[0] / 255] : [f[0] / 255, f[1] / 255]
          const flowMask = [(flow[0] - 0.498) * 2, (flow[1] - 0.498) * 2]
          // WE 的 M_PI_2 = 2π：sin(frac(t/2π)·2π) = sin(t) —— 平滑正弦，无跳变
          const t2 = it.speed * time
          let off = Math.sin(t2) * 0.498 + 0.5
          const base = Math.cos(t2) >= 0 ? 1 : 0
          off = base === 1 ? Math.pow(off, it.friction[1]) : 1 - Math.pow(1 - off, it.friction[0])
          off = Math.min(1, Math.max(0, (off - it.bounds[0]) * (1 / (it.bounds[1] - it.bounds[0]))))
          off = off * 2 - 1
          const amp2 = it.amp * it.amp
          su += off * amp2 * flowMask[0]
          sv += off * amp2 * flowMask[1]
        } else if (it.type === 'waves') {
          const m = textures.get(it.mask) || WHITE
          const f = sample(m, u0, v0)
          const mask = m.rg88 ? f[3] / 255 : f[0] / 255
          const dir = rotate2([0, 1], it.direction)
          const pos = Math.abs((u0 - 0.5) * dir[0] + (v0 - 0.5) * dir[1])
          const dist = time * it.speed + (u0 * dir[0] + v0 * dir[1]) * (it.scale + it.perspective * pos)
          const s = Math.sin(dist) * (it.strength * it.strength + it.perspective * pos) * mask
          su += dir[1] * s
          sv += -dir[0] * s
        } else if (it.type === 'sway') {
          const noise = textures.get('util/noise') || WHITE
          const n = sample(noise, u0 * it.noiseScale, v0 * it.noiseScale)
          const aspect = (tex.width / tex.height) * it.ratio
          const zw = rotate2([1 / aspect, aspect], it.direction)
          const params = rotate2([u0, v0], it.direction)
          let amp = it.strength * it.strength * 0.005
          // 摆动蒙版：pass 提供了蒙版纹理即启用（WE 编辑器行为），限制摆动区域
          if (it.mask) {
            const swayMask = textures.get(it.mask)
            if (swayMask) {
              const mf = sample(swayMask, u0, v0)
              amp *= swayMask.rg88 ? mf[3] / 255 : mf[0] / 255
            }
          }
          const phase = (n[1] / 255 * Math.PI * 2 + params[0] * 10 + params[1] * 5) * it.phase
          const sines = [1, -0.16161616, 0.0083333, -0.00019841].map((k) => {
            const x = Math.sin(phase + it.speed * time * k)
            return Math.pow(Math.abs(x), it.power) * Math.sign(x)
          })
          const csines = [-0.5, 0.041666666, -0.0013888889, 0.000024801587].map((k) => {
            const x = Math.sin(0.4 + phase + it.speed * time * k)
            return Math.pow(Math.abs(x), it.power) * Math.sign(x)
          })
          const sumA = sines[0] + sines[1] + sines[2] + sines[3]
          const sumC = csines[0] + csines[1] + csines[2] + csines[3]
          su += zw[0] * sumA * amp
          sv += zw[1] * sumC * amp
        }
      }
      const t0 = sample(tex, su, sv)
      let t = t0
      // waterflow：蒙版/相位采样自原始 uv；镜像取样在累积位移后的坐标
      for (const it of fx.items) {
        if (it.type !== 'flow') continue
        const m = textures.get(it.mask) || WHITE
        const f = sample(m, u0, v0)
        const flow = m.rg88 ? [f[3] / 255, f[0] / 255] : [f[0] / 255, f[1] / 255]
        const mx = (flow[0] - 0.498) * 2
        const my = (flow[1] - 0.498) * 2
        const amount = Math.min(1, Math.hypot(mx, my))
        const phaseTex = textures.get(it.phase) || WHITE
        const pf = sample(phaseTex, u0 * it.phaseScale, v0 * it.phaseScale)
        const phRatio = smoothstep(0.2, 0.8, pf[0] / 255)
        const amp = it.strength * 0.1
        const xw = frac(time * it.speed)
        const tv = xw < 0.5 ? xw * 2 - 0.5 : 1.5 - xw * 2
        const ox = mx * amp * tv
        const oy = my * amp * tv
        const fa = sample(tex, su + ox, sv + oy)
        const fb = sample(tex, su - ox, sv - oy)
        const fM = mix4(fa, fb, phRatio)
        t = mix4(t, fM, amount)
      }
      let r = t[0] / 255 * layer.color[0] * layer.brightness
      let g = t[1] / 255 * layer.color[1] * layer.brightness
      let b2 = t[2] / 255 * layer.color[2] * layer.brightness
      let al = t[3] / 255 * layer.alpha
      for (const tint of fx.tints) {
        r = r * (1 - tint.alpha) + tint.color[0] * tint.alpha
        g = g * (1 - tint.alpha) + tint.color[1] * tint.alpha
        b2 = b2 * (1 - tint.alpha) + tint.color[2] * tint.alpha
      }
      for (const pu of fx.pulses) {
        const p = smoothstep(pu.bounds[0], pu.bounds[1], Math.sin(time * pu.speed + pu.phase) * 0.5 + 0.5) * pu.amount
        const low = [r * pu.tintLow[0], g * pu.tintLow[1], b2 * pu.tintLow[2]]
        const high = [r * pu.tintHigh[0], g * pu.tintHigh[1], b2 * pu.tintHigh[2]]
        const sl = softlight(low, high)
        r = low[0] * (1 - p) + sl[0] * p
        g = low[1] * (1 - p) + sl[1] * p
        b2 = low[2] * (1 - p) + sl[2] * p
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

function frac(x) {
  return x - Math.floor(x)
}

function mix4(a, b, t) {
  return [a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t, a[2] * (1 - t) + b[2] * t, a[3] * (1 - t) + b[3] * t]
}

function rotate2(v, a) {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c]
}

// W3C soft-light 混合（近似 WE 图像混合模式 22）
function softlight(base, blend) {
  const out = [0, 0, 0]
  for (let i = 0; i < 3; i++) {
    const Cb = Math.min(1, Math.max(0, base[i]))
    const Cs = Math.min(1, Math.max(0, blend[i]))
    if (Cs <= 0.5) {
      out[i] = Cb - (1 - 2 * Cs) * Cb * (1 - Cb)
    } else {
      const D = Cb <= 0.25 ? ((16 * Cb - 12) * Cb + 4) * Cb : Math.sqrt(Cb)
      out[i] = Cb + (2 * Cs - 1) * (D - Cb)
    }
  }
  return out
}

function vec3(s) {
  const p = String(s).trim().split(/\s+/).map(Number)
  return [p[0] || 0, p[1] || 0, p[2] || 0]
}

function vec2(s) {
  const p = String(s).trim().split(/\s+/).map(Number)
  return [p[0] || 0, p[1] || 0]
}
