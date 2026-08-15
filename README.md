# 🔥 你的 AI 界面背景 = Steam 工坊动态壁纸

**把 Wallpaper Engine 的场景壁纸，原汁原味搬进 DeepSeek Harness 的网页界面。**

别人家的 AI 界面是灰底白字。你的界面背景是**崩坏3 的云汐在你聊天框后面呼吸、头发随风水波荡漾**——因为这不是视频，是**壁纸引擎的场景文件在浏览器里被真·重新渲染**：每一层图层、每一条效果链、每一个 HLSL shader，都被实时翻译成 GLSL 在你的 GPU 上跑。

> 一句话：**Steam 工坊 40 万张动态壁纸，从今天起都是你的聊天背景。**

---

## ✨ 它能做什么

| 能力 | 说明 |
| --- | --- |
| 🎬 **视频壁纸直连** | 自动扫描 WE 工坊目录，读取真实标题，零转码零拷贝直接播放（4K 原画 + Range 分段流式） |
| 🧩 **场景壁纸原生渲染** | `scene.pkg` 不再是"预览图凑合"——图层摆放、旋转缩放、效果链、着色器全部实时重现 |
| 🔁 **HLSL → GLSL 实时转译** | 自研转译器把 WE 的 HLSL 效果 shader 逐字翻译成 GLSL，一次修复所有壁纸受益 |
| 🎯 **视频纹理层** | TEXV 容器里的 MP4 直接变成图层纹理（录屏类场景的主视觉） |
| 🧬 **父子层级** | 角色部件的父子挂接自动合并成世界坐标，头发眼睛各就各位 |
| 🖱️ **鼠标视差** | `cameraparallax` + `parallaxDepth` 原参数还原，近景远景随鼠标分层漂移 |
| 🖼️ **雾面玻璃 UI** | 半透明纱罩 + 顶部渐深 + 底部柔和渐暗，壁纸透光、文字清晰 |
| 🎨 **主题系统** | 「动态壁纸·暗/亮」两套主题与内置明暗共存，设置面板一键切换 |
| 🧠 **状态记忆** | 选中的壁纸记住，刷新不丢，多页面同步 |
| 🔍 **内置诊断** | WebGL 环境诊断页 + 演示器（自动加载 + 实时渲染帧率） |

## 🏗️ 技术内幕（值得吹的部分）

- **通用 pass 管线**：copy → 效果链（FBO 乒乓）→ 合成，与 WE 引擎同构的渲染图，任何场景的效果都走同一条路；
- **WE 语义级兼容**：图层坐标 `y = H - origin.y`、旋转取负、纹理槽 MASK combo、mip 链、清屏色……全部对照引擎源码逐条对齐；
- **修复级转译器**：HLSL 隐式类型转换、行向量 `mul`、标量广播、精度统一、标识符保护——连 `1 - g_Rough` 这种边角都会正确翻译；
- **中文场景名支持**：pkg 条目名 UTF-8 解码，非英文名的场景不再白屏；
- **不完整 mip 链自救**：WE 容器有时只存部分 mip 级（WebGL 采样恒黑），自动 `generateMipmap` 补齐——这坑全网没几篇文档提过。

## 📦 可独立复用的核心：`packages/we-scene`

整个场景渲染引擎是**独立 ES 模块**，不依赖 Harness 也能单独使用，**已单独开源为 [wangkaxds/we-scene](https://github.com/wangkaxds/we-scene)**：

- `src/pkg/` — scene.pkg 容器解析（PKGV 格式）、TEX 纹理解码（ARGB8888/RGB888/RGB565/DXT1/3/5/RG88/R8/LZ4）、视频容器
- `src/render/hlsl2glsl.js` — **HLSL→GLSL 转译器**（预处理 + combo 展开 + 类型转换，开箱即用）
- `src/render/renderer.js` — 通用 pass 管线渲染器（WebGL2）
- `src/scene/` — 场景解析（父子层级、效果链、视差）
- 演示：`node packages/we-scene/cli/serve.mjs` → 打开 `http://localhost:8123/demo/?id=<工坊文件夹>` 直接加载场景

**想把 WE 场景塞进你自己的网页项目？拿走 `we-scene`，一行 import 的事。**

## 🚀 快速开始

> 📖 保姆级教程（装载/验收/调参/排错）：[docs/INSTALL.zh.md](docs/INSTALL.zh.md)

1. DeepSeek Harness → cordis 插件面板，装载 `src/host.js`（宿主半）与 `src/client.js`（客户端半）；
2. 改 `src/host.js` 顶部 `CONFIG.workshopDir` 指向你的 WE 工坊目录；
3. 刷新页面。背景活了。

演示器（无需装插件）：`node packages/we-scene/cli/serve.mjs` 后访问 `http://localhost:8123/demo/`，左上角实时显示真实渲染帧率。

## 🗺️ 支持矩阵与路线

✅ 已支持：视频壁纸、2D 场景（图层 + 效果链 + 父子层级 + 视差 + 视频纹理）
🔜 规划中：粒子系统、3D 模型层、组件（时钟/天气）、文字对象、声音
📄 三个疑难场景的加载失败分析：[docs/SCENE_LOAD_FAILURE_REPORT.md](docs/SCENE_LOAD_FAILURE_REPORT.md)

## 🛠️ 常见问题

- **背景没出现**：Ctrl+F5 硬刷新；检查浏览器是否开了硬件加速（`edge://gpu` 看 WebGL 是否为 Hardware accelerated——CPU 软件渲染会让场景卡成幻灯片，这不是插件的问题）；
- **场景切换后黑屏/白块**：已修复（shader 缓存串用、空层白兜底、mip 链不完整），如再遇到请报 Issue；
- **深浅口味**：`src/client.js` 里调主题 token。

## 💬 社区

- 🐛 [Issues](https://github.com/wangkaxds/dsh-aurora-wallpaper/issues/new)
- 💬 [Discussions](https://github.com/wangkaxds/dsh-aurora-wallpaper/discussions)
- 🧭 仓库带 `dsh-plugin` 标签，欢迎在社区扩散

## 📄 许可

MIT —— 见 [LICENSE](LICENSE)。仓库只含代码，不含任何壁纸素材。

## 👥 贡献者

- **网卡小电视** —— 需求、设计、壁纸素材与验收
- **DeepSeek AI** —— 插件与渲染引擎实现
