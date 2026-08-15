// 场景对象模型：scene.json + project.json → 归一化图层列表
export function parseVec3(s) {
  const p = String(s).trim().split(/\s+/).map(Number)
  return [p[0] || 0, p[1] || 0, p[2] || 0]
}

export function parseVec2(s) {
  const p = String(s).trim().split(/\s+/).map(Number)
  return [p[0] || 0, p[1] || 0]
}

export function parseColor(c) {
  if (c === undefined || c === null) return [1, 1, 1]
  if (typeof c === 'string') return parseVec3(c)
  if (typeof c === 'object' && c !== null) return parseVec3(c.value)
  return [1, 1, 1]
}

export function parseBool(v, dflt = false) {
  if (v === undefined || v === null) return dflt
  if (typeof v === 'boolean') return v
  if (typeof v === 'object' && v !== null) return !!v.value
  return dflt
}

export function parseScene(sceneJson, project) {
  const properties = (project && project.general && project.general.properties) || {}
  const layers = (sceneJson.objects || []).map((o, i) => ({
    id: o.id !== undefined ? o.id : i,
    name: o.name || '',
    visible: parseBool(o.visible, true),
    image: typeof o.image === 'string' ? o.image : null,
    particle: typeof o.particle === 'string' ? o.particle : null,
    // WE 的 solid 层：无 image/particle，或 image 指向内置 models/util/*（纯色层，无纹理）
    solid: !!o.solid && typeof o.particle !== 'string' && (typeof o.image !== 'string' || o.image.indexOf('models/util/') === 0),
    origin: parseVec3(o.origin || '0 0 0'),
    scale: parseVec3(o.scale || '1 1 1'),
    angles: parseVec3(o.angles || '0 0 0'),
    size: parseVec2(o.size || '0 0'),
    alignment: o.alignment || 'center',
    color: parseColor(o.color),
    alpha: typeof o.alpha === 'number' ? o.alpha : 1,
    brightness: typeof o.brightness === 'number' ? o.brightness : 1,
    copybackground: !!o.copybackground,
    colorBlendMode: o.colorBlendMode || 0,
    effects: (o.effects || []).map((e) => ({
      file: e.file || '',
      visible: parseBool(e.visible, true),
      passes: (e.passes || []).map((p) => ({
        combos: p.combos || {},
        constantshadervalues: p.constantshadervalues || {},
        textures: p.textures || [],
      })),
    })),
  }))
  return {
    camera: sceneJson.camera || null,
    general: sceneJson.general || {},
    layers,
    properties,
  }
}

// 从对象模型解析材质链：object.image → models/x.json → materials/y.json → passes
export function resolveMaterial(modelJson) {
  if (!modelJson || typeof modelJson.material !== 'string') return null
  return {
    materialPath: modelJson.material,
    autosize: !!modelJson.autosize,
    cropoffset: modelJson.cropoffset ? parseVec2(modelJson.cropoffset) : null,
  }
}
