// WebGL2 渲染器：与 cpu.js 同一套场景模型/矩阵/效果语义
// Phase 2：图像/纯色图层 + tint + colorkey（fragment 内实现）
import { mat4Identity, mat4Multiply, mat4RotateZ, mat4Translate, buildCamera } from './math.js'

const VERT = `#version 300 es
in vec3 a_Position;
in vec2 a_TexCoord;
uniform mat4 u_MVP;
out vec2 v_UV;
void main() {
  gl_Position = u_MVP * vec4(a_Position, 1.0);
  v_UV = a_TexCoord;
}`

const FRAG = `#version 300 es
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
uniform vec2 u_Scroll;
uniform vec2 u_Repeat;
out vec4 fragColor;
void main() {
  vec2 uv = fract((v_UV + u_Scroll) * u_Repeat);
  vec4 t = texture(u_Tex, uv);
  vec3 rgb = t.rgb * u_Color;
  float a = t.a * u_Alpha;
  rgb = mix(rgb, u_Tint, u_TintAlpha);
  float delta = abs(u_Key.r - rgb.r) + abs(u_Key.g - rgb.g) + abs(u_Key.b - rgb.b);
  float blend = smoothstep(0.001, 0.002 + u_KeyFuzz, delta - u_KeyTol);
  a *= mix(0.0, 1.0, blend);
  fragColor = vec4(rgb, a);
}`

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
    scroll: gl.getUniformLocation(program, 'u_Scroll'),
    repeat: gl.getUniformLocation(program, 'u_Repeat'),
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
      const tex = layer.solid || !layer.textureName ? white : textures.get(layer.textureName) || white
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
      const fx = effectUniforms(layer, time)
      gl.uniform3f(loc.tint, fx.tint[0], fx.tint[1], fx.tint[2])
      gl.uniform1f(loc.tintAlpha, fx.tintAlpha)
      gl.uniform3f(loc.key, fx.key[0], fx.key[1], fx.key[2])
      gl.uniform1f(loc.keyFuzz, fx.fuzz)
      gl.uniform1f(loc.keyTol, fx.tol)
      gl.uniform2f(loc.scroll, fx.scroll[0], fx.scroll[1])
      gl.uniform2f(loc.repeat, fx.repeat[0], fx.repeat[1])
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
  let tint = [0, 0, 0]
  let tintAlpha = 0
  let key = [0, 0, 0]
  let fuzz = 0
  let tol = -100
  let scroll = [0, 0]
  let repeat = [1, 1]
  for (const e of layer.effects || []) {
    if (!e.visible) continue
    const pass = e.passes && e.passes[0]
    const c = pass ? pass.constantshadervalues : {}
    if (e.file.endsWith('scroll/effect.json')) {
      const sx = typeof c.speedx === 'number' ? c.speedx : 0
      const sy = typeof c.speedy === 'number' ? c.speedy : 0
      scroll = [Math.sign(sx) * sx * sx * time, Math.sign(sy) * sy * sy * time]
      if (c.repeat !== undefined) repeat = vec2(c.repeat)
    } else if (e.file.endsWith('tint/effect.json') && c.color !== undefined) {
      tint = vec3(typeof c.color === 'string' ? c.color : c.color.value)
      tintAlpha = typeof c.alpha === 'number' ? c.alpha : 1
    } else if (e.file.endsWith('colorkey/effect.json') && c.color !== undefined) {
      key = vec3(typeof c.color === 'string' ? c.color : c.color.value)
      fuzz = typeof c.fuzziness === 'number' ? c.fuzziness : 0
      tol = typeof c.tolerance === 'number' ? c.tolerance : 0.1
    }
  }
  return { tint, tintAlpha, key, fuzz, tol, scroll, repeat }
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
