// 构建浏览器渲染器 ES 模块包：拼接仓库源码文件为单一模块（host 路由 / 演示服务器共用）
// 依赖的源文件全部为纯 JS（无 node:zlib 等浏览器不兼容依赖）
const LIB_FILES = [
  'src/pkg/container.js',
  'src/pkg/texture.js',
  'src/scene/parse.js',
  'src/scene/effects-parse.js',
  'src/render/math.js',
  'src/render/noise.js',
  'src/render/hlsl2glsl.js',
  'src/render/effects.js',
  'src/render/renderer.js',
]

// readFile: (path) => Buffer | Uint8Array；root: 仓库根目录
export function buildLibBundle(readFile, root) {
  const parts = [
    '// we-scene 浏览器渲染器打包模块（自动拼接，勿手改）',
    '// 拼接时剥离跨文件 import（引用改走同一模块作用域），保留 export 供 import * as 使用',
  ]
  for (const rel of LIB_FILES) {
    const src = readFile(root + '/' + rel).toString('utf8')
    const stripped = src.split('\n')
      .filter((line) => !/^\s*import\s+.*\bfrom\s+['"][^'"]+['"]\s*;?\s*$/.test(line))
      .join('\n')
    parts.push('// ===== ' + rel + ' =====')
    parts.push(stripped)
  }
  return parts.join('\n')
}
