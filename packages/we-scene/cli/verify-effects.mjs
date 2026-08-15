// 效果链数值验证：node cli/verify-effects.mjs [--cpu-only]
// 1) CPU（effects.js / cpu.js）vs 独立参考公式（手写自 WE shader 原文）
// 2) WebGL（renderer.js，无头 Edge CDP）vs CPU —— 完整场景逐像素对比
// 全部通过 = 两渲染器都是 shader 的字面翻译。参考实现与运行时代码独立编写，避免同源错误。
import { applyDisplacements, applyFlowMix, applyShakeMasks, applyColorChain, applyBlending, sampleTex } from '../src/render/effects.js'
import { renderScene } from '../src/render/cpu.js'
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const M_2PI = 6.28318530718
const EPS = 1e-9
const ONLY_CPU = process.argv.includes('--cpu-only')
const VERIFY_URL = 'http://localhost:8123/demo/verify.html'
const CDP = 'http://127.0.0.1:9222'

let failures = 0
let checks = 0
function ok(cond, name, detail) {
  checks++
  if (!cond) {
    failures++
    console.log('  ✗ ' + name + (detail ? ' — ' + detail : ''))
  }
}
function section(name) {
  console.log('== ' + name + ' ==')
}

// ---------- 合成纹理（8x8 确定性） ----------
function makeTex(fn, rg88 = false) {
  const w = 8
  const h = 8
  const rgba = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = fn(x, y)
      rgba[(y * w + x) * 4] = p[0]
      rgba[(y * w + x) * 4 + 1] = p[1]
      rgba[(y * w + x) * 4 + 2] = p[2]
      rgba[(y * w + x) * 4 + 3] = p[3]
    }
  }
  return { width: w, height: h, rgba, rg88 }
}
const T = {
  base: makeTex((x, y) => [x * 31 + 10, y * 29 + 5, 128, 255]),
  mask: makeTex((x, y) => [Math.round((x + y) * 255 / 14), 0, 0, 255]),
  flow: makeTex((x, y) => [Math.round(128 + 40 * Math.sin((2 * Math.PI * x) / 8)), Math.round(128 + 40 * Math.sin((2 * Math.PI * y) / 8)), 128, 255]),
  flowRG: makeTex((x, y) => {
    const R = Math.round(128 + 40 * Math.sin((2 * Math.PI * x) / 8))
    const G = Math.round(128 + 40 * Math.sin((2 * Math.PI * y) / 8))
    return [G, G, G, R] // RG88 解码后：rgb=G, a=R
  }, true),
  noise: makeTex((x, y) => [Math.round((x * 37 + y * 61) % 256), Math.round((x * 97 + y * 13) % 256), 0, 255]),
  phase: makeTex((x, y) => [Math.round(x * 255 / 7), 0, 0, 255]),
  white: makeTex(() => [255, 255, 255, 255]),
  noflow: makeTex(() => [127, 127, 127, 255]),
}
const TEX = {
  'util/white': T.white,
  'util/noflow': T.noflow,
  'util/noise': T.noise,
  base: T.base,
  mask: T.mask,
  flow: T.flow,
  flowRG: T.flowRG,
  noise: T.noise,
  phase: T.phase,
}
const TEXMAP = new Map(Object.entries(TEX)) // 运行时 API（effects.js）用 Map

// ---------- 独立参考实现（照 shader 原文手写，不复用运行时代码） ----------
function refSample(tex, u, v) {
  const w = tex.width
  const h = tex.height
  const x = u * w - 0.5
  const y = v * h - 0.5
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const px = (i) => Math.max(0, Math.min(w - 1, i))
  const py = (j) => Math.max(0, Math.min(h - 1, j))
  const g = (i, j, c) => tex.rgba[(py(j) * w + px(i)) * 4 + c]
  const out = []
  for (let c = 0; c < 4; c++) {
    const a = g(x0, y0, c) * (1 - fx) + g(x0 + 1, y0, c) * fx
    const b = g(x0, y0 + 1, c) * (1 - fx) + g(x0 + 1, y0 + 1, c) * fx
    out.push(a * (1 - fy) + b * fy)
  }
  return out
}
const refFrac = (x) => x - Math.floor(x)
const refClamp01 = (x) => Math.max(0, Math.min(1, x))
function refRot(v, a) {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c]
}
function refFlowCh(tex, f) {
  return tex.rg88 ? [f[3] / 255, f[0] / 255] : [f[0] / 255, f[1] / 255]
}
function refMaskCh(tex, f) {
  return tex.rg88 ? f[3] / 255 : f[0] / 255
}
function refSmooth(e0, e1, x) {
  const t = refClamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
function refMix4(a, b, k) {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k]
}

