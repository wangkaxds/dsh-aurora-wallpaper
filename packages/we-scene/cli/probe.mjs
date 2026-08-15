// 取证工具：hexdump scene.pkg 头部，寻找容器魔数与 JSON 入口表。
// 用法: node cli/probe.mjs [pkg路径...]
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

const ROOT = 'D:\\steam\\steamapps\\workshop\\content\\431960'
const FOLDERS = ['2423807815', '2884796594', '3416436251', '3528233059', '3591326656', '3624053922']

const targets = process.argv.slice(2)
const paths = targets.length
  ? targets
  : FOLDERS.map((f) => ROOT + '\\' + f + '\\scene.pkg')

function hexdump(buf, start = 0, len = 128) {
  const lines = []
  const end = Math.min(buf.length, start + len)
  for (let o = start; o < end; o += 16) {
    const chunk = buf.subarray(o, Math.min(o + 16, end))
    const hex = [...chunk].map((b) => b.toString(16).padStart(2, '0')).join(' ')
    const ascii = [...chunk].map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('')
    lines.push(o.toString(16).padStart(8, '0') + '  ' + hex.padEnd(47) + '  ' + ascii)
  }
  return lines.join('\n')
}

function printable(buf, pos, len = 200) {
  return [...buf.subarray(pos, pos + len)].map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '·')).join('')
}

function findAscii(buf, needle) {
  const out = []
  const n = Buffer.from(needle)
  for (let i = 0; i <= buf.length - n.length; i++) {
    if (buf.subarray(i, i + n.length).equals(n)) out.push(i)
  }
  return out
}

for (const p of paths) {
  let buf
  try {
    buf = readFileSync(p)
  } catch (e) {
    console.log('!! 无法读取', p, String(e.message || e))
    continue
  }
  console.log('\n========== ' + basename(p) + '  (' + p + ')  ' + buf.length + ' bytes ==========')
  console.log(hexdump(buf, 0, 128))
  console.log('--- ASCII "PKG" 出现位置:', findAscii(buf, 'PKG').slice(0, 20).join(', '))
  const hits = []
  for (let i = 0; i < Math.min(buf.length, 16384); i++) {
    if (buf[i] === 0x7b) hits.push(i)
  }
  console.log('--- 前 16384 字节内 "{" 出现位置:', hits.slice(0, 16).join(', '))
  for (const h of hits.slice(0, 4)) {
    console.log('--- 0x' + h.toString(16) + ' 上下文: ' + printable(buf, h, 200))
  }
}
