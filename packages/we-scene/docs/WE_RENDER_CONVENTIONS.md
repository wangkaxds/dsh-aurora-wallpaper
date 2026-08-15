# WE 渲染约定（scene.pkg 渲染器）

本文档定义本渲染器与 Wallpaper Engine（WE）效果系统的**坐标与公式约定**。
唯一权威是 WE 的 shader 原文（`wallpaper_engine/assets/shaders/` 与场景 pkg 内的 `shaders/effects/*`），
以及社区验证过的参考实现 linux-wallpaperengine 的渲染主路径。
所有结论均以源码行号为据；**禁止**凭肉眼调参引入任何全局翻转/缩放开关。

## 0. 架构：通用 pass 管线 + shader 转译

渲染器不手写效果公式，而是：
1. **HLSL→GLSL 转译**（`render/hlsl2glsl.js`）：WE 的 shader（HLSL 方言）在运行时转译为 GLSL ES 3.0 并编译执行。
   覆盖：预处理（#include/#define/#if combo）、mul 行向量语义（transpose）、CAST/texSample2D/saturate/frac 方言、
   标量广播、隐式 int→float、保留字。
2. **通用 pass 管线**（`render/renderer.js`，移植 linux-wallpaperengine 架构）：
   - 每层：copy pass → 层 FBO（乒乓 A/B）→ 效果链（按 effect.json 的 material passes，逐个编译/运行转译 shader）→ 合成上屏。
   - target/bind 支持（localcontrast 的多 FBO 链）。
   - copy/合成用自写 shader；效果 pass 用转译 WE shader（MVP=单位矩阵，mul 转置无影响）。
3. **combo 权威语义**（ShaderUnit.cpp）：
   - 显式提供（material/scene pass combos）> 声明 default（`[COMBO]` 注释）> 0（`ShaderUnit.cpp:442-477`）。
   - 纹理关联 combo：sampler 注释声明 combo 且该槽提供了纹理 → combo=1（`ShaderUnit.cpp:545-617`）。
   - discovered combos 参与编译（`ShaderUnit.cpp:684-692`）。
4. **uniform**：constantshadervalues 的键是 material 名（如 "speedx"），经 shader 注释
   `{"material":"speedx"}` 映射到 uniform 名（g_ScrollX）；缺省用注释 default。
5. **纹理**：.tex 带 mip 链 + LINEAR_MIPMAP_LINEAR（噪声位移场靠此平滑）；RG88 以 GL_RG 上传（.r=原始R .g=原始G）。

## 1. 坐标空间

- **显示空间 = 图层四边形 uv 空间，v-down**：`v=0` 为图层画面顶部，`v=1` 为底部。
- 纹理数据为**上起行序**（tex 文件第 0 行 = 图顶；RePKG 解码无翻转，`RePKG/.../Helpers/DXT.cs:203`）。
- 本渲染器（CPU 与 WebGL）直接在显示空间逐像素计算效果，`v0` 即显示空间 v。
- **图层摆放**：WE 的 `origin` 以屏幕中心为原点、`origin.y` = **距屏幕底的距离**。
  最终屏幕坐标：`x = origin.x`（中心原点，屏幕左边缘 = -960），`y = H - origin.y`（左上原点）。
  依据：参考实现 `CImage.cpp:258-262` 的 `y = H/2 - y` 转换 + X11 输出经 XImage 再翻转
  （`X11Output.cpp:228`，glReadPixels 行 0 = 帧缓冲底部 → 显示在屏幕顶部），两者合成即 `y = H - origin.y`。
  渲染器里图层矩阵 = `translate(origin.x, H - origin.y) * rotateZ(-angle) * scale`。
  **旋转取负**：WE 角度为数学正方向（逆时针）；y-down 屏幕空间 `rotate(+a)` 视觉为顺时针，故取 `-angle`
  （等效参考实现 y-up 空间 `rotate(-angle)` + 呈现翻转）。
- **层 FBO 内容倒置**（与 WE 帧缓冲一致）：copy pass 顶采样 v=1（FBO 顶=纹理底行）；
  效果 pass 全屏 quad 顶 v=1（顶采顶直通，内容方向与 pass 数奇偶无关）；
  合成 quad 顶 v=0（采 FBO 底=纹理顶）→ 屏幕正立。
- **历史教训**：参考实现（linux-wallpaperengine）的 `texcoordPass` 是 `v=1@帧缓冲顶部`
  （`CImage.cpp:348-351`），但那是在 **GL 帧缓冲空间**：GL 上传上起行序数据 + 标准四边形
  使帧缓冲内画面倒置，X11 输出再经 `XImage` 翻一次（`X11Output.cpp:228`）——
  合成到显示空间就是 v-down。Windows WE（D3D：纹理第 0 行 = v=0 = 图顶，屏幕顶部 v=0）
  独立推导同结论。**切勿再把帧缓冲空间误当显示空间。**

## 2. 效果链语义