// scroll.vert:18-20 / scroll.frag:10
function refScroll(it, u, v, t) {
  const ox = Math.sign(it.sx) * it.sx * it.sx * t
  const oy = Math.sign(it.sy) * it.sy * it.sy * t
  return [refFrac((u + ox) * it.rx), refFrac((v + oy) * it.ry)]
}
// shake.frag:28-79
function refShake(it, u, v, t) {
  const pf = refSample(TEX[it.phase], u, v)
  const flowPhase = (pf[0] / 255) * M_2PI
  const f = refSample(TEX[it.flow], u, v)
  const flow = refFlowCh(TEX[it.flow], f)
  const fm = [(flow[0] - 0.498) * 2, (flow[1] - 0.498) * 2]
  const t2 = it.speed * t + flowPhase
  let off = Math.sin(refFrac(t2 / M_2PI) * M_2PI)
  off = off * 0.498 + 0.5
  const base = Math.cos(t2) >= 0 ? 1 : 0
  off = base === 1 ? Math.pow(off, it.fy) : 1 - Math.pow(1 - off, it.fx)
  off = refClamp01((off - it.bounds[0]) * (1 / (it.bounds[1] - it.bounds[0])))
  if (it.direction === 0) off = off * 2 - 1
  else if (it.direction === 2) off = off - 1
  const a2 = it.amp * it.amp
  return [off * a2 * fm[0], off * a2 * fm[1]]
}
// waterwaves.frag:15-23
function refWaves(it, u, v, t) {
  const f = refSample(TEX[it.mask], u, v)
  const mask = refMaskCh(TEX[it.mask], f)
  const dir = refRot([0, 1], it.direction)
  const pos = Math.abs((u - 0.5) * dir[0] + (v - 0.5) * dir[1])
  const dist = t * it.speed + (u * dir[0] + v * dir[1]) * (it.scale + it.perspective * pos)
  const s = Math.sin(dist) * (it.strength * it.strength + it.perspective * pos) * mask
  return [dir[1] * s, -dir[0] * s]
}
// foliagesway.vert:44-50 + frag:24-46
function refSway(it, u, v, t, tex) {
  const n = refSample(TEX[it.noise], u * it.noiseScale, v * it.noiseScale)
  const aspect = (tex.width / tex.height) * it.ratio
  const zw = refRot([1 / aspect, aspect], it.direction)
  const pa = refRot([u, v], it.direction)
  let amp = it.strength * it.strength * 0.005
  if (it.masked && it.mask) amp *= refMaskCh(TEX[it.mask], refSample(TEX[it.mask], u, v))
  const phase = (n[1] / 255 * M_2PI + pa[0] * 10 + pa[1] * 5) * it.phase
  const ks = [1, -0.16161616, 0.0083333, -0.00019841]
  const kc = [-0.5, 0.041666666, -0.0013888889, 0.000024801587]
  let sa = 0
  let sc = 0
  for (let i = 0; i < 4; i++) {
    let x = Math.sin(phase + it.speed * t * ks[i])
    sa += Math.pow(Math.abs(x), it.power) * Math.sign(x)
    x = Math.sin(0.4 + phase + it.speed * t * kc[i])
    sc += Math.pow(Math.abs(x), it.power) * Math.sign(x)
  }
  return [zw[0] * sa * amp, zw[1] * sc * amp]
}
// waterflow.frag:16-45
function refFlow(it, u, v, su, sv, t, rgba) {
  const pf = refSample(TEX[it.phase], u * it.phaseScale, v * it.phaseScale)
  const flowPhase = pf[0] / 255
  const f = refSample(TEX[it.flow], u, v)
  const flow = refFlowCh(TEX[it.flow], f)
  const fm = [(flow[0] - 0.498) * 2, (flow[1] - 0.498) * 2]
  const amount = Math.hypot(fm[0], fm[1])
  const amp = it.strength * 0.1
  const cx = refFrac(t * it.speed)
  const cy = refFrac(t * it.speed + 0.5)
  const cz = refFrac(0.25 + t * it.speed)
  const cw = refFrac(0.25 + t * it.speed + 0.5)
  const cyc = [cx - 0.5, cy - 0.5, cz - 0.5, cw - 0.5]
  const blend = 2 * Math.abs(cx - 0.5)
  const blend2 = 2 * Math.abs(cz - 0.5)
  const off = (k) => [fm[0] * amp * k, fm[1] * amp * k]
  const oa = off(cyc[0])
  const ob = off(cyc[1])
  const oc = off(cyc[2])
  const od = off(cyc[3])
  const albedo = refSample(TEX.base, su, sv)
  const fa = refSample(TEX.base, su + oa[0], sv + oa[1])
  const fb = refSample(TEX.base, su + ob[0], sv + ob[1])
  const fc = refSample(TEX.base, su + oc[0], sv + oc[1])
  const fd = refSample(TEX.base, su + od[0], sv + od[1])
  const flowA = refMix4(fa, fb, blend)
  const flowB = refMix4(fc, fd, blend2)
  const flowOut = refMix4(flowA, flowB, refSmooth(0.2, 0.8, flowPhase))
  return refMix4(albedo, flowOut, amount)
}
// 混合模式（common_blending.h 手写参考）
function refBlend(mode, A, B, op) {
  const mix3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
  const per = (fn) => mix3(A, fn(A, B), op)
  switch (mode) {
    case 0: return mix3(A, B, op)
    case 1: return per((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])])
    case 2: return per((a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]])
    case 3: return per((a, b) => [b[0] === 0 ? 0 : Math.max(1 - (1 - a[0]) / b[0], 0), b[1] === 0 ? 0 : Math.max(1 - (1 - a[1]) / b[1], 0), b[2] === 0 ? 0 : Math.max(1 - (1 - a[2]) / b[2], 0)])
    case 4: return per((a, b) => [Math.max(a[0] + b[0] - 1, 0), Math.max(a[1] + b[1] - 1, 0), Math.max(a[2] + b[2] - 1, 0)])
    case 5: return [Math.min(A[0], B[0]), Math.min(A[1], B[1]), Math.min(A[2], B[2])]
    case 6: return per((a, b) => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])])
    case 7: return per((a, b) => [1 - (1 - a[0]) * (1 - b[0]), 1 - (1 - a[1]) * (1 - b[1]), 1 - (1 - a[2]) * (1 - b[2])])
    case 8: return per((a, b) => [b[0] === 1 ? 1 : Math.min(a[0] / (1 - b[0]), 1), b[1] === 1 ? 1 : Math.min(a[1] / (1 - b[1]), 1), b[2] === 1 ? 1 : Math.min(a[2] / (1 - b[2]), 1)])
    case 9: return per((a, b) => [Math.min(a[0] + b[0], 1), Math.min(a[1] + b[1], 1), Math.min(a[2] + b[2], 1)])
    case 10: return [Math.max(A[0], B[0]), Math.max(A[1], B[1]), Math.max(A[2], B[2])]
    case 11: return per((a, b) => [a[0] < 0.5 ? 2 * a[0] * b[0] : 1 - 2 * (1 - a[0]) * (1 - b[0]), a[1] < 0.5 ? 2 * a[1] * b[1] : 1 - 2 * (1 - a[1]) * (1 - b[1]), a[2] < 0.5 ? 2 * a[2] * b[2] : 1 - 2 * (1 - a[2]) * (1 - b[2])])
    case 12: return per((a, b) => [b[0] < 0.5 ? 2 * a[0] * b[0] + a[0] * a[0] * (1 - 2 * b[0]) : Math.sqrt(a[0]) * (2 * b[0] - 1) + 2 * a[0] * (1 - b[0]), b[1] < 0.5 ? 2 * a[1] * b[1] + a[1] * a[1] * (1 - 2 * b[1]) : Math.sqrt(a[1]) * (2 * b[1] - 1) + 2 * a[1] * (1 - b[1]), b[2] < 0.5 ? 2 * a[2] * b[2] + a[2] * a[2] * (1 - 2 * b[2]) : Math.sqrt(a[2]) * (2 * b[2] - 1) + 2 * a[2] * (1 - b[2])])
    case 13: return per((a, b) => [b[0] < 0.5 ? 2 * b[0] * a[0] : 1 - 2 * (1 - b[0]) * (1 - a[0]), b[1] < 0.5 ? 2 * b[1] * a[1] : 1 - 2 * (1 - b[1]) * (1 - a[1]), b[2] < 0.5 ? 2 * b[2] * a[2] : 1 - 2 * (1 - b[2]) * (1 - a[2])])
    case 14: return per((a, b) => [refVivid(a[0], b[0]), refVivid(a[1], b[1]), refVivid(a[2], b[2])])
    case 15: return per((a, b) => [b[0] < 0.5 ? Math.max(a[0] + 2 * b[0] - 1, 0) : Math.min(a[0] + 2 * (b[0] - 0.5), 1), b[1] < 0.5 ? Math.max(a[1] + 2 * b[1] - 1, 0) : Math.min(a[1] + 2 * (b[1] - 0.5), 1), b[2] < 0.5 ? Math.max(a[2] + 2 * b[2] - 1, 0) : Math.min(a[2] + 2 * (b[2] - 0.5), 1)])
    case 16: return per((a, b) => [b[0] < 0.5 ? Math.min(a[0], 2 * b[0]) : Math.max(a[0], 2 * (b[0] - 0.5)), b[1] < 0.5 ? Math.min(a[1], 2 * b[1]) : Math.max(a[1], 2 * (b[1] - 0.5)), b[2] < 0.5 ? Math.min(a[2], 2 * b[2]) : Math.max(a[2], 2 * (b[2] - 0.5))])
    case 17: return per((a, b) => [refVivid(a[0], b[0]) < 0.5 ? 0 : 1, refVivid(a[1], b[1]) < 0.5 ? 0 : 1, refVivid(a[2], b[2]) < 0.5 ? 0 : 1])
    case 18: return per((a, b) => [Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2])])
    case 19: return per((a, b) => [a[0] + b[0] - 2 * a[0] * b[0], a[1] + b[1] - 2 * a[1] * b[1], a[2] + b[2] - 2 * a[2] * b[2]])
    case 20: return per((a, b) => [Math.max(a[0] + b[0] - 1, 0), Math.max(a[1] + b[1] - 1, 0), Math.max(a[2] + b[2] - 1, 0)])
    case 21: return per((a, b) => [b[0] === 1 ? 1 : Math.min(a[0] * a[0] / (1 - b[0]), 1), b[1] === 1 ? 1 : Math.min(a[1] * a[1] / (1 - b[1]), 1), b[2] === 1 ? 1 : Math.min(a[2] * a[2] / (1 - b[2]), 1)])
    case 22: return per((a, b) => [a[0] === 1 ? 1 : Math.min(b[0] * b[0] / (1 - a[0]), 1), a[1] === 1 ? 1 : Math.min(b[1] * b[1] / (1 - a[1]), 1), a[2] === 1 ? 1 : Math.min(b[2] * b[2] / (1 - a[2]), 1)])
    case 23: return per((a, b) => [Math.min(a[0], b[0]) - Math.max(a[0], b[0]) + 1, Math.min(a[1], b[1]) - Math.max(a[1], b[1]) + 1, Math.min(a[2], b[2]) - Math.max(a[2], b[2]) + 1])
    case 24: return per((a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2])
    case 25: return per((a, b) => [1 - Math.abs(1 - a[0] - b[0]), 1 - Math.abs(1 - a[1] - b[1]), 1 - Math.abs(1 - a[2] - b[2])])
    case 30: { const m = Math.max(A[0], Math.max(A[1], A[2])); return mix3(A, [m * B[0], m * B[1], m * B[2]], op) }
    case 31: return [A[0] + B[0] * op, A[1] + B[1] * op, A[2] + B[2] * op]
    case 32: return mix3(A, [A[0] + A[0] * B[0], A[1] + A[1] * B[1], A[2] + A[2] * B[2]], op)
    default: return mix3(A, B, op) // combo 缺失 fallthrough = Normal
  }
}
function refVivid(a, b) {
  if (b < 0.5) {
    const bb = 2 * b
    return bb === 0 ? 0 : Math.max(1 - (1 - a) / bb, 0)
  }
  const bb = 2 * (b - 0.5)
  return bb === 1 ? 1 : Math.min(a / (1 - bb), 1)
}
function refRgbToHsl(c) {
  const fmin = Math.min(c[0], Math.min(c[1], c[2]))
  const fmax = Math.max(c[0], Math.max(c[1], c[2]))
  const delta = fmax - fmin
  const h = [0, 0, 0]
  h[2] = (fmax + fmin) / 2
  if (delta !== 0) {
    h[1] = h[2] < 0.5 ? delta / (fmax + fmin) : delta / (2 - fmax - fmin)
    const dR = ((fmax - c[0]) / 6 + delta / 2) / delta
    const dG = ((fmax - c[1]) / 6 + delta / 2) / delta
    const dB = ((fmax - c[2]) / 6 + delta / 2) / delta
    if (c[0] === fmax) h[0] = dB - dG
    else if (c[1] === fmax) h[0] = 1 / 3 + dR - dB
    else if (c[2] === fmax) h[0] = 2 / 3 + dG - dR
    if (h[0] < 0) h[0] += 1
    else if (h[0] > 1) h[0] -= 1
  }
  return h
}
function refHueToRgb(f1, f2, hue) {
  if (hue < 0) hue += 1
  else if (hue > 1) hue -= 1
  if (6 * hue < 1) return f1 + (f2 - f1) * 6 * hue
  if (2 * hue < 1) return f2
  if (3 * hue < 2) return f1 + (f2 - f1) * ((2 / 3 - hue) * 6)
  return f1
}
function refHslToRgb(h) {
  if (h[1] === 0) return [h[2], h[2], h[2]]
  const f2 = h[2] < 0.5 ? h[2] * (1 + h[1]) : h[2] + h[1] - h[1] * h[2]
  const f1 = 2 * h[2] - f2
  return [refHueToRgb(f1, f2, h[0] + 1 / 3), refHueToRgb(f1, f2, h[0]), refHueToRgb(f1, f2, h[0] - 1 / 3)]
}
function refBlendHsl(mode, A, B, op) {
  const ah = refRgbToHsl(A)
  const bh = refRgbToHsl(B)
  let R
  if (mode === 26) R = refHslToRgb([bh[0], ah[1], ah[2]])
  else if (mode === 27) R = refHslToRgb([ah[0], bh[1], ah[2]])
  else if (mode === 28) R = refHslToRgb([bh[0], bh[1], ah[2]])
  else R = refHslToRgb([ah[0], ah[1], bh[2]])
  return [A[0] + (R[0] - A[0]) * op, A[1] + (R[1] - A[1]) * op, A[2] + (R[2] - A[2]) * op]
}

