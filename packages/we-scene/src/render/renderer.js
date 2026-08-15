// WebGL2 渲染器：与 cpu.js 同一套场景模型/矩阵/效果语义
// Phase 3：图像/纯色图层 + scroll / shake / waterwaves 位移 + tint / colorkey
import { mat4Identity, mat4Multiply, mat4RotateZ, mat4Translate, mat4Scale, buildCamera } from './math.js'

const VERT = `#version 300 es
in vec3 a_Position;
in vec2 a_TexCoord;
uniform mat4 u_MVP;
out vec2 v_UV;
void main() {
  gl_Position = u_MVP * vec4(a_Position, 1.0);
  v_UV = a_TexCoord;
}`

function buildFragSource() {
  // GLSL ES 3.0 不允许 sampler 数组用变量下标 → 用 JS 展开成 8 个常量下标块
  const dispBlocks = []
  const flowBlocks = []
  for (let i = 0; i < 8; i++) {
    dispBlocks.push(`
  if (${i} < u_FxCount) {
    int ty${i} = u_FxType[${i}];
    if (ty${i} == 0) {
      float ox${i} = sign(u_FxP[${i}].x) * u_FxP[${i}].x * u_FxP[${i}].x * u_Time;
      float oy${i} = sign(u_FxP[${i}].y) * u_FxP[${i}].y * u_FxP[${i}].y * u_Time;
      uv = vec2(fx_frac((uv0.x + ox${i}) * u_FxP[${i}].z), fx_frac((uv0.y + oy${i}) * u_FxP[${i}].w));
    } else if (ty${i} == 1) {
      vec4 f${i} = texture(u_FxMask[${i}], uv0);
      vec2 flow${i} = u_FxRG88[${i}] > 0.5 ? vec2(f${i}.a, f${i}.r) : f${i}.rg;
      float fg${i} = u_Flip > 0.5 ? -1.0 : 1.0;
      vec2 flowMask${i} = (flow${i} - vec2(0.498)) * 2.0 * fg${i};
      // WE 的 M_PI_2 = 2π：sin(frac(t/2π)·2π) = sin(t) —— 平滑正弦，无跳变
      float t2${i} = u_FxP[${i}].x * u_Time;
      float off${i} = sin(t2${i}) * 0.498 + 0.5;
      float base${i} = cos(t2${i}) >= 0.0 ? 1.0 : 0.0;
      off${i} = base${i} > 0.5 ? pow(off${i}, u_FxP[${i}].w) : 1.0 - pow(1.0 - off${i}, u_FxP[${i}].z);
      off${i} = off${i} * 2.0 - 1.0;
      float amp2${i} = u_FxP[${i}].y * u_FxP[${i}].y * u_AmpScale;
      uv += off${i} * amp2${i} * flowMask${i};
    } else if (ty${i} == 2) {
      vec4 f${i} = texture(u_FxMask[${i}], uv0);
      float mask${i} = u_FxRG88[${i}] > 0.5 ? f${i}.a : f${i}.r;
      float fg${i} = u_Flip > 0.5 ? -1.0 : 1.0;
      vec2 dir${i} = vec2(-sin(u_FxP[${i}].w * fg${i}), cos(u_FxP[${i}].w * fg${i}));
      float pos${i} = abs(dot(uv0 - vec2(0.5), dir${i}));
      float dist${i} = u_Time * u_FxP[${i}].x + dot(uv0, dir${i}) * u_FxP[${i}].y;
      float s${i} = sin(dist${i}) * (u_FxP[${i}].z * u_FxP[${i}].z * u_AmpScale) * mask${i};
      uv += vec2(dir${i}.y, -dir${i}.x) * s${i};
    } else if (ty${i} == 3) {
      vec4 n${i} = texture(u_Noise, uv0 * u_FxP[${i}].z);
      float aspect${i} = u_FbSize.x / u_FbSize.y * 0.3;
      float fg${i} = u_Flip > 0.5 ? -1.0 : 1.0;
      vec2 zw${i} = rot2(vec2(1.0 / aspect${i}, aspect${i}), u_FxP[${i}].w * fg${i});
      vec2 pa${i} = rot2(uv0, u_FxP[${i}].w * fg${i});
      float amp${i} = u_FxP[${i}].y * u_FxP[${i}].y * 0.005 * u_AmpScale;
      amp${i} *= texture(u_FxMask[${i}], uv0).r;
      float ph${i} = (n${i}.g * 6.28318530718 + pa${i}.x * 10.0 + pa${i}.y * 5.0) * 0.5;
      float sA${i} = sin(ph${i} + u_FxP[${i}].x * u_Time * 1.0);
      float sB${i} = sin(ph${i} + u_FxP[${i}].x * u_Time * -0.16161616);
      float sC${i} = sin(ph${i} + u_FxP[${i}].x * u_Time * 0.0083333);
      float sD${i} = sin(ph${i} + u_FxP[${i}].x * u_Time * -0.00019841);
      float cA${i} = sin(0.4 + ph${i} + u_FxP[${i}].x * u_Time * -0.5);
      float cB${i} = sin(0.4 + ph${i} + u_FxP[${i}].x * u_Time * 0.041666666);
      float cC${i} = sin(0.4 + ph${i} + u_FxP[${i}].x * u_Time * -0.0013888889);
      float cD${i} = sin(0.4 + ph${i} + u_FxP[${i}].x * u_Time * 0.000024801587);
      uv += vec2(zw${i}.x * (sA${i} + sB${i} + sC${i} + sD${i}) * amp${i}, zw${i}.y * (cA${i} + cB${i} + cC${i} + cD${i}) * amp${i});
    }
  }`)
    flowBlocks.push(`
  if (${i} < u_FxCount && u_FxType[${i}] == 4) {
      vec4 f${i} = texture(u_FxMask[${i}], uv0);
      vec2 flow${i} = u_FxRG88[${i}] > 0.5 ? vec2(f${i}.a, f${i}.r) : f${i}.rg;
      float fg${i} = u_Flip > 0.5 ? -1.0 : 1.0;
      flow${i} = (flow${i} - vec2(0.498)) * 2.0 * fg${i};
      float amount${i} = min(1.0, length(flow${i}));
      float phR${i} = smoothstep(0.2, 0.8, texture(u_Aux, uv0 * u_FxP[${i}].z).r);
      float amp${i} = u_FxP[${i}].y * 0.1;
      float cx${i} = fx_frac(u_Time * u_FxP[${i}].x);
      float tv${i} = cx${i} < 0.5 ? cx${i} * 2.0 - 0.5 : 1.5 - cx${i} * 2.0;
      vec2 off${i} = flow${i} * (amp${i} * tv${i});
      vec4 fa${i} = texture(u_Tex, uv + off${i});
      vec4 fb${i} = texture(u_Tex, uv - off${i});
      t = mix(t, mix(fa${i}, fb${i}, phR${i}), amount${i});
  }`)
  }
  return `#version 300 es
precision mediump float;
in vec2 v_UV;
uniform sampler2D u_Tex;
uniform vec3 u_Color;
uniform float u_Alpha;
uniform vec3 u_Tint;
uniform float u_TintAlpha;
uniform vec3 u_Key;
uniform float u_KeyFuzz;
uniform float u_KeyTol;
uniform float u_Time;
uniform int u_FxCount;
uniform int u_FxType[8];   // 0=scroll 1=shake 2=waves 3=sway 4=flow
uniform vec4 u_FxP[8];     // scroll:(sx,sy,rx,ry) shake:(speed,amp,fx,fy) waves:(speed,scale,strength,direction) sway:(speed,strength,noiseScale,direction) flow:(speed,strength,phaseScale,0)
uniform sampler2D u_FxMask[8];
uniform float u_FxRG88[8];
uniform sampler2D u_Noise;
uniform sampler2D u_Aux;
uniform vec2 u_FbSize;
uniform float u_Flip;
uniform float u_AmpScale;
out vec4 fragColor;

float fx_frac(float x) { return x - floor(x); }
vec2 rot2(vec2 v, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
}

void main() {
  vec2 uv0 = v_UV;
  vec2 uv = v_UV;
${dispBlocks.join('')}
  vec4 t = texture(u_Tex, uv);
${flowBlocks.join('')}
  vec3 rgb = t.rgb * u_Color;
  float a = t.a * u_Alpha;
  rgb = mix(rgb, u_Tint, u_TintAlpha);
  float delta = abs(u_Key.r - rgb.r) + abs(u_Key.g - rgb.g) + abs(u_Key.b - rgb.b);
  float blend = smoothstep(0.001, 0.002 + u_KeyFuzz, delta - u_KeyTol);
  a *= mix(0.0, 1.0, blend);
  fragColor = vec4(rgb, a);
}`
}

