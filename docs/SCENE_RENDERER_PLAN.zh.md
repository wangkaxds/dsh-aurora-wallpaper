# 场景壁纸浏览器渲染器（Route C）—— 详细参考计划

> 目标：在浏览器里直接渲染 Wallpaper Engine 的 `scene.pkg` 场景壁纸，让场景壁纸像视频一样显示在 DeepSeek Harness 页面背景上。
> 如果做成，这将是社区第一个 Web 版场景渲染器，也是本项目最大的开源招牌。

---

## 1. 调研结论：为什么可行、难在哪

### 1.1 可行：格式已经被社区逆向过了

`scene.pkg` 不是黑盒。以下项目提供了完整的参考实现，我们的工作本质是"翻译"而不是"从零逆向"：

| 项目 | 平台/语言 | 对我们的价值 |
|---|---|---|
| [notscuffed/repkg](https://github.com/notscuffed/repkg) | C++ 命令行 | `scene.pkg` 资源提取器（纹理/模型/音频），容器格式解析的直接参考 |
| [Almamu/linux-wallpaperengine](https://github.com/Almamu/linux-wallpaperengine) | C++ / Linux | 最完整的场景渲染重实现；[DeepWiki 上有系统架构文档](https://deepwiki.com/Almamu/linux-wallpaperengine)（渲染系统、对象系统、[场景壁纸](https://deepwiki.com/Almamu/linux-wallpaperengine/4.1-scene-wallpapers)、[对象与解析](https://deepwiki.com/Almamu/linux-wallpaperengine/6.1-object-system)、[项目与壁纸数据](https://deepwiki.com/Almamu/linux-wallpaperengine/6.4-projects-and-wallpaper-data)） |
| [catsout/wallpaper-engine-kde-plugin](https://github.com/catsout/wallpaper-engine-kde-plugin) | QML + GLSL / KDE | 从零手写 GLSL 实现效果库——和 WebGL 血缘最近的移植源 |
| [laobamac/MirageWallpaper](https://github.com/laobamac/MirageWallpaper) | macOS | 原生引擎，scene 渲染思路参考 |
| [Unayung/wallpaper-engine-mac](https://github.com/Unayung/wallpaper-engine-mac) | macOS | 场景渲染补丁，性质在 Phase 0 进一步确认 |
| 官方 [SceneScript 参考文档](https://docs.wallpaperengine.io/en/scene/scenescript/reference.html) | 文档 | 属性/内置函数语义的官方定义 |

### 1.2 难点（决定兼容上限）

| 难点 | 说明 | 应对 |
|---|---|---|
| 着色器是编译产物 | pkg 里没有可读的 GLSL 源码 | 参照 KDE 插件 / linux-wallpaperengine **重写**等价着色器，而不是读取 |
| SceneScript 被编译成原生 DLL | 脚本逻辑（鼠标交互、动态行为）无法直接执行 | 明确降级：Phase 5 评估，大概率只做内置函数子集或干脆不支持 |
| 效果库数量大 | 官方编辑器效果有几十种 | 用你手头 6 张场景做统计，按实际使用频率排序实现（见 Phase 3） |
| 纹理是自定义压缩格式 | 需在 JS 里解码 | RePKG 已验证可行，JS 版解码器照抄算法 |
| 属性系统是曲线驱动的 | 缩放/颜色/透明度等几乎都是关键帧曲线 | 曲线求值器是 Phase 2 的隐藏核心，工时别低估 |

**一句话结论**：静态与循环动画类 2D 场景可以做到高保真；复杂 3D 与重交互场景打折。

### 1.3 兼容性分级（预期）

| 等级 | 特征 | 预期 |
|---|---|---|
| S | 纯 2D 图层 + 常见效果，循环动画 | 完整渲染，接近原生 |
| A | 2D + 粒子/音频 | 视觉完整；音频后置处理 |
| B | 简单 3D（模型 + 基础材质） | 部分渲染 |
| C | 重交互 SceneScript / 复杂 3D | 长期目标或明确不支持 |

---

## 2. 测试语料

你工坊目录里现有的 6 张场景就是最好的语料，Phase 0 先用它们取证：

| 工坊 ID | 标题 | 初始判断 | 目标等级 |
|---|---|---|---|
| 2423807815 | Chainsaw Man Reze Manga Scroll | 2D 卷轴类 | S |
| 2884796594 | Makima (Chainsaw Man) | 待确认 | S/A |
| 3416436251 | 战双帕弥什·露西亚 | 待确认 | A |
| 3528233059 | cimoc 爱莉希雅 | 待确认 | S/A |
| 3591326656 | WALLHACK - Sora AWAKENING | 疑似 3D | B |
| 3624053922 | Reze \| Chainsaw Man | 2D 类 | S |

> 语料库只存在于本机，**绝不把壁纸资源提交进仓库**（版权原因，见 §8）。

---

## 3. 仓库结构规划

保持本项目零依赖、纯 JS 的风格，新代码全部放 `packages/we-scene/`：

```
packages/we-scene/
├── src/
│   ├── pkg/
│   │   ├── container.js      # scene.pkg 二进制容器解析（DataView 手写）
│   │   ├── texture.js        # 纹理解码：DXT/BCn → RGBA
│   │   └── model.js          # .obj 等模型提取
│   ├── scene/
│   │   ├── parse.js          # scene.json → 对象模型
│   │   ├── properties.js     # 属性曲线/关键帧求值器
│   │   └── schema.js         # 对象/效果/材质类型登记表
│   ├── render/
│   │   ├── renderer.js       # WebGL2 引擎骨架（全屏 quad、上传、绘制循环）
│   │   ├── camera.js         # 摄像机（scene.json 定义）
│   │   ├── layers2d.js       # 2D 图层变换（origin/angles/scale）
│   │   ├── model3d.js        # 3D 模型渲染（Phase 4）
│   │   ├── particles.js      # 粒子发射器（Phase 4）
│   │   └── effects/          # 效果库：一个效果 = 一个模块 + 一段 GLSL
│   │       ├── scroll.js  parallax.js  blur.js  color.js
│   │       ├── contrast.js  distort.js  waves.js  waterflow.js
│   │       └── ...
│   └── worker/
│       └── parse-worker.js   # 后台线程解析大 pkg，避免卡 UI
├── cli/
│   └── extract.mjs           # node cli/extract.mjs <scene.pkg> <输出目录>
├── demo/
│   └── index.html            # 拖入 scene.pkg 直接渲染（GitHub Pages 演示站）
└── test/
    ├── fixtures/             # Phase 0 提取的黄金数据（JSON 描述，不含资源本体）
    └── golden.test.js        # 回归测试
```

要点：
- **零构建零依赖**：ES Modules + 原生 WebGL2，演示页双击即开；
- 解析器与渲染器分层，`pkg/` + `scene/` 将来可以独立发布成 npm 包 `we-scene-parser`；
- 渲染在 Worker 外的主线程做（WebGL 上下文），解析在 Worker 里做。

---

## 4. 分阶段计划

### Phase 0 · 取证（1–2 天）

目标：把 6 张场景拆开看，产出黄金数据。

1. 用 RePKG 提取全部 6 张场景 → `scene.json`、纹理 PNG、模型、音频；
2. 用十六进制对比 `scene.pkg` 头部/入口表，整理容器格式笔记 → 写入 `docs/scene-format.md`；
3. 记录每张场景用了哪些效果、哪些属性曲线（供 Phase 3 排优先级）；
4. 确认 [Unayung/wallpaper-engine-mac](https://github.com/Unayung/wallpaper-engine-mac) 等项目的性质，补充参考清单。

**产出**：黄金数据 + 格式笔记 + 效果使用统计。
**退出标准**：人工能讲清楚容器头部、入口表、JSON 块、纹理块的排布规律。

### Phase 1 · JS 解析器（3–7 天）

目标：在浏览器/Node 里完成资源提取。

1. `container.js`：pkg 容器解析（版本号、入口表、数据块）；
2. `texture.js`：纹理解码（参照 RePKG 算法，输出 RGBA）；
3. `model.js`：模型提取；
4. `cli/extract.mjs`：命令行提取器；
5. **交叉验证**：与 RePKG 的输出逐像素对比，发现差异即修复。

**产出**：`we-scene` 解析器 + 提取 CLI。
**退出标准**：6/6 场景提取成功，纹理与 RePKG 输出逐像素一致。

### Phase 2 · 对象模型 + 最小渲染（1–2 周）

目标：第一帧静态画面。

1. `parse.js`：scene.json → 对象模型（图层/相机/材质/效果/粒子实例）；
2. `properties.js`：属性曲线求值器（**本阶段隐藏核心，工时大头**）；
3. `renderer.js`：WebGL2 骨架（全屏 quad、纹理上传、绘制循环）；
4. `layers2d.js`：2D 图层变换（origin/angles/scale）与摄像机；
5. 第一个可看产物：蕾塞漫画卷轴静态帧正确渲染。

**产出**：能渲染任意 2D 场景第一帧的引擎。
**退出标准**：静态 2D 场景渲染正确；**止损评估点**（见 §8）。

### Phase 3 · 2D 效果库（2–4 周）

目标：场景"动起来且像样"。

1. 按 Phase 0 的效果使用统计排序，先实现语料里真实用到的效果；
2. 移植源：KDE 插件 GLSL + linux-wallpaperengine 着色器源码；
3. 典型清单（按优先级）：scroll/parallax、blur、color、contrast、distort、waves、waterflow、shake、vignette、chromakey、flip、glitch……以语料统计为准；
4. 每实现一个效果就写一个 demo 用例（golden 截图回归）。

**产出**：覆盖 6 张场景常用效果的 2D 渲染器。
**退出标准**：≥3 张场景在浏览器里动画效果达标（人工对照 WE 同参数截图）。

### Phase 4 · 3D 基础 + 粒子（2–4 周）

目标：把 B 级场景拿下。

1. `model3d.js`：.obj 模型加载 + 基础 3D 材质子集；
2. `particles.js`：粒子发射器（位置/速度/颜色曲线）；
3. 3D 摄像机与深度测试；
4. 用 WALLHACK - Sora AWAKENING 验收，做不到就如实降级并写进兼容表。

**产出**：简单 3D 与粒子支持。
**退出标准**：Sora 场景能渲染出可识别画面，或明确写入兼容性等级表。

### Phase 5 · SceneScript（可选，最难）

目标：评估交互脚本的可行性。

- 现状：pkg 里只有编译后的原生 DLL，社区（linux-wallpaperengine、KDE 插件）也只实现了内置函数子集；
- 决策树：实现内置函数子集解释器 / 明确不支持用户脚本 / 声明交互缺失；
- 大概率结论：**不支持用户 SceneScript**，在文档与兼容表中如实标注。

**产出**：一份明确的能力边界文档。

### Phase 6 · 集成回 aurora-wallpaper

目标：Harness 页面背景真的跑起来。

1. host 半新增路由暴露 scene.pkg（受会话沙箱约束，只暴露已授权目录）；
2. 客户端固定 canvas 层（复用 `#aurora-bg` 同款机制：`position:fixed; inset:0; z-index:-1`）；
3. Worker 解析 → 主线程 WebGL 渲染 → 织入现有主题遮罩与渐暗；
4. 设置页场景条目走 WebGL 渲染，视频/图片条目行为不变；低配机器自动降级回 `preview.gif`。

**产出**：v1.0 —— 场景壁纸像视频一样显示在页面背景。

---

## 5. 验证方法

| 方法 | 用途 |
|---|---|
| 黄金文件测试 | Phase 0 的提取产物入库，CI 回归解析器 |
| 逐帧对照 | 渲染器截图 vs Wallpaper Engine 同参数截图（人工 + Pixelmatch） |
| 性能预算 | 后台 canvas 常驻渲染需低于 30% GPU 占用；超预算自动降级 preview.gif |
| 兼容性众包 | 演示站收集社区报告（pkg 哈希 → 等级），形成公开兼容表 |

## 6. 工时汇总

| 阶段 | 预估 |
|---|---|
| Phase 0–1（取证 + 解析器） | 约 1–1.5 周 |
| Phase 2（对象模型 + 最小渲染） | 1–2 周 |
| Phase 3（2D 效果库） | 2–4 周 |
| Phase 4（3D + 粒子） | 2–4 周 |
| **合计** | **约 1.5–3 个月**（业余节奏翻倍） |

## 7. 开源与社区策略

1. **解析器独立成包**：`we-scene-parser` 发布 npm，作为独立小工具也有用户（批量提取纹理/预览）；
2. **GitHub Pages 演示站**：拖入 scene.pkg → 页面直接渲染。零服务端、客户端解析，**不打包任何壁纸资源**，规避版权风险；
3. **兼容性表**：由演示站用户众包（pkg 哈希 → 渲染等级），成为社区事实标准；
4. **里程碑版本**：
   - `v0.2` 解析器可用（Phase 1 完成）
   - `v0.3` 2D 场景可渲染（Phase 3 完成）
   - `v0.4` 3D + 粒子（Phase 4 完成）
   - `v1.0` 集成回 Harness（Phase 6 完成）
5. **LICENSE**：延续 MIT。只重实现格式解析与渲染，不分发、不打包任何壁纸资源。

## 8. 风险与止损

| 风险 | 概率 | 应对 |
|---|---|---|
| 属性曲线系统复杂度超预期 | 高 | Phase 2 单独设工时大头，不压缩 |
| 3D 场景效果难达预期 | 中 | 明确兼容分级，Sora 场景作为试金石，不行就如实降级 |
| 效果库膨胀拖慢进度 | 高 | 严格按语料统计排序，效果"按需实现"而非"全量移植" |
| 工时膨胀 | 中 | 止损点：**Phase 2 结束时评估**。若核心渲染不可行，保留"预览 GIF + 原生调用"并存方案 |
| 法律/版权 | 低 | 不打包壁纸资源；仅重实现格式；MIT |

**止损后不亏**：即便渲染器停摆，Phase 0–1 的解析器本身就是有价值的独立开源产品。

## 9. 下一步（立即开工项）

1. 在 `packages/we-scene/` 建目录骨架；
2. Phase 0：跑 RePKG 提取 6 张场景，产出黄金数据与格式笔记；
3. 完成后向 README 的兼容表回填第一行真实数据。