// 颜色链参考（tint.frag / pulse.frag / colorkey.frag）
function refColorChain(items, t, time, u, v) {
  for (const it of items) {
    if (it.type === 'tint') {
      let mask = it.alpha
      if (it.masked && it.mask) mask *= refMaskCh(TEX[it.mask], refSample(TEX[it.mask], u, v))
      let rgb
      if (it.blendMode >= 26 && it.blendMode <= 29) rgb = refBlendHsl(it.blendMode, [t[0] / 255, t[1] / 255, t[2] / 255], it.color, mask)
      else rgb = refBlend(it.blendMode, [t[0] / 255, t[1] / 255, t[2] / 255], it.color, mask)
      t = [rgb[0] * 255, rgb[1] * 255, rgb[2] * 255, it.blendMode === 0 ? 255 : t[3]]
    } else if (it.type === 'pulse') {
      const sample = it.masked ? t.slice() : null
      let pulse = refSmooth(it.bounds[0], it.bounds[1], Math.sin(time * it.speed + it.phase) * 0.5 + 0.5) * it.amount
      if (it.noiseAmount > 0) pulse += refSample(TEX[it.noise], time * it.noiseSpeed, time * 0.333 * it.noiseSpeed)[0] / 255 * it.noiseAmount
      pulse = Math.pow(pulse, it.power)
      if (it.pulseColor) {
        const A = [t[0] / 255 * it.tintLow[0], t[1] / 255 * it.tintLow[1], t[2] / 255 * it.tintLow[2]]
        const B = [t[0] / 255 * it.tintHigh[0], t[1] / 255 * it.tintHigh[1], t[2] / 255 * it.tintHigh[2]]
        const rgb = it.blendMode >= 26 && it.blendMode <= 29 ? refBlendHsl(it.blendMode, A, B, pulse) : refBlend(it.blendMode, A, B, pulse)
        t = [rgb[0] * 255, rgb[1] * 255, rgb[2] * 255, t[3]]
      }
      if (it.pulseAlpha) t[3] *= pulse
      t = [Math.max(0, t[0]), Math.max(0, t[1]), Math.max(0, t[2]), t[3]]
      if (sample && it.mask) {
        const mv = refMaskCh(TEX[it.mask], refSample(TEX[it.mask], u, v))
        t = refMix4(sample, t, mv)
      }
    } else if (it.type === 'key') {
      const delta = Math.abs(it.key[0] - t[0] / 255) + Math.abs(it.key[1] - t[1] / 255) + Math.abs(it.key[2] - t[2] / 255)
      let blend = refSmooth(0.001, 0.002 + it.fuzz, delta - it.tol)
      if (it.invert) blend = 1 - blend
      t[3] *= it.keyAlpha * (1 - blend) + blend
      if (it.flatten) {
        t[0] *= t[3] / 255
        t[1] *= t[3] / 255
        t[2] *= t[3] / 255
      }
    }
  }
  return t
}

