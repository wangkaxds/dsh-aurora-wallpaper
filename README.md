<p align="center">
  <img src="https://img.shields.io/badge/Steam%20%E5%B7%A5%E5%9D%8A-40%E4%B8%87%E5%BC%A0%E5%A3%81%E7%BA%B8-1b2838?style=for-the-badge&logo=steam" alt="40万张壁纸"/>
  <img src="https://img.shields.io/badge/%E5%9C%BA%E6%99%AF%E5%A3%81%E7%BA%B8-%E6%B5%8F%E8%A7%88%E5%99%A8%E5%8E%9F%E7%94%9F%E6%B8%B2%E6%9F%93-9b59b6?style=for-the-badge" alt="场景壁纸原生渲染"/>
  <img src="https://img.shields.io/badge/HLSL%E2%86%92GLSL-%E5%AE%9E%E6%97%B6%E8%BD%AC%E8%AF%91-f39c12?style=for-the-badge" alt="HLSL→GLSL"/>
  <img src="https://img.shields.io/badge/license-MIT-brightgreen?style=for-the-badge" alt="MIT"/>
</p>

# 🔥 你的 AI 界面背景 = Steam 工坊动态壁纸

**Wallpaper Engine 的场景壁纸，原汁原味搬进 DeepSeek Harness 网页界面。**

别人家的 AI 界面是灰底白字；你的界面背景是**云汐在你聊天框后面呼吸，发丝随风水波荡漾**。这不是视频回放——这是壁纸引擎的场景文件被**真·重新渲染**：每一层图层、每一条效果链、每一个 HLSL 着色器，都被实时翻译成 GLSL 在你的 GPU 上跑。

> **Steam 工坊 40 万张动态壁纸，从今天起都是你的聊天背景。**
> 视频壁纸？零转码直连。场景壁纸？浏览器原生渲染。一个插件全都要。

---

## ⚡ 一分钟上手

1. DeepSeek Harness → cordis 插件面板，装载 `src/host.js` + `src/client.js`
2. `src/host.js` 里把 `workshopDir` 指向你的 WE 工坊目录
3. 刷新页面 —— **背景活了**（自动扫描、自动排序、记住你的选择）

📖 保姆级教程：[docs/INSTALL.zh.md](docs/INSTALL.zh.md)

## ✨ 能力清单

| 能力 | 说明 |
| --- | --- |
| 🎬 视频壁纸直连 | 自动扫描工坊目录、读取真实标题，4K 原画 + Range 流式，零转码零拷贝 |
| 🧩 场景壁纸原生渲染 | `scene.pkg` 图层/旋转/缩放/效果链/着色器全部实时重现——不是预览图凑合 |
| 🔁 HLSL→GLSL 实时转译 | 自研转译器逐字翻译 WE 效果 shader，修一处全场景受益 |
| 🎯 视频纹理层 | TEXV 容器内嵌 MP4 直接当图层纹理（录屏类场景主视觉） |
| 🧬 父子层级 | 部件挂接自动合并世界坐标，头发眼睛各就各位 |
| 🖱️ 鼠标视差 | `cameraparallax` + `parallaxDepth` 原参数还原，近景远景分层漂移 |
| 🖼️ 雾面玻璃 UI | 半透明纱罩 + 顶部渐深 + 底部柔暗，壁纸透光文字清晰 |
| 🎨 主题系统 | 「动态壁纸·暗/亮」与内置明暗共存，设置面板一键切换 |
| 🧠 状态记忆 | 选择持久化、多页面同步、刷新不丢 |
| 🔍 内置诊断 | 演示器（真实渲染帧率）+ WebGL 环境诊断页 |

## 🏗️ 技术内幕

- **通用 pass 管线**：copy → 效果链（FBO 乒乓）→ 合成，与 WE 引擎同构，任何场景同一套路；
- **引擎语义级对齐**：`y = H - origin.y`、旋转取负、纹理槽 MASK combo、清屏色……逐条对照引擎源码；
- **修复级转译器**：隐式类型转换（`1 - g_Rough` 也不放过）、行向量 `mul`、标量广播、精度统一、标识符保护；
- **中文场景名**：pkg 条目名 UTF-8 解码，中文名场景不再白屏；
- **不完整 mip 链自救**：WE 容器有时只存部分 mip 级（WebGL 采样恒黑），自动补齐——这坑全网没几篇文档提过。

## 📦 独立开源引擎：we-scene

场景渲染引擎是独立 ES 模块，已单独开源 **[wangkaxds/we-scene](https://github.com/wangkaxds/we-scene)**：

- `pkg/` —— scene.pkg 容器、TEX 纹理解码（DXT1/3/5、RG88、R8、LZ4…）、视频容器
- `render/hlsl2glsl.js` —— **HLSL→GLSL 转译器，开箱即用**
- `render/renderer.js` —— 通用 pass 管线渲染器（WebGL2）
- `scene/` —— 场景解析（父子层级、效果链、视差）

**想把 WE 场景塞进你自己的网页？拿走 we-scene，一行 import 的事。**

## 🗺️ 支持矩阵

- ✅ 视频壁纸、2D 场景（图层 + 效果链 + 父子层级 + 视差 + 视频纹理）
- 🔜 粒子系统、3D 模型、组件（时钟/天气）、文字对象、声音
- 📄 疑难场景分析：[docs/SCENE_LOAD_FAILURE_REPORT.md](docs/SCENE_LOAD_FAILURE_REPORT.md)

## 🛠️ 排错速查

- **背景没出现**：Ctrl+F5；确认浏览器硬件加速开启（`edge://gpu` → WebGL 必须是 Hardware accelerated——CPU 软件渲染会让场景卡成幻灯片，这不是插件的问题）
- **场景切换异常 / 白块 / 黑屏**：均已修复（shader 缓存串用、空层白兜底、mip 链不完整），复现请报 Issue
- **调口味**：`src/client.js` 里的主题 token

## 💬 社区

🐛 [Issues](https://github.com/wangkaxds/dsh-aurora-wallpaper/issues/new) · 💬 [Discussions](https://github.com/wangkaxds/dsh-aurora-wallpaper/discussions) · 🧭 仓库带 `dsh-plugin` 标签

## 📄 许可

MIT —— 见 [LICENSE](LICENSE)。仓库只含代码，不含任何壁纸素材。

## 👥 贡献者

- **网卡小电视** —— 需求、设计、素材与验收
- **DeepSeek AI** —— 插件与渲染引擎实现
