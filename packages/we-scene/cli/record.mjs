// 录制动画：渲染 N 帧 → 截图序列 → ffmpeg 合成 mp4
// node cli/record.mjs <workshopId> <秒> <fps> [outdir]
import { writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
const PKG = process.argv[2] || '2423807815'
const SECONDS = Number(process.argv[3] || 6)
const FPS = Number(process.argv[4] || 12)
const OUTDIR = process.argv[5] || 'D:/杂活/we-scene-out/rec-' + PKG
const NOARM = process.argv[6] === 'noarm' // 对照版：清空 'reze full arm' 层的效果
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

await mkdir(OUTDIR, { recursive: true })
const targets = await (await fetch('http://127.0.0.1:9222/json')).json()
const page = targets.find((t) => t.type === 'page')
if (!page) throw new Error('无 page 目标')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws fail')) })
let id = 0
const pending = new Map()
function send(method, params = {}) {
  return new Promise((res, rej) => {
    const i = ++id
    pending.set(i, { res, rej })
    ws.send(JSON.stringify({ id: i, method, params }))
  })
}
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id)
    pending.delete(m.id)
    m.error ? p.rej(new Error(m.error.message)) : p.res(m.result)
  }
}
async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.result && r.result.subtype === 'error') throw new Error(r.result.description)
  return r.result && r.result.value
}
await send('Runtime.enable')
await send('Page.enable')
await send('DOM.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: 'http://localhost:8123/demo/' })
await sleep(2500)
const { root } = await send('DOM.getDocument')
const q = await send('DOM.querySelector', { nodeId: root.nodeId, selector: '#pkg' })
await send('DOM.setFileInputFiles', { nodeId: q.nodeId, files: ['D:\\steam\\steamapps\\workshop\\content\\431960\\' + PKG + '\\scene.pkg'] })
for (let i = 0; i < 90; i++) {
  await sleep(1000)
  const s = await ev('document.getElementById("status").textContent')
  if (s.includes('已加载') || s.includes('失败') || s.includes('❌')) break
}
const st = await ev('document.getElementById("status").textContent')
if (!st.includes('已加载')) throw new Error('场景加载失败: ' + st)

// 用 960x540 视口渲染（canvas 尺寸同步缩小）
await ev(`(() => {
  const cv = document.getElementById('cv')
  cv.width = 960
  cv.height = 540
  window.__weFreeze = true // 停掉 RAF 循环，帧完全由本脚本控制（避免截图被 RAF 插队渲染新帧）
  return 'ok'
})()`)
const N = Math.round(SECONDS * FPS)
console.log('录制 ' + N + ' 帧 @' + FPS + 'fps…')
for (let k = 0; k < N; k++) {
  const t = k / FPS
  await ev(`(() => {
    const r = window.__weScene.renderer
    const scene = window.__weScene.getScene()
    const tex = window.__weScene.getTextures()
    const layers = ${NOARM ? "scene.layers.map((l) => (l.name === 'reze full arm' ? { ...l, effects: [] } : l))" : 'scene.layers'}
    return r.render({ ...scene, layers }, tex, 960, 540, ${t}).then(function () { return 'ok' })
  })()`)
  // 全屏 + 右侧人物裁剪（场景 1920x1080 中 x∈[1155,1915] → 960 视口 x∈[578,958]）
  const full = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: 960, height: 540, scale: 1 } })
  await writeFile(OUTDIR + '/fA-' + String(k).padStart(3, '0') + '.png', Buffer.from(full.data, 'base64'))
  const crop = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 578, y: 0, width: 380, height: 540, scale: 1 } })
  await writeFile(OUTDIR + '/fB-' + String(k).padStart(3, '0') + '.png', Buffer.from(crop.data, 'base64'))
  if (k % 12 === 0) process.stdout.write('.')
}
console.log(' 截图完成')
ws.close()

// ffmpeg 合成
const ff = (spawnSync('powershell', ['-NoProfile', '-Command', "(Get-ChildItem 'C:\\Users\\wkxds\\AppData\\Local\\Microsoft\\WinGet\\Packages' -Recurse -Filter ffmpeg.exe | Select-Object -First 1).FullName"], { encoding: 'utf8' }).stdout || '').trim()
if (!ff) {
  console.log('未找到 ffmpeg，仅保留 PNG 序列: ' + OUTDIR)
  process.exit(0)
}
for (const [tag, name] of [['fA', 'full'], ['fB', 'crop-arm']]) {
  const r = spawnSync(ff, ['-hide_banner', '-y', '-framerate', String(FPS), '-i', OUTDIR + '/' + tag + '-%03d.png', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', OUTDIR + '/' + name + '.mp4'], { encoding: 'utf8' })
  if (r.status !== 0) console.log('ffmpeg ' + name + ' 失败: ' + (r.stderr || '').slice(-200))
}
console.log('输出: ' + OUTDIR + '/full.mp4（全屏）')
console.log('输出: ' + OUTDIR + '/crop-arm.mp4（右侧人物区域）')
process.exit(0)
