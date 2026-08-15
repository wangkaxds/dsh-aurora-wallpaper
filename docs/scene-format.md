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

## .tex 纹理容器（Phase 1 完成，已与 RePKG 逐像素交叉验证）

### TEXI 头部（`TEXV0005\0` + `TEXI0001\0` 之后）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| format | uint32 | 纹理格式枚举（见下） |
| flags | uint32 | 1=NoInterpolation, 2=ClampUVs, 4=IsGif, 32=Video, 524288=AlphaChannelPriority |
| textureWidth / textureHeight | uint32 | 名义尺寸 |
| width / height | uint32 | 实际输出尺寸（mip0 可能更大，见裁剪） |
| ignored | uint32 | 实测 0xFF000000（编辑器用途，忽略） |

### TEXB 容器（`TEXB0001~0004\0` + uint32 imageCount）

- `TEXB0003`：+ uint32 freeImageFormat（FIF 枚举，-1=无）；`TEXB0004`：+ fif + uint32 isMp4，**fif≠MP4 时降级为 0003 布局**。
- 每 image：uint32 mipCount，然后逐 mip：
  - `TEXB0004`（真 MP4）：param1(=1) + param2(=2) + null 结尾 JSON + param3(=1)；
  - 通用（0002/0003/0004）：width, height, compression(1=LZ4), uncompressedSize, compressedSize, data；
  - `TEXB0001`：width, height, compressedSize, data。
- **视频纹理**（flags&32 或 fif=MP4）：compressedSize 字段不可信，载荷 = mip 记录之后的全部剩余字节（mp4）。
- **尺寸裁剪**：mip0 尺寸可能是 4 对齐的填充值（如 3840×2176），最终图像裁剪到 TEXI 的 width×height。

### 纹理格式枚举

| 值 | 格式 | 值 | 格式 |
| --- | --- | --- | --- |
| 0 | ARGB8888（实际为 RGBA 字节序） | 9 | R8 |
| 1 | RGB888 | 10/11/14/15 | 16f 浮点格式（未实现） |
| 2 | RGB565 | 12 | BC7（未实现） |
| 4 | DXT5 | 13 | RGBa1010102（未实现） |
| 6 | DXT3 | 8 | RG88 |
| 7 | DXT1 | | |

### 关键语义（与 RePKG/ImageSharp 逐像素对齐）

- DXT 解码 = LibSquish 整数算法：565 位复制展开、整数插值、DXT3/5 颜色索引字节在块内 12-15、DXT5 alpha 索引 6 字节（两组 24 位）。
- RG88 → PNG 时灰度=第二通道(G)、alpha=第一通道(R)。
- fif=13 时 mip 载荷为 PNG、fif=2 为 JPEG（原样直通）。
- 压缩 = LZ4 块格式（已实现纯 JS 解压，`lz4Decompress`）。

### 交叉验证结果

6 张场景（PKGV0012/0018/0021/0022/0023）全部 .tex 解码与 RePKG 输出**逐像素零差异**（maxDiff=0），覆盖 ARGB8888/LZ4、RG88、DXT5、PNG/JPEG 直通、视频 mp4。DXT1/DXT3/BC7 尚无本地语料覆盖。

## 待办（Phase 2）

- 场景对象模型（scene.json → 对象/材质/效果/属性曲线）；
- WebGL2 渲染骨架与 2D 图层管线。
