// 截图工具：加载指定 workshop 场景 pkg，渲染指定时刻并截屏
// node cli/shot.mjs <workshopId> <time> [out.png]
import { writeFile } from 'node:fs/promises'
const PKG = process.argv[2] || '2423807815'
const TIME = Number(process.argv[3] || 0)
const OUT = process.argv[4] || process.argv[2] + '-t' + process.argv[3] + '.png'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const targets = await (await fetch('http://127.0.0.1:9222/json')).json()
const page = targets.find((t) => t.type === 'page')
if (!page) throw new Error('无 page 目标（无头 Edge 9222 未运行）')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws fail')) })
let id = 0
const pending = new Map()
const logs = []
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
  } else if (m.method === 'Runtime.exceptionThrown') {
    logs.push('EXC: ' + (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text))
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
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false })
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
console.log('状态:', st)
if (!st.includes('已加载')) {
  console.log(logs.join('\n'))
  process.exit(1)
}
// 用固定时刻渲染并截屏（冻结 RAF 循环，避免截图被插队的新帧覆盖）
await ev(`(() => {
  const cv = document.getElementById('cv')
  cv.width = 1920
  cv.height = 1080
  window.__weFreeze = true
  const r = window.__weScene.renderer
  const scene = window.__weScene.getScene()
  const tex = window.__weScene.getTextures()
  return r.render(scene, tex, 1920, 1080, ${TIME}).then(function () { return 'rendered t=${TIME}' })
})()`)
await sleep(800)
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: 1920, height: 1080, scale: 1 } })
await writeFile(OUT, Buffer.from(shot.data, 'base64'))
console.log('已保存:', OUT)
if (logs.length) console.log(logs.join('\n'))
ws.close()
process.exit(0)