const FRAG = buildFragSource()

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

const MAX_FX = 8

export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, antialias: false, alpha: false })
  if (!gl) throw new Error('当前浏览器不支持 WebGL2')

  const program = linkProgram(gl, VERT, FRAG)
  gl.useProgram(program)
  const loc = {
    mvp: gl.getUniformLocation(program, 'u_MVP'),
    color: gl.getUniformLocation(program, 'u_Color'),
    alpha: gl.getUniformLocation(program, 'u_Alpha'),
    tint: gl.getUniformLocation(program, 'u_Tint'),
    tintAlpha: gl.getUniformLocation(program, 'u_TintAlpha'),
    key: gl.getUniformLocation(program, 'u_Key'),
    keyFuzz: gl.getUniformLocation(program, 'u_KeyFuzz'),
    keyTol: gl.getUniformLocation(program, 'u_KeyTol'),
    time: gl.getUniformLocation(program, 'u_Time'),
    fxCount: gl.getUniformLocation(program, 'u_FxCount'),
    fxType: gl.getUniformLocation(program, 'u_FxType[0]'),
    fxP: gl.getUniformLocation(program, 'u_FxP[0]'),
    fxMask: new Array(MAX_FX).fill(0).map((_, i) => gl.getUniformLocation(program, 'u_FxMask[' + i + ']')),
    fxRG88: gl.getUniformLocation(program, 'u_FxRG88[0]'),
    noise: gl.getUniformLocation(program, 'u_Noise'),
    aux: gl.getUniformLocation(program, 'u_Aux'),
    fbSize: gl.getUniformLocation(program, 'u_FbSize'),
    flip: gl.getUniformLocation(program, 'u_Flip'),
    ampScale: gl.getUniformLocation(program, 'u_AmpScale'),
    aPos: gl.getAttribLocation(program, 'a_Position'),
    aUv: gl.getAttribLocation(program, 'a_TexCoord'),
  }

  // 单位四边形（两个三角形）
  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)
  const posBuf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -0.5, -0.5, 0, 0, 0,
    0.5, -0.5, 0, 1, 0,
    0.5, 0.5, 0, 1, 1,
    -0.5, -0.5, 0, 0, 0,
    0.5, 0.5, 0, 1, 1,
    -0.5, 0.5, 0, 0, 1,
  ]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(loc.aPos)
  gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 20, 0)
  gl.enableVertexAttribArray(loc.aUv)
  gl.vertexAttribPointer(loc.aUv, 2, gl.FLOAT, false, 20, 12)

  // 白色 1x1 备用纹理
  const white = makeTexture(gl, new Uint8Array([255, 255, 255, 255]), 1, 1)
  gl.bindVertexArray(null)

  gl.enable(gl.BLEND)
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

  function render(scene, textures, width, height, time = 0) {
    const flip = globalThis.__WE_FLIP ? 1.0 : 0.0
    const amp = globalThis.__WE_AMP !== undefined ? globalThis.__WE_AMP : 1.0
    gl.viewport(0, 0, width, height)
    const general = scene.general || {}
    if (general.clearenabled !== false) {
      const cc = vec3(general.clearcolor || '0 0 0')
      gl.clearColor(cc[0], cc[1], cc[2], 1)
    } else {
      gl.clearColor(0, 0, 0, 1)
    }
    gl.clear(gl.COLOR_BUFFER_BIT)
    const cam = buildCamera(scene, width, height)
    const viewProj = mat4Multiply(cam.projection, cam.view)
    gl.useProgram(program)
    gl.bindVertexArray(vao)
    let drawn = 0
    for (const layer of scene.layers) {
      if (!layer.visible || layer.particle) continue
      const texObj = layer.solid || !layer.textureName ? null : textures.get(layer.textureName)
      if (texObj && texObj.video) continue // 视频纹理图层：Phase 4 支持播放
      const tex = texObj && texObj.glTex ? texObj.glTex : white
      const a = ALIGN[layer.alignment] || [0.5, 0.5]
      const w = layer.size[0] * layer.scale[0]
      const h = layer.size[1] * layer.scale[1]
      let m = mat4Identity()
      m = mat4Translate(m, layer.origin[0], layer.origin[1], layer.origin[2])
      m = mat4RotateZ(m, layer.angles[2])
      m = mat4Scale(m, w, h, 1)
      const mvp = mat4Multiply(viewProj, m)
      gl.uniformMatrix4fv(loc.mvp, false, mvp)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.uniform3f(loc.color, layer.color[0] * layer.brightness, layer.color[1] * layer.brightness, layer.color[2] * layer.brightness)
      gl.uniform1f(loc.alpha, layer.alpha)
      gl.uniform1f(loc.time, time)
      gl.uniform1f(loc.flip, flip)
      gl.uniform1f(loc.ampScale, amp)
      // 全局噪声（util/noise）绑定到 9 号纹理单元
      const noiseTex = textures.get('util/noise')
      gl.activeTexture(gl.TEXTURE9)
      gl.bindTexture(gl.TEXTURE_2D, noiseTex && noiseTex.glTex ? noiseTex.glTex : white)
      gl.uniform1i(loc.noise, 9)
      gl.uniform2f(loc.fbSize, texObj ? texObj.width : 1, texObj ? texObj.height : 1)
      const fx = effectUniforms(layer, time)
      // 水流相位纹理（本图层第一个 flow 效果的 phase 纹理）绑定到 10 号单元
      const flowItem = fx.items.find((it) => it.type === 'flow')
      const auxTex = flowItem && flowItem.phase ? textures.get(flowItem.phase) : null
      gl.activeTexture(gl.TEXTURE10)
      gl.bindTexture(gl.TEXTURE_2D, auxTex && auxTex.glTex ? auxTex.glTex : white)
      gl.uniform1i(loc.aux, 10)
      gl.uniform3f(loc.tint, fx.tint[0], fx.tint[1], fx.tint[2])
      gl.uniform1f(loc.tintAlpha, fx.tintAlpha)
      gl.uniform3f(loc.key, fx.key[0], fx.key[1], fx.key[2])
      gl.uniform1f(loc.keyFuzz, fx.fuzz)
      gl.uniform1f(loc.keyTol, fx.tol)
      const count = Math.min(fx.items.length, MAX_FX)
      const types = new Int32Array(MAX_FX)
      const params = new Float32Array(MAX_FX * 4)
      const rg88 = new Float32Array(MAX_FX)
      gl.uniform1i(loc.fxCount, count)
      for (let i = 0; i < count; i++) {
        const it = fx.items[i]
        types[i] = it.type === 'scroll' ? 0 : it.type === 'shake' ? 1 : it.type === 'waves' ? 2 : it.type === 'sway' ? 3 : 4
        if (it.type === 'scroll') {
          params[i * 4] = it.sx
          params[i * 4 + 1] = it.sy
          params[i * 4 + 2] = it.rx
          params[i * 4 + 3] = it.ry
        } else if (it.type === 'shake') {
          params[i * 4] = it.speed
          params[i * 4 + 1] = it.amp
          params[i * 4 + 2] = it.friction[0]
          params[i * 4 + 3] = it.friction[1]
        } else if (it.type === 'waves') {
          params[i * 4] = it.speed
          params[i * 4 + 1] = it.scale
          params[i * 4 + 2] = it.strength
          params[i * 4 + 3] = it.direction
        } else if (it.type === 'sway') {
          params[i * 4] = it.speed
          params[i * 4 + 1] = it.strength
          params[i * 4 + 2] = it.noiseScale
          params[i * 4 + 3] = it.direction
        } else {
          params[i * 4] = it.speed
          params[i * 4 + 1] = it.strength
          params[i * 4 + 2] = it.phaseScale
          params[i * 4 + 3] = 0
        }
        const maskTex = it.mask ? textures.get(it.mask) || null : null
        if (maskTex) {
          gl.activeTexture(gl.TEXTURE1 + i)
          gl.bindTexture(gl.TEXTURE_2D, maskTex.glTex)
          gl.uniform1i(loc.fxMask[i], 1 + i)
          rg88[i] = it.masked ? 2 : maskTex.rg88 ? 1 : 0
        } else {
          gl.activeTexture(gl.TEXTURE1 + i)
          gl.bindTexture(gl.TEXTURE_2D, white)
          gl.uniform1i(loc.fxMask[i], 1 + i)
          rg88[i] = 0
        }
      }
      gl.uniform1iv(loc.fxType, types)
      gl.uniform4fv(loc.fxP, params)
      gl.uniform1fv(loc.fxRG88, rg88)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      drawn++
    }
    gl.bindVertexArray(null)
    return drawn
  }

  return { gl, render }
}

