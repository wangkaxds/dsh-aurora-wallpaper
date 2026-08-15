// 场景资源加载：解析每个图层的 model→material→texture 链，产出纹理表
import { getEntry } from '../pkg/container.js'
import { parseTex, decodeMip0, decodeMips, FIF } from '../pkg/texture.js'
import { generateNoiseTexture } from '../render/noise.js'
import { resolveMaterial } from './parse.js'

const WHITE = { width: 1, height: 1, rgba: new Uint8Array([255, 255, 255, 255]) }
const NOISE = { width: 256, height: 256, rgba: generateNoiseTexture() }
// WE util/noflow：中性流向（0.498 灰 → flowMask=(0,0) → 无位移）。127/255 ≈ 0.498
const NOFLOW = { width: 1, height: 1, rgba: new Uint8Array([127, 127, 127, 255]) }

// pkg: parsePkg 结果；scene: parseScene 结果；opts.jpegDir: fif=2(JPEG) 纹理的预转 PNG 目录；opts.noisePng: 官方 util/noise 的 PNG 路径（可选，回退合成噪声）
export function loadSceneAssets(pkg, scene, opts = {}, readFile = null) {
  const textures = new Map()
  textures.set('util/white', WHITE)
  textures.set('util/noflow', NOFLOW)
  let noise = NOISE
  // 官方 util/noise.tex（带 mip 链）优先，回退 noise.png，再回退合成噪声
  if (opts.noiseTex && readFile) {
    try {
      const tex = parseTex(readFile(opts.noiseTex))
      const mips = decodeMips(tex)
      noise = {
        width: mips[0].width,
        height: mips[0].height,
        rgba: mips[0].rgba,
        mips: mips.map((m) => ({ width: m.width, height: m.height, rgba: m.rgba })),
      }
    } catch (e) {
      // 回退
    }
  }
  if ((!noise.mips || noise.mips.length <= 1) && opts.noisePng && readFile) {
    try {
      const d = decodePngNode(readFile(opts.noisePng))
      noise = { width: d.width, height: d.height, rgba: d.rgba }
    } catch (e) {
      // 回退合成噪声
    }
  }
  textures.set('util/noise', noise)
  let resolved = 0
  const log = []

  function loadTex(name) {
    if (textures.has(name)) return textures.get(name)
    const texEntry = getEntry(pkg, 'materials/' + name + '.tex')
    if (texEntry === null) return null
    const tex = parseTex(texEntry)
    const m = decodeMip0(tex)
    let entry = null
    if (m.video !== undefined) {
      // 视频纹理：Phase 4 支持播放，当前标记为 video 供渲染器跳过
      entry = { video: true, width: m.width, height: m.height, rgba: null }
    } else if (m.png !== undefined) {
      const d = decodePngNode(m.png)
      entry = { width: d.width, height: d.height, rgba: d.rgba, rg88: tex.format === 8 }
    } else if (m.image !== undefined) {
      if (m.fif === FIF.JPEG && opts.jpegDir && readFile) {
        const d = decodePngNode(readFile(opts.jpegDir.replace(/[\\/]$/, '') + '/' + name.replace(/^.*\//, '') + '.png'))
        entry = { width: d.width, height: d.height, rgba: d.rgba, rg88: tex.format === 8 }
      } else {
        log.push('SKIP ' + name + ' (fif=' + m.fif + ' 无解码器)')
        return null
      }
    } else {
      const mips = decodeMips(tex)
      entry = {
        width: mips[0].width,
        height: mips[0].height,
        rgba: mips[0].rgba,
        mips: mips.map((m) => ({ width: m.width, height: m.height, rgba: m.rgba })),
        rg88: tex.format === 8,
      }
    }
    textures.set(name, entry)
    return entry
  }

  for (const layer of scene.layers) {
    if (!layer.image) continue
    try {
      const modelEntry = getEntry(pkg, layer.image)
      if (modelEntry === null) continue // 内置模型（util/solidlayer 等）
      const model = JSON.parse(modelEntry.toString('utf8').replace(/^\uFEFF/, ''))
      const mat = resolveMaterial(model)
      if (!mat) continue
      const material = JSON.parse(getEntry(pkg, mat.materialPath).toString('utf8').replace(/^\uFEFF/, ''))
      const pass = material.passes && material.passes[0]
      const texName = pass && pass.textures && pass.textures[0]
      if (texName) {
        if (textures.has(texName)) {
          layer.textureName = texName
          resolved++
        } else if (loadTex(texName) !== null) {
          layer.textureName = texName
          resolved++
        }
      }
      // 效果引用的纹理（shake 流动图 / waterwaves 蒙版 / pulse 噪声等）
      for (const e of layer.effects || []) {
        for (const p of e.passes || []) {
          for (const tn of p.textures || []) {
            if (typeof tn !== 'string' || tn === '' || tn.startsWith('util/') || tn.startsWith('_rt_')) continue
            loadTex(tn)
          }
        }
      }
    } catch (e) {
      log.push('ERR ' + layer.name + ': ' + String(e && e.message || e))
    }
  }
  return { textures, resolved, log }
}

function decodePngNode(bytes) {
  // 由调用方注入的 PNG 解码器（避免核心模块依赖 node:zlib）
  return globalThis.__weSceneDecodePng(bytes)
}
