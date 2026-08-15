// 场景资源加载：解析每个图层的 model→material→texture 链，产出纹理表
import { getEntry } from '../pkg/container.js'
import { parseTex, decodeMip0, FIF } from '../pkg/texture.js'
import { resolveMaterial } from './parse.js'

const WHITE = { width: 1, height: 1, rgba: new Uint8Array([255, 255, 255, 255]) }

// pkg: parsePkg 结果；scene: parseScene 结果；opts.jpegDir: fif=2(JPEG) 纹理的预转 PNG 目录
export function loadSceneAssets(pkg, scene, opts = {}, readFile = null) {
  const textures = new Map()
  textures.set('util/white', WHITE)
  textures.set('util/noise', WHITE)
  let resolved = 0
  const log = []
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
      if (!texName) continue
      if (textures.has(texName)) {
        layer.textureName = texName
        resolved++
        continue
      }
      const texEntry = getEntry(pkg, 'materials/' + texName + '.tex')
      if (texEntry === null) continue
      const tex = parseTex(texEntry)
      const m = decodeMip0(tex)
      let entry = null
      if (m.png !== undefined) {
        const d = decodePngNode(m.png)
        entry = { width: d.width, height: d.height, rgba: d.rgba }
      } else if (m.image !== undefined) {
        if (m.fif === FIF.JPEG && opts.jpegDir && readFile) {
          const d = decodePngNode(readFile(opts.jpegDir.replace(/[\\/]$/, '') + '/' + texName + '.png'))
          entry = { width: d.width, height: d.height, rgba: d.rgba }
        } else {
          log.push('SKIP ' + texName + ' (fif=' + m.fif + ' 无解码器)')
          continue
        }
      } else {
        entry = { width: m.width, height: m.height, rgba: m.rgba }
      }
      textures.set(texName, entry)
      layer.textureName = texName
      resolved++
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