// ---------- Part 1: CPU（effects.js）vs 参考 ----------
section('Part 1: CPU vs 参考公式')

const GRID = [0.1, 0.25, 0.5, 0.75, 0.9]
const TIMES = [0.3, 1.7]
const near = (a, b, eps) => Math.abs(a - b) <= eps
function cmp2(name, cpu, ref) {
  ok(near(cpu[0], ref[0], EPS) && near(cpu[1], ref[1], EPS), name, 'cpu=' + cpu[0].toFixed(9) + ',' + cpu[1].toFixed(9) + ' ref=' + ref[0].toFixed(9) + ',' + ref[1].toFixed(9))
}
function cmp4(name, cpu, ref, eps = 1e-6) {
  let bad = ''
  for (let c = 0; c < 4; c++) {
    if (!near(cpu[c], ref[c], eps)) {
      bad += ' ch' + c + ':cpu=' + cpu[c].toFixed(6) + ',ref=' + ref[c].toFixed(6)
      break
    }
  }
  ok(bad === '', name, bad || undefined)
}

const DISP_CASES = [
  { name: 'scroll (0.2,0.3)', item: { type: 'scroll', sx: 0.2, sy: 0.3, rx: 1, ry: 1 } },
  { name: 'scroll (-0.5,0) repeat2', item: { type: 'scroll', sx: -0.5, sy: 0, rx: 2, ry: 2 } },
  { name: 'shake dir0', item: { type: 'shake', flow: 'flow', phase: 'phase', mask: 'util/white', masked: false, speed: 1, amp: 0.1, fx: 1, fy: 1, bounds: [0, 1], direction: 0 } },
  { name: 'shake dir1 fx2 fy0.5 bounds', item: { type: 'shake', flow: 'flow', phase: 'util/white', mask: 'util/white', masked: false, speed: 1.3, amp: 0.3, fx: 2, fy: 0.5, bounds: [0.2, 0.8], direction: 1 } },
  { name: 'shake dir2', item: { type: 'shake', flow: 'flowRG', phase: 'util/white', mask: 'util/white', masked: false, speed: 0.7, amp: 0.2, fx: 1, fy: 1, bounds: [0, 1], direction: 2 } },
  { name: 'waves dir0', item: { type: 'waves', mask: 'mask', speed: 5, scale: 200, strength: 0.1, direction: 0, perspective: 0 } },
  { name: 'waves dir1.57', item: { type: 'waves', mask: 'mask', speed: 1.07, scale: 37.24, strength: 0.4, direction: Math.PI / 2, perspective: 0 } },
  { name: 'waves dir3.14 persp', item: { type: 'waves', mask: 'mask', speed: 5, scale: 200, strength: 0.1, direction: Math.PI, perspective: 0.1 } },
  { name: 'waves dir4.71', item: { type: 'waves', mask: 'mask', speed: 5, scale: 200, strength: 0.4, direction: 3 * Math.PI / 2, perspective: 0 } },
  { name: 'sway 2.618', item: { type: 'sway', mask: 'mask', noise: 'noise', masked: true, strength: 0.23, speed: 2.93, direction: 2.617993877991494, phase: 0.5, power: 1, noiseScale: 0.05, ratio: 0.3 } },
  { name: 'sway dir0 power1.5', item: { type: 'sway', mask: null, noise: 'noise', masked: false, strength: 0.4, speed: 5, direction: 0, phase: 0.2, power: 1.5, noiseScale: 0.2, ratio: 1 } },
]
for (const cs of DISP_CASES) {
  for (const t of TIMES) {
    let badN = 0
    let detail = ''
    for (const u of GRID) {
      for (const v of GRID) {
        const cpu = applyDisplacements([cs.item], u, v, TEX.base, TEXMAP, t)
        let ref
        if (cs.item.type === 'scroll') ref = refScroll(cs.item, u, v, t)
        else if (cs.item.type === 'shake') ref = refShake(cs.item, u, v, t)
        else if (cs.item.type === 'waves') ref = refWaves(cs.item, u, v, t)
        else ref = refSway(cs.item, u, v, t, TEX.base)
        // 参考返回位移（scroll 返回最终坐标）；运行时返回最终 su/sv
        const refSu = cs.item.type === 'scroll' ? ref[0] : u + ref[0]
        const refSv = cs.item.type === 'scroll' ? ref[1] : v + ref[1]
        if (!near(cpu.su, refSu, EPS) || !near(cpu.sv, refSv, EPS)) {
          badN++
          if (badN === 1) detail = 'u=' + u + ' v=' + v + ' t=' + t + ' cpu=(' + cpu.su.toFixed(9) + ',' + cpu.sv.toFixed(9) + ') ref=(' + refSu.toFixed(9) + ',' + refSv.toFixed(9) + ')'
        }
      }
    }
    ok(badN === 0, cs.name + ' @t=' + t + ' (25 点)', badN ? badN + ' 点不一致，如 ' + detail : undefined)
  }
}