- 每个效果 = 一个独立 pass，输入纹理是前一效果的输出（FBO 乒乓，
  `CImage.cpp:setupPasses`），但每个 pass 的**四边形 uv 恒为原始 uv**（不链式传递）。
- 因此：**所有效果的输入采样（蒙版/噪声/流向/相位）一律用原始 uv**；
  位移只累加到最终采样坐标。
- 位移类效果（scroll/shake/waterwaves/foliagesway）修改采样坐标；
  waterflow 在采样后按颜色混合；tint/pulse/colorkey 是颜色后处理。
- 效果顺序 = scene.json 的 effects 列表顺序。
- 已知近似：waterflow 与位移混排时按"全部位移完成后统一 flow 混色"处理
  （WE 是严格按列表顺序的 FBO 链；当前 6 个场景中 flow 均位于效果列表尾部，等价）。

## 3. 常量

- `M_PI_2 = 2π = 6.28318530718`（WE shader 用法如 `sin(frac(t/M_PI_2)*M_PI_2) = sin(t)` 可证）。
- `M_PI = π`；shader 里 `M_PI * 2` 才是 2π（foliagesway）。
- 纹理过滤 = 双线性（GL_LINEAR；CPU 侧为双线性采样，噪声高频纹理必须双线性）。
- 分辨率 uniform `g_TextureXResolution = (texW, texH, realW, realH)`；
  蒙版 uv 缩放 = `uv * realW/texW`（无 NPOT padding 时恒等，保留计算）。
- `g_TexelSize` 用场景分辨率（本渲染器未用到）。

## 4. 纹理通道

- DXT1/3/5、ARGB8888 = RGBA 字节，行序上起（见 1）。
- RG88 → 解码为 `(r,g,b)=G, a=R`（`texture.js:fromRG88`，与 RePKG/ImageSharp 一致）。
  - 流向蒙版（mode=flowmask）：`flowMask = ((a,r) - 0.498) * 2`（= 原始 R,G 通道）。
  - 不透明蒙版（mode=opacitymask）：取 `a`（= 原始 R 通道）。
- 参考实现 GL 侧 RG88 上传为 GL_RG，`.r`=原始 R、`.g`=原始 G，语义一致。

## 5. 效果公式（逐行翻译自 shader 原文）

### 5.1 scroll（scroll.frag:10）
```
scroll = sign(speed) * speed² * time          （scroll.vert:18-20）
uv_out = frac((uv0 + scroll) * repeat)        // 替换，不累加
```

### 5.2 shake（shake.frag:28-79，MASK 路径 81-85）
```
flowPhase = phaseTex.r @ (uv0 * phaseAspect) * M_PI_2     // textures[2]，默认 util/white → 2π
flowMask  = ((flow.rg) - 0.498) * 2                      // textures[1]，RG88 见 §4
time      = speed * t + flowPhase
offset    = sin(frac(time / M_PI_2) * M_PI_2)            // = sin(time mod 2π)，平滑
offset    = offset * 0.498 + 0.5
base      = step(0, cos(time))
offset    = mix(1 - (1-offset)^friction.x, offset^friction.y, base)
offset    = saturate((offset - bounds.x) * (1/(bounds.y-bounds.x)))
DIRECTION==0: offset = offset*2 - 1      // ==1: 保持 0..1；==2: offset-1
uv_out    = uv0 + offset * amp² * flowMask               // 两分量都加
MASK==1: mask = maskTex.r @ (offset*maskAspect + uv0*maskAspect)
         out = mix(base@uv0, base@uv_out, mask)
```

### 5.3 waterwaves（waterwaves.frag:15-23，vert:19-22）
```
dir      = rotate((0,1), direction)          // = (-sin a, cos a)
pos      = |dot(uv0 - 0.5, dir)|
distance = t*speed + dot(uv0, dir) * (scale + perspective*pos)
offset   = (dir.y, -dir.x) * sin(distance) * (strength² + perspective*pos) * mask
mask     = maskTex.r @ (uv0 * maskAspect)
uv_out   = uv0 + offset
```

### 5.4 foliagesway（foliagesway.vert:44-50 + frag:24-46）
```
aspect   = (realW/realH) * ratio           // resolution.z/w；无 padding = tex 尺寸
zw       = rotate((1/aspect, aspect), direction)
noiseUv  = uv0 * noiseScale
params   = rotate(uv0, direction)
amp      = strength² * 0.005               // v_Params.z
MASK==1: amp *= maskTex.r @ (uv0 * maskAspect)
phase    = (noise.g * 2π + params.x*10 + params.y*5) * phaseUniform
sines    = sin(phase + speed*t * [1, -0.16161616, 0.0083333, -0.00019841])
csines   = sin(0.4 + phase + speed*t * [-0.5, 0.041666666, -0.0013888889, 0.000024801587])
sines/csines 逐分量: pow(|x|, power) * sign(x)
uv_out   = uv0 + (zw.x * Σsines*amp, zw.y * Σcsines*amp)   // 两分量都加
```

