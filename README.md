# DSH Aurora Wallpaper（壁纸引擎动态背景）

把 **Wallpaper Engine 工坊里的壁纸（视频与场景）**变成 DeepSeek Harness 网页界面的动态背景，垫在"雾面玻璃"纱罩之后，附带主题、切换面板和全套性能优化。

## 特性

- 🎬 **原视频直连**：自动扫描 Wallpaper Engine 工坊目录，读取 `project.json` 获取壁纸真实标题，全部自动加入列表（零转码、零拷贝）；
- 🖼️ **雾面玻璃观感**：半透明纱罩 + 顶部渐深 + 底部柔和渐暗，视频透光可见；
- 🎨 **两套内置主题**：`动态壁纸·暗` / `动态壁纸·亮`，与内置明暗主题四档共存；
- ⚙️ **设置面板**：在「设置 → 壁纸背景」里切换壁纸（列表点选 / 上一张 / 下一张）、同步扫描、从文件夹选择；
- 🚀 **性能优化**：视频独立 GPU 合成层、Range/206 分段流式播放、隐藏层动画自动停转、当前文件内存缓存；
- 🔁 **状态记忆**：选择存入 localStorage，页面脚本每 3 秒与宿主同步，列表与播放永不脱节；
- 🧩 **场景壁纸兼容**：`type: "scene"` 的工坊壁纸自动回退到动态 `preview.gif` / 静态图，带慢速漂移（Ken Burns）效果。

## 原理

- **宿主半**：注册 HTTP 路由（视频流、列表、状态、切换），并通过 `tapIndex` 向页面注入 `<video>` 层与同步脚本；
- **客户端半**：注册主题（token 覆盖）与设置页 UI，通过包内 RPC 与宿主通信；
- 视频元素 `z-index: -1` 垫在界面最底层，UI 表面用半透明 token 覆盖在其上。

## 快速开始

> 📖 **第一次使用？请先看保姆级教程：[docs/INSTALL.zh.md](docs/INSTALL.zh.md)**（含装载、验收、调参、排错、卸载全流程）。

1. 打开 DeepSeek Harness，进入 cordis 插件面板；
2. 把 `src/host.js` 与 `src/client.js` 分别作为宿主半和客户端半定义（或参照你习惯的插件装载方式）；
3. 修改 `src/host.js` 顶部的配置：

```js
const CONFIG = {
  // Wallpaper Engine 工坊内容目录（Steam 安装位置不同则改这里）
  workshopDir: 'D:\\steam\\steamapps\\workshop\\content\\431960',
  // 插件工作目录（清单缓存等；需要可写）
  vaultDir: 'D:\\aurora-wallpaper',
}
```

4. 运行插件后 **刷新页面**，视频即开始在背景播放。

## 配置说明

| 配置项 | 说明 |
| --- | --- |
| `workshopDir` | 壁纸引擎工坊目录，插件自动扫描其中所有含 mp4 的子文件夹 |
| `vaultDir` | 插件工作目录，用于缓存清单（不可写时功能不受影响，仅丢失跨重启记忆） |

## 常见问题

- **背景没出现**：先 Ctrl+F5 硬刷新；再检查是否有关闭多余标签页（激活会被其他页面抢占）；
- **视频循环处轻微卡顿**：浏览器对带音频轨的 4K 视频回跳需要重置渲染器，属已知限制；
- **深浅不合口味**：`src/client.js` 里搜 `body[data-ds-dark-theme]::after` 和主题 token 即可自行调参。

## 场景壁纸原生渲染路线

场景壁纸（`scene.pkg`）是编译后的特效程序，浏览器无法直接播放。当前插件为它们提供 `preview.gif` / 静态图回退显示；长期目标是**在浏览器里原生渲染场景**——完整的可行性结论、兼容分级与分阶段计划见 [docs/SCENE_RENDERER_PLAN.zh.md](docs/SCENE_RENDERER_PLAN.zh.md)。

## 社区与支持

- 💬 **反馈与讨论**：欢迎在 [GitHub Discussions](https://github.com/wangkaxds/dsh-aurora-wallpaper/discussions) 提交反馈；
- 🐛 **错误报告**：发现 bug 请到 [Issues](https://github.com/wangkaxds/dsh-aurora-wallpaper/issues/new) 提交；
- 🧭 **发现更多插件**：仓库添加了 `dsh-plugin` 主题标签，方便在社区里被发现；
- 💬 **社区**：加入 DeepSeek Harness 的 [Discord 社区](https://discord.gg/Ycq5dCaS4)。

## 许可

MIT License —— 详见 [LICENSE](LICENSE)。仓库只包含插件代码，不含任何壁纸视频文件。

## 贡献者

- **网卡小电视** —— 需求、设计与壁纸素材
- **DeepSeek AI** —— 插件开发与实现