// flow（位移后采样基图 → 颜色混出）
const FLOW_CASES = [
  { name: 'flow s1', item: { type: 'flow', flow: 'flow', phase: 'phase', speed: 1, strength: 1, phaseScale: 2 } },
  { name: 'flow s0.4 RG88', item: { type: 'flow', flow: 'flowRG', phase: 'phase', speed: 0.7, strength: 0.4, phaseScale: 1 } },
]
for (const cs of FLOW_CASES) {
  for (const t of TIMES) {
    let badN = 0
    let detail = ''
    for (const u of GRID) {
      for (const v of GRID) {
        const su = u + 0.03
        const sv = v - 0.02
        const base = sampleTex(TEX.base, su, sv)
        const cpu = applyFlowMix([cs.item], u, v, su, sv, TEX.base, TEXMAP, t, base.slice())
        const ref = refFlow(cs.item, u, v, su, sv, t, base.slice())
        if (!near(cpu[0], ref[0], 1e-6) || !near(cpu[1], ref[1], 1e-6) || !near(cpu[2], ref[2], 1e-6) || !near(cpu[3], ref[3], 1e-6)) {
          badN++
          if (badN === 1) detail = 'u=' + u + ' v=' + v + ' cpu=' + cpu.map((x) => x.toFixed(4)).join(',') + ' ref=' + ref.map((x) => x.toFixed(4)).join(',')
        }
      }
    }
    ok(badN === 0, cs.name + ' @t=' + t, badN ? badN + ' 点不一致，如 ' + detail : undefined)
  }
}

