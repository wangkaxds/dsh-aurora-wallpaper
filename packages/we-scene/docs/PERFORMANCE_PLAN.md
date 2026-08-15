# 场景壁纸性能优化方案报告

目标：**画质零损失（1080P 全分辨率输出、FBO 按纹理原始尺寸）、60fps、CPU 不再满载**。
现状：崩坏3场景 45 层、每帧约 100~300 个效果 pass，每 pass 30~40 次 GL 调用 → 每帧几千次 → 每秒几十万次，全部由 CPU 提交，GPU 在等命令（这就是 CPU 满载、显卡闲置的原因）。

## 一、瓶颈定位（实测与代码审计）

| 瓶颈 | 位置 | 性质 |
|---|---|---|
| 每 pass 20+ 次 uniform 调用（g_Time 等系统 uniform） | renderer.js `bindSystemUniforms` | CPU 调用量 × 几百 pass |
| 每 pass 强制绑定 8 个纹理槽（多数效果只用 2~4 个） | `renderLayer` 纹理绑定循环 | CPU 调用量 |
| 每 pass 新建 JS 对象（combos/mergedTex/resolutions/数组） | `renderLayer` | GC 压力 |
| 重复状态设置（useProgram/blend/viewport 相同仍重设） | 各 pass | CPU 调用量 |
| 渲染循环与 GPU 排队脱节 | RAF 无 busy 保护 | 卡顿螺旋 |

## 二、已完成（本轮，全部零画质损失）

1. shader 源按名缓存（消除每帧每 pass 的 fetch/正则）
2. quad 顶点数据缓存（消除每帧每 pass 的 bufferData）
3. uniform 位置初始化时查一次（消除每帧 getUniformLocation）
4. 单位/正交矩阵单例化（消除每帧数组分配）
5. 渲染热路径同步化（缓存命中无 await，消除每帧几千微任务）
6. 纹理分辨率 uniform 状态缓存（尺寸不变则跳过设置）
7. busy 标志防渲染堆积（丢帧不叠帧）
8. **FBO 分辨率限幅：默认关闭（画质零损失），仅作可选开关**

## 三、候选方案（按收益/风险排序，均不降画质）

### P1：系统 uniform 打包进 UBO（WebGL2 Uniform Buffer Object）★ 最推荐
把每 pass 约 20 个系统 uniform（g_Time、矩阵、颜色、亮度…）在转译器里统一注入同一个 `layout(std140) uniform SystemBlock`，CPU 侧一个共享 Float32Array 每帧填充一次、每 pass 仅 `bufferData` + `bindBufferBase` 两次调用。
- 收益：每 pass GL 调用 30+ → ~12，总量降 60%+
- 风险：中等（转译器要移除原同名 uniform 声明并注入 block；std140 布局需精确）
- 参考：WebGL 官方 uniform 优化指引、现代引擎（bevy/three.js）批量 uniform 上传实践

### P2：纹理槽按需绑定
从 ACTIVE_UNIFORMS 取 shader 实际使用的 sampler，只绑实际槽位（2~4 个），不再固定 8 个。
- 收益：每 pass 省 8~12 次 activeTexture/bindTexture 调用
- 风险：低（编译期已知 sampler 列表）

### P3：per-pass JS 对象复用
combos/mergedTex/resolutions 改预分配复用，避免每帧几百个小对象进 GC。
- 收益：GC 停顿消除
- 风险：低

### P4：GL 状态去重
useProgram/blendFunc/viewport 与当前状态相同则跳过调用（渲染器维护状态影子）。
- 收益：每 pass 省 3~5 次调用
- 风险：低

### P5（中长期）：效果 pass 合并
把一层内多个效果合并进单个 shader 一次绘制（类似 linux-wallpaperengine 的渲染图方式）。
- 收益：draw call 数量级下降，CPU/GPU 双降
- 风险：高（必须保持 WE 效果语义逐一等价，含 fbo target 语义），需要大量对拍验证

### P6（远景）：WebGPU 迁移
RenderBundle + BindGroup 缓存能把 CPU 提交成本再降一个量级。
- 收益：最大
- 风险：高（全管线重写）

## 四、推荐路线

1. 本轮立即实施：P1 + P2 + P3 + P4（纯 CPU 侧、零画质损失、改动集中）
2. 验证标准：你机器上 demo 左上角「渲染 XX fps」到 60、任务管理器 CPU 明显下降
3. 若仍不达标：再评估 P5

## 五、参考来源

- [linux-wallpaperengine 渲染系统（DeepWiki）](https://deepwiki.com/Almamu/linux-wallpaperengine/3-rendering-system)
- [linux-wallpaperengine 效果与多 pass（DeepWiki）](https://deepwiki.com/Almamu/linux-wallpaperengine/3.3-effects-and-passes)
- [linux-wallpaperengine FBO 与纹理（DeepWiki）](https://deepwiki.com/Almamu/linux-wallpaperengine/3.4-framebuffer-objects-and-textures)
- [WebGL 官方优化指引（Emscripten 移植）](https://chromium.journaldev.googlesource.com/external/github.com/kripken/emscripten/+/1facf3e687e7ede1c814f025683acfb6311f6f15%5E%21/site/source/docs/optimizing/Optimizing-WebGL.rst)
- [WebGPU 优化课程（uniform buffer/bundle 思想）](https://github.com/webgpu/webgpufundamentals/blob/03be54c6/webgpu/lessons/webgpu-optimization.md)
- [three.js WebGL 状态与资源管理（DeepWiki）](https://deepwiki.com/mrdoob/three.js/3.3-shader-system-and-compilation)
