// PNG 解码（仅 Node，用于 CLI 验证；浏览器端后续换 DecompressionStream）
import { inflateSync } from 'node:zlib'

export function decodePng(buf) {
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) {
    throw new Error('不是 PNG 数据')
  }
  let p = 8
  const idat = []
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  while (p < buf.length) {
    const len = buf.readUInt32BE(p)
    p += 4
    const type = buf.toString('latin1', p, p + 4)
    p += 4
    const data = buf.subarray(p, p + len)
    p += len + 4
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
  }
  if (bitDepth !== 8) throw new Error('PNG 位深 ' + bitDepth + ' 暂不支持')
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType]
  if (channels === undefined) throw new Error('PNG 颜色类型 ' + colorType + ' 暂不支持')
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const out = new Uint8Array(width * height * 4)
  let prev = new Uint8Array(stride)
  let cur = new Uint8Array(stride)
  let pos = 0
  for (let y = 0; y < height; y++) {
    const f = raw[pos++]
    cur.set(raw.subarray(pos, pos + stride))
    pos += stride
    switch (f) {
      case 1:
        for (let i = channels; i < stride; i++) cur[i] = (cur[i] + cur[i - channels]) & 255
        break
      case 2:
        for (let i = 0; i < stride; i++) cur[i] = (cur[i] + prev[i]) & 255
        break
      case 3:
        for (let i = 0; i < stride; i++) {
          const l = i >= channels ? cur[i - channels] : 0
          cur[i] = (cur[i] + ((l + prev[i]) >> 1)) & 255
        }
        break
      case 4:
        for (let i = 0; i < stride; i++) {
          const a = i >= channels ? cur[i - channels] : 0
          const b = prev[i]
          const c = i >= channels ? prev[i - channels] : 0
          cur[i] = (cur[i] + paeth(a, b, c)) & 255
        }
        break
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4
      if (colorType === 6) {
        out[o] = cur[x * 4]
        out[o + 1] = cur[x * 4 + 1]
        out[o + 2] = cur[x * 4 + 2]
        out[o + 3] = cur[x * 4 + 3]
      } else if (colorType === 2) {
        out[o] = cur[x * 3]
        out[o + 1] = cur[x * 3 + 1]
        out[o + 2] = cur[x * 3 + 2]
        out[o + 3] = 255
      } else if (colorType === 0) {
        out[o] = cur[x]
        out[o + 1] = cur[x]
        out[o + 2] = cur[x]
        out[o + 3] = 255
      } else {
        const g = cur[x * 2]
        out[o] = g
        out[o + 1] = g
        out[o + 2] = g
        out[o + 3] = cur[x * 2 + 1]
      }
    }
    const t = prev
    prev = cur
    cur = t
  }
  return { width, height, rgba: out }
}

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}