### 5.5 waterflow（waterflow.frag:16-45）
```
flowPhase = phaseTex.r @ (uv0 * phaseScale)               // textures[2]
flowMask  = ((flow.rg) - 0.498) * 2                       // textures[1]
amount    = length(flowMask)                              // 不截断（mix 允许外插）
cycles    = frac(t*speed + [0, 0.5, 0.25, 0.75]) - 0.5
blend     = 2*|frac(t*speed) - 0.5|
blend2    = 2*|frac(0.25 + t*speed) - 0.5|
offA      = flowMask.xyxy * (amp*0.1) * cycles.xxyy       // .xy/.zw 两组
offB      = flowMask.xyxy * (amp*0.1) * cycles.zzww
albedo    = base @ uv
flowA     = mix(base@(uv+offA.xy), base@(uv+offA.zw), blend)
flowB     = mix(base@(uv+offB.xy), base@(uv+offB.zw), blend2)
flow      = mix(flowA, flowB, smoothstep(0.2, 0.8, flowPhase))
out       = mix(albedo, flow, amount)
```

### 5.6 tint（tint.frag:14-28）
```
mask  = alpha; MASK==1: mask *= maskTex.r @ (uv0 * maskAspect)
out.rgb = ApplyBlending(BLENDMODE, rgb, tintColor, mask)
BLENDMODE==0: out.a = 1
```
**combo 语义**：`BLENDMODE` 的 "default":30 只是 WE 编辑器 UI 默认值；
scene.json 的 pass 里没有 combos.BLENDMODE 时，shader 的 `#if` 链全部不成立，
走 ApplyBlending 的 fallthrough = **Normal（普通 lerp）**。本渲染器用 -1 表示"未定义→Normal"。
参考场景（文件夹 2423807815）的 tint pass 均无 combos → Normal。

### 5.7 pulse（pulse.frag:35-63，无音频路径）
```
pulse = smoothstep(thr.x, thr.y, sin(t*speed + phase)*0.5 + 0.5) * amount
pulse += noiseTex.r @ ((t, t*0.333) * noiseSpeed) * noiseAmount
pulse = pow(pulse, power)
PULSECOLOR: rgb = ApplyBlending(BLENDMODE, rgb*tintLow, rgb*tintHigh, pulse)   // 同 tint：combo 缺失 = 不编译 = 无颜色操作
PULSEALPHA: a *= pulse
MASK==1: out = mix(sample, out, maskTex.r @ uv0)
out = vec4(max(0, rgb), a)
```
**combo 语义**：`PULSECOLOR` 声明 default:1、`PULSEALPHA` default:0、`BLENDMODE` default:9
都只是编辑器 UI 默认；scene.json 的 pass 没有对应 combos 时 shader `#if` 不成立：
PULSECOLOR/PULSEALPHA 关闭（pulse 整体 no-op），BLENDMODE 走 fallthrough Normal。
参考场景（文件夹 2423807815）的 pulse pass 只有 BLENDMODE:22，无 PULSECOLOR → **pulse 为 no-op**。
音频路径（AUDIOPROCESSING）在无音频的渲染器里跳过（WE 无音频时 pulse=0）。

### 5.8 colorkey（colorkey.frag:14-30）
```
delta  = Σ|keyColor - rgb|
blend  = smoothstep(0.001, 0.002 + fuzz, delta - tolerance)
INVERT==1: blend = 1 - blend
a     *= mix(keyAlpha, 1, blend)           // keyAlpha 默认 0
FLATTEN==1: rgb *= a
```

## 6. 混合模式表（common_blending.h，WE 官方）

`ApplyBlending(mode, A, B, opacity) = mix(A, F(A,B), opacity)`，F：

| mode | F | mode | F |
|---|---|---|---|
| 0 | Normal(B) | 12 | SoftLight |
| 1 | Darken | 13 | HardLight |
| 2 | Multiply | 14 | VividLight |
| 3 | ColorBurn | 15 | LinearLight |
| 4 | Substract | 16 | PinLight |
| 5 | min(A,B) | 17 | HardMix |
| 6 | Lighten | 18 | Difference |
| 7 | Screen | 19 | Exclusion |
| 8 | ColorDodge | 20 | Substract |
| 9 | Add(min(A+B,1)) | 21 | Reflect |
| 10 | max(A,B) | 22 | **Glow** = Reflect(B,A) |
| 11 | Overlay | 23 | Phoenix |

| 24 | Average | 28 | Color |
| 25 | Negation | 29 | Luminosity |
| 26 | Hue | 30 | **Tint** = max(A)*B |
| 27 | Saturation | 31 | A+B*opacity |
| 32 | A+A*B | | |

SoftLightf: `blend<0.5 ? 2AB + A²(1-2B) : sqrt(A)(2B-1) + 2A(1-B)`（W3C 公式，与 §5 无关）。
Glow(A,B) = Reflect(B,A) = `(A==1 ? A : min(B²/(1-A), 1))`。