// shake MASK 路径
{
  const it = { type: 'shake', flow: 'flow', phase: 'util/white', mask: 'mask', masked: true, speed: 1, amp: 0.2, fx: 1, fy: 1, bounds: [0, 1], direction: 0 }
  const u = 0.5
  const v = 0.5
  const t = 0.7
  const { su, sv } = applyDisplacements([it], u, v, TEX.base, TEXMAP, t)
  const cpu = applyShakeMasks([it], u, v, su, sv, TEX.base, TEXMAP, t, sampleTex(TEX.base, su, sv).slice())
  // 参考：重算 offset → mask@(uv0+off) → mix(base@uv0, displaced, mask)
  const pf = refSample(TEX['util/white'], u, v)
  const flowPhase = (pf[0] / 255) * M_2PI
  const f = refSample(TEX.flow, u, v)
  const flow = refFlowCh(TEX.flow, f)
  const fm = [(flow[0] - 0.498) * 2, (flow[1] - 0.498) * 2]
  const t2 = it.speed * t + flowPhase
  let off = Math.sin(refFrac(t2 / M_2PI) * M_2PI) * 0.498 + 0.5
  const baseSel = Math.cos(t2) >= 0 ? 1 : 0
  off = baseSel === 1 ? Math.pow(off, it.fy) : 1 - Math.pow(1 - off, it.fx)
  off = refClamp01((off - it.bounds[0]) * (1 / (it.bounds[1] - it.bounds[0]))) * 2 - 1
  const a2 = it.amp * it.amp
  const mx = u + off * a2 * fm[0]
  const my = v + off * a2 * fm[1]
  const mv = refMaskCh(TEX.mask, refSample(TEX.mask, mx, my))
  const orig = refSample(TEX.base, u, v)
  const disp = refSample(TEX.base, su, sv)
  const ref = refMix4(orig, disp, mv)
  cmp4('shake MASK 路径', cpu, ref)
}

// 混合模式全表
section('混合模式表 (0..32)')
const BLEND_CASES = [
  { A: [0.25, 0.5, 0.75], B: [0.8, 0.3, 0.6], op: 0.7 },
  { A: [1, 1, 1], B: [1, 1, 1], op: 1 },
  { A: [0, 0, 0], B: [1, 1, 1], op: 0.5 },
  { A: [0.5, 0.5, 0.5], B: [0, 0.5, 1], op: 1 },
  { A: [0.9, 0.1, 0.4], B: [0.3, 0.6, 0.9], op: 0.25 },
]
for (let mode = 0; mode <= 32; mode++) {
  let badN = 0
  let detail = ''
  for (const bc of BLEND_CASES) {
    const cpu = applyBlending(mode, bc.A, bc.B, bc.op)
    const ref = mode >= 26 && mode <= 29 ? refBlendHsl(mode, bc.A, bc.B, bc.op) : refBlend(mode, bc.A, bc.B, bc.op)
    for (let c = 0; c < 3; c++) {
      if (!near(cpu[c], ref[c], 1e-9)) {
        badN++
        detail = 'A=' + bc.A + ' B=' + bc.B + ' op=' + bc.op + ' cpu=' + cpu.map((x) => x.toFixed(9)).join(',') + ' ref=' + ref.map((x) => x.toFixed(9)).join(',')
      }
    }
  }
  ok(badN === 0, 'mode ' + mode, detail || undefined)
}

// 颜色链
section('颜色链 (tint/pulse/colorkey)')
const COLOR_CASES = [
  { name: 'tint 无combo(default30=Tint)', items: [{ type: 'tint', color: [0.30196, 0.21176, 0.54902], alpha: 1, blendMode: 30, mask: 'util/white', masked: false }] },
  { name: 'tint 无combo a0.5', items: [{ type: 'tint', color: [0.8, 0.2, 0.2], alpha: 0.5, blendMode: 30, mask: 'util/white', masked: false }] },
  { name: 'tint mode30 a1', items: [{ type: 'tint', color: [0.30196, 0.21176, 0.54902], alpha: 1, blendMode: 30, mask: 'util/white', masked: false }] },
  { name: 'tint mode30 a0.5', items: [{ type: 'tint', color: [0.8, 0.2, 0.2], alpha: 0.5, blendMode: 30, mask: 'util/white', masked: false }] },
  { name: 'tint mode0 a1', items: [{ type: 'tint', color: [0.5, 0.5, 0.5], alpha: 1, blendMode: 0, mask: 'util/white', masked: false }] },
  { name: 'tint mode9 a0.5 masked', items: [{ type: 'tint', color: [0.5, 0.5, 0.5], alpha: 0.5, blendMode: 9, mask: 'mask', masked: true }] },
  { name: 'pulse 无combo(default9=Add)', items: [{ type: 'pulse', noise: 'noise', mask: 'util/white', masked: false, speed: 2, phase: 0.5, amount: 1, bounds: [0, 1], power: 1, tintLow: [1, 1, 1], tintHigh: [0, 1, 1], blendMode: 9, noiseSpeed: 0.1, noiseAmount: 0, pulseColor: true, pulseAlpha: false }] },
  { name: 'pulse mode22 (Reze, PULSECOLOR默认1)', items: [{ type: 'pulse', noise: 'noise', mask: 'util/white', masked: false, speed: 0, phase: 0, amount: 2, bounds: [0, 1], power: 1, tintLow: [1, 1, 1], tintHigh: [0, 1, 1], blendMode: 22, noiseSpeed: 0, noiseAmount: 0, pulseColor: true, pulseAlpha: false }] },
  { name: 'pulse mode22 PULSECOLOR=1', items: [{ type: 'pulse', noise: 'noise', mask: 'util/white', masked: false, speed: 0, phase: 0, amount: 2, bounds: [0, 1], power: 1, tintLow: [1, 1, 1], tintHigh: [0, 1, 1], blendMode: 22, noiseSpeed: 0, noiseAmount: 0, pulseColor: true, pulseAlpha: false }] },
  { name: 'pulse mode9 noise', items: [{ type: 'pulse', noise: 'noise', mask: 'util/white', masked: false, speed: 2, phase: 0.5, amount: 1, bounds: [0, 1], power: 2, tintLow: [1, 1, 1], tintHigh: [0, 1, 1], blendMode: 9, noiseSpeed: 0.1, noiseAmount: 0.5, pulseColor: true, pulseAlpha: true }] },
  { name: 'pulse mode30 masked', items: [{ type: 'pulse', noise: 'noise', mask: 'mask', masked: true, speed: 0, phase: 0, amount: 1, bounds: [0, 1], power: 1, tintLow: [1, 1, 1], tintHigh: [0, 1, 1], blendMode: 30, noiseSpeed: 0, noiseAmount: 0, pulseColor: true, pulseAlpha: false }] },
  { name: 'key fuzz0.27 tol0.4', items: [{ type: 'key', key: [1, 0, 0], fuzz: 0.27, tol: 0.4, keyAlpha: 0, invert: false, flatten: false }] },
  { name: 'key invert flatten keyAlpha0.5', items: [{ type: 'key', key: [0.3, 0.2, 0.55], fuzz: 0.1, tol: 0.2, keyAlpha: 0.5, invert: true, flatten: true }] },
]
for (const cs of COLOR_CASES) {
  for (const t of TIMES) {
    let badN = 0
    let detail = ''
    for (const u of GRID) {
      for (const v of GRID) {
        const base = sampleTex(TEX.base, u, v).slice()
        const cpu = applyColorChain(cs.items, base.slice(), TEXMAP, t, u, v)
        const ref = refColorChain(cs.items, base.slice(), t, u, v)
        for (let c = 0; c < 4; c++) {
          if (!near(cpu[c], ref[c], 1e-6)) {
            badN++
            if (badN === 1) detail = 'u=' + u + ' v=' + v + ' t=' + t + ' cpu=' + cpu.map((x) => x.toFixed(4)).join(',') + ' ref=' + ref.map((x) => x.toFixed(4)).join(',')
          }
        }
      }
    }
    ok(badN === 0, cs.name + ' @t=' + t, badN ? badN + ' 点不一致，如 ' + detail : undefined)
  }
}

