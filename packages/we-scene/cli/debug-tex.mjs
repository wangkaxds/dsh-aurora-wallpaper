// 调试：打印 .tex 解析结果
import { readFileSync } from 'node:fs'
import { parseTex } from '../src/pkg/texture.js'

for (const f of process.argv.slice(2)) {
  const name = f.split(/[\\/]/).pop()
  try {
    const tex = parseTex(readFileSync(f))
    const m0 = tex.images[0] && tex.images[0][0]
    console.log(name + ' | container=' + tex.containerMagic.trim() + ' fmt=' + tex.formatName +
      ' fif=' + tex.freeImageFormat + ' flags=' + tex.flags +
      ' texWH=' + tex.textureWidth + 'x' + tex.textureHeight +
      ' WH=' + tex.width + 'x' + tex.height +
      ' images=' + tex.images.length + ' mips0=' + (tex.images[0] ? tex.images[0].length : '?') +
      (m0 ? (' mip0=' + m0.width + 'x' + m0.height + ' comp=' + m0.compression + ' dataLen=' + m0.data.length) : ''))
  } catch (e) {
    console.log(name + ' ERROR ' + String(e && e.message || e))
  }
}
