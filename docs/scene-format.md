# scene.pkg 容器格式笔记（Phase 0 取证）

> 实测样本：本机工坊 6 张场景（PKGV0012 / 0018 / 0021 / 0022 / 0023，2026 年获取）。
> 结论与 [RePKG](https://github.com/notscuffed/repkg)、[linux-wallpaperengine](https://github.com/Almamu/linux-wallpaperengine) 的解析一致。

## 头部（16 字节起步）

| 偏移 | 类型 | 内容 |
| --- | --- | --- |
| 0 | uint32 LE | 魔数字符串长度（实测恒为 8） |
| 4 | n 字节 | 魔数 `PKGVxxxx`（xxxx 为十进制版本号：0012/0018/0021/0022/0023） |
| 4+n | uint32 LE | 入口数量 |

## 入口表

每个入口：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| nameLen | uint32 LE | 名称字节数（无终止符） |
| name | nameLen 字节 | 相对路径，如 `scene.json`、`shaders/effects/waterflow.vert` |
| offset | uint32 LE | 数据偏移，**相对 dataStart**（入口表结束处） |
| size | uint32 LE | 数据长度 |

- dataStart = 入口表结束位置；入口数据 = `dataStart + offset`，长 `size`。
- 首个入口 offset 恒为 0，数据紧密排列：`entry[i+1].offset == entry[i].offset + entry[i].size`。
- 全部入口解析后 `dataStart + max(offset+size) <= 文件大小`，实测恰好贴边。

## 数据块内容（已确认）

| 入口 | 格式 | 备注 |
| --- | --- | --- |
| `scene.json` | 纯 JSON | 场景主文件：camera / general / objects / materials / textures… |
| `shaders/effects/*.vert/.frag` | **纯文本着色器** | 重大利好：不是编译产物！GLSL 方言（含 `mul()`、`#if MASK` 组合宏），可直接转译 WebGL |
| `effects/*/effect.json` | JSON | 效果定义（version/replacementkey/name/group/preview…） |
| `materials/*.json` | JSON | 材质定义（passes/shader/textures/blending/depthtest…） |
| `materials/**/*.tex` | TEXV 容器 | 纹理（自有格式，待取证，见 Phase 1） |
| `models/*.json` | JSON | 3D 模型（顶点数据以 JSON 存储） |
| `particles/presets/*.json` | JSON | 粒子预设（animationmode/controlpoint…） |
| `sounds/*.mp3` 等 | 常规媒体 | 音频 |

## 待办（Phase 1）

- `materials/**/*.tex` 容器取证（预计 `TEXVxxxx` 魔数 + mipmap + DXT/BCn 压缩）；
- 与 RePKG 输出逐像素交叉验证；
- PKGV 旧版本（<0012）入口表差异确认（遇到再做）。