export function makeTexture(gl, rgba, width, height, bitmap = null) {
  const tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  if (bitmap) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap)
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba)
  }
  return tex
}

function effectUniforms(layer, time) {
  const items = []
  let tint = [0, 0, 0]
  let tintAlpha = 0
  let key = [0, 0, 0]
  let fuzz = 0
  let tol = -100
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
        noiseScale: typeof c.scale === 'number' ? c.scale : 0.05,
      })
    } else if (e.file.endsWith('pulse/effect.json')) {
      // 音频驱动脉冲（AUDIOPROCESSING）：无音频支持时跳过（WE 中无音频则 pulse=0）
      if (pass && pass.combos && pass.combos.AUDIOPROCESSING) continue
      // WebGL 渲染器暂未实现 pulse 颜色混合，跳过（保持与 CPU 一致的视觉）
      continue
    } else if (e.file.endsWith('tint/effect.json') && c.color !== undefined) {
      tint = vec3(typeof c.color === 'string' ? c.color : c.color.value)
      tintAlpha = typeof c.alpha === 'number' ? c.alpha : 1
    } else if (e.file.endsWith('colorkey/effect.json') && c.color !== undefined) {
      key = vec3(typeof c.color === 'string' ? c.color : c.color.value)
      fuzz = typeof c.fuzziness === 'number' ? c.fuzziness : 0
      tol = typeof c.tolerance === 'number' ? c.tolerance : 0.1
    }
  }
  return { items, tint, tintAlpha, key, fuzz, tol }
}

function linkProgram(gl, vsSrc, fsSrc) {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc)
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc)
  const p = gl.createProgram()
  gl.attachShader(p, vs)
  gl.attachShader(p, fs)
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error('着色器链接失败: ' + gl.getProgramInfoLog(p))
  }
  return p
}

function compile(gl, type, src) {
  const s = gl.createShader(type)
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error('着色器编译失败: ' + gl.getShaderInfoLog(s))
  }
  return s
}

function vec3(s) {
  const p = String(s).trim().split(/\s+/).map(Number)
  return [p[0] || 0, p[1] || 0, p[2] || 0]
}

function vec2(s) {
  const p = String(s).trim().split(/\s+/).map(Number)
  return [p[0] || 0, p[1] || 0]
}