// ---------- Part 2: WebGL vs CPU ----------
if (!ONLY_CPU) {
  section('Part 2: WebGL vs CPU（无头 Edge）')
  const webglFailures = await runWebglCompare().catch((e) => {
    console.log('  ✗ WebGL 对比无法执行: ' + (e && e.message || e))
    return -1
  })
  if (webglFailures === -1) failures++
}

console.log('')
console.log('结果: ' + (failures === 0 ? '全部通过' : failures + ' 项失败') + '（' + checks + ' 项检查）')
process.exit(failures === 0 ? 0 : 1)

// ---------- WebGL 对比实现 ----------
async function runWebglCompare() {
  // 场景：单图层 64x64，效果经 scene.json 形状传入（走两渲染器完整解析路径）
  function sceneFor(effects) {
    return {
      general: { orthogonalprojection: { width: 64, height: 64 }, clearcolor: '0 0 0' },
      camera: {},
      layers: [{
        name: 't', visible: true, image: null, solid: false, textureName: 'base',
        size: [64, 64], scale: [1, 1, 1], origin: [32, 32, 0], angles: [0, 0, 0],
        alignment: 'center', color: [1, 1, 1], brightness: 1, alpha: 1,
        effects,
      }],
    }
  }
  const FX = {
    scroll: { file: 'effects/scroll/effect.json', visible: true, passes: [{ constantshadervalues: { speedx: 0.2, speedy: 0.3, repeat: '1 1' }, textures: [] }] },
    shake: { file: 'effects/shake/effect.json', visible: true, passes: [{ constantshadervalues: { speed: 1, strength: 0.1, friction: '1 1', bounds: '0 1' }, combos: {}, textures: [null, 'flow', 'util/white'] }] },
    shakeDir1: { file: 'effects/shake/effect.json', visible: true, passes: [{ constantshadervalues: { speed: 1.3, strength: 0.3, friction: '2 0.5', bounds: '0.2 0.8' }, combos: { DIRECTION: 1 }, textures: [null, 'flow', 'util/white'] }] },
    waves: { file: 'effects/waterwaves/effect.json', visible: true, passes: [{ constantshadervalues: { speed: 5, scale: 200, strength: 0.1, direction: 0, perspective: 0 }, textures: [null, 'mask'] }] },
    wavesPersp: { file: 'effects/waterwaves/effect.json', visible: true, passes: [{ constantshadervalues: { speed: 1.07, scale: 37.24, strength: 0.4, direction: 3.141592653589793, perspective: 0.1 }, textures: [null, 'mask'] }] },
    sway: { file: 'effects/foliagesway/effect.json', visible: true, passes: [{ constantshadervalues: { strength: 0.23, speeduv: 2.93, scrolldirection: 2.617993877991494, phase: 0.5, power: 1, scale: 0.05, ratio: 0.3 }, combos: {}, textures: [null, 'mask', 'util/noise'] }] },
    flow: { file: 'effects/waterflow/effect.json', visible: true, passes: [{ constantshadervalues: { speed: 1, strength: 1, phasescale: 2 }, textures: [null, 'flow', 'phase'] }] },
    tint: { file: 'effects/tint/effect.json', visible: true, passes: [{ constantshadervalues: { color: { value: '0.30196 0.21176 0.54902' }, alpha: 1 }, textures: [] }] },
    tintMode30: { file: 'effects/tint/effect.json', visible: true, passes: [{ constantshadervalues: { color: { value: '0.30196 0.21176 0.54902' }, alpha: 1 }, combos: { BLENDMODE: 30 }, textures: [] }] },
    pulse: { file: 'effects/pulse/effect.json', visible: true, passes: [{ constantshadervalues: { speed: 0, amount: 2, tinthigh: '0 1 1' }, combos: { BLENDMODE: 22 }, textures: [null, 'util/noise', 'util/white'] }] },
    pulseColor: { file: 'effects/pulse/effect.json', visible: true, passes: [{ constantshadervalues: { speed: 0, amount: 2, tinthigh: '0 1 1' }, combos: { BLENDMODE: 22, PULSECOLOR: 1 }, textures: [null, 'util/noise', 'util/white'] }] },
    key: { file: 'effects/colorkey/effect.json', visible: true, passes: [{ constantshadervalues: { color: { value: '0.3 0.2 0.55' }, fuzziness: 0.27, tolerance: 0.4 }, combos: { FLATTEN: 0, INVERT: 0 }, textures: [] }] },
  }
  const CASES = [
    ['scroll', [FX.scroll]],
    ['shake', [FX.shake]],
    ['shake dir1', [FX.shakeDir1]],
    ['waves', [FX.waves]],
    ['waves persp', [FX.wavesPersp]],
    ['sway', [FX.sway]],
    ['flow', [FX.flow]],
    ['tint 无combo', [FX.tint]],
    ['tint mode30', [FX.tintMode30]],
    ['pulse glow no-op', [FX.pulse]],
    ['pulse glow PULSECOLOR', [FX.pulseColor]],
    ['key', [FX.key]],
    ['scroll+tint', [FX.scroll, FX.tint]],
    ['shake+sway+waves', [FX.shake, FX.sway, FX.waves]],
  ]

  // CPU 纹理表（rgba）
  const cpuTex = new Map()
  for (const k of Object.keys(TEX)) cpuTex.set(k, TEX[k])
  // WebGL 纹理表（JSON 可传）
  const glTex = {}
  for (const k of Object.keys(TEX)) {
    const d = TEX[k]
    glTex[k] = { width: d.width, height: d.height, rg88: !!d.rg88, rgba: Array.from(d.rgba) }
  }

  const page = await cdpPage()
  let badN = 0
  for (const [name, effects] of CASES) {
    for (const t of [0.3, 1.7]) {
      const scene = sceneFor(effects)
      const cpu = renderScene(scene, cpuTex, 64, 64, t)
      const glBuf = await cdpEval(page, `__weVerifyRun(${JSON.stringify(scene)}, ${JSON.stringify(glTex)}, 64, 64, ${t})`)
      let worst = 0
      let worstAt = ''
      for (let y = 0; y < 64; y++) {
        for (let x = 0; x < 64; x++) {
          // CPU 缓冲上起行序；readPixels 下起行序 → 行翻转对齐
          const cpuO = (y * 64 + x) * 4
          const glO = ((63 - y) * 64 + x) * 4
          for (let c = 0; c < 3; c++) { // 只比 RGB（canvas alpha:false 强制 alpha=255）
            const d = Math.abs(cpu.rgba[cpuO + c] - glBuf[glO + c])
            if (d > worst) {
              worst = d
              worstAt = 'x=' + x + ' y=' + y + ' ch' + c + ' cpu=' + cpu.rgba[cpuO + c] + ' gl=' + glBuf[glO + c]
            }
          }
        }
      }
      ok(worst <= 2, name + ' @t=' + t + ' (64x64 RGB)', worst > 2 ? '最大差 ' + worst + ' @' + worstAt : undefined)
    }
  }
  return badN
}

// ---------- CDP ----------
async function cdpPage() {
  let targets = null
  try {
    targets = await (await fetch(CDP + '/json')).json()
  } catch (e) {
    // 启动无头 Edge
    const edgePaths = [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ]
    const { existsSync } = await import('node:fs')
    const edge = edgePaths.find((p) => existsSync(p))
    if (!edge) throw new Error('找不到 msedge.exe，无法做 WebGL 对比')
    const profile = mkdtempSync(join(tmpdir(), 'we-verify-'))
    spawn(edge, [
      '--headless=new',
      '--remote-debugging-port=9222',
      '--user-data-dir=' + profile,
      '--no-first-run',
      '--disable-gpu-sandbox',
      '--use-angle=swiftshader',
      'about:blank',
    ], { stdio: 'ignore', detached: true })
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 500))
      try {
        targets = await (await fetch(CDP + '/json')).json()
        if (targets) break
      } catch (e2) {
        // 继续等
      }
    }
    if (!targets) throw new Error('无头 Edge 启动超时（CDP 9222 不可用）')
  }
  const page = targets.find((t) => t.type === 'page')
  if (!page) throw new Error('CDP 无 page 目标')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = () => rej(new Error('CDP WebSocket 连接失败'))
  })
  let id = 0
  const pending = new Map()
  function send(method, params = {}) {
    return new Promise((res, rej) => {
      const i = ++id
      pending.set(i, { res, rej })
      ws.send(JSON.stringify({ id: i, method, params }))
    })
  }
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id)
      pending.delete(m.id)
      m.error ? p.rej(new Error(m.error.message)) : p.res(m.result)
    }
  }
  await send('Page.enable')
  await send('Runtime.enable')
  // 确保演示服务器可用
  let ready = false
  for (let i = 0; i < 10; i++) {
    await send('Page.navigate', { url: VERIFY_URL })
    await new Promise((r) => setTimeout(r, 800))
    try {
      const st = await cdpEvalPage(send, 'window.__weVerifyStatus ? __weVerifyStatus() : "no"')
      if (st === 'ready') {
        ready = true
        break
      }
    } catch (e) {
      // 继续重试
    }
  }
  if (!ready) throw new Error('verify.html 不可用（演示服务器 http://localhost:8123 是否在跑？）')
  return { send }
}
async function cdpEvalPage(send, expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true })
  if (r.result && r.result.subtype === 'error') throw new Error(r.result.description)
  return r.result && r.result.value
}
async function cdpEval(page, expression) {
  return cdpEvalPage(page.send, expression)
}
