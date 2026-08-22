// build-restored-host.js — 从 pkg-84 原版 host.js 生成恢复版宿主半（加共存垫片）
// 垫片 1：路由注册 try/catch（预设可能已注册同路径，跳过不报错）
// 垫片 2：tapIndex 注入去重（预设已注入时不再重复注入）
// 垫片 3：aurora-list/set/scan 处理器优先转发到已注册的 /dyn/aurora-* 路由（预设的活状态），
//          路由缺失时才退回自身状态
const fs = require('fs')
const path = 'D:/杂活/aurora-wallpaper/src/host.js'
let src = fs.readFileSync(path, 'utf8')

// 垫片 1：所有 webServer.register 改为 safeRegister
const origCount = (src.match(/webServer\.register\(\{/g) || []).length
if (origCount !== 8) throw new Error('expected 8 webServer.register sites, got ' + origCount)
src = src.replace(/disposers\.push\(webServer\.register\(\{/g, 'disposers.push(safeRegister({')

// 垫片 2：tapIndex 注入去重
const tapAnchor = 'webServer.tapIndex((html) => {\n          const body = /<body'
if (!src.includes(tapAnchor)) throw new Error('tapIndex anchor not found')
src = src.replace(tapAnchor, 'webServer.tapIndex((html) => {\n          if (html.indexOf(\'id="aurora-bg"\') !== -1) return html\n          const body = /<body')

// 垫片 3：safeRegister + dispatchRoute 助手（插在 ctx.effect 开头、persist 之前）
const effectAnchor = 'ctx.effect(() => {\n      const disposers = []'
if (!src.includes(effectAnchor)) throw new Error('effect anchor not found')
src = src.replace(effectAnchor, `ctx.effect(() => {
      const disposers = []
      function safeRegister(route) {
        try { return webServer.register(route) } catch (e) { return () => {} }
      }
      function dispatchRoute(url) {
        const ws = ctx.get('webServer')
        if (ws === undefined) return Promise.resolve(null)
        const route = ws.exact.get(url.split('?')[0])
        if (route === undefined || typeof route.handler !== 'function') return Promise.resolve(null)
        return new Promise((resolve) => {
          let captured = null
          let called = false
          const fakeRes = {
            writeHead() { called = true },
            setHeader() {},
            end(data) { called = true; captured = data },
          }
          let ret
          try { ret = route.handler({ url, headers: {} }, fakeRes) } catch (e) { resolve(null); return }
          if (ret && typeof ret.then === 'function') ret.then(() => resolve(called ? captured : null), () => resolve(null))
          else resolve(called ? captured : null)
        })
      }`)

// 垫片 4：aurora-list / aurora-set / aurora-scan 转发优先
const listAnchor = "disposers.push(harness.handle('aurora-list', async () => ({\n        index: current,\n        videos: videos.map((v, i) => ({ n: i, title: v.title, kind: v.kind || 'video', isScene: !!v.isScene })),\n      })))"
if (!src.includes(listAnchor)) throw new Error('aurora-list anchor not found')
src = src.replace(listAnchor, `disposers.push(harness.handle('aurora-list', async () => {
        const raw = await dispatchRoute('/dyn/aurora-list.json')
        if (raw !== null) {
          try {
            const s = JSON.parse(String(raw))
            return { index: typeof s.index === 'number' ? s.index : 0, videos: (s.videos || []).map((v, i) => ({ n: i, title: v.title, kind: v.k || 'video', isScene: !!v.s })) }
          } catch (e) {}
        }
        return { index: current, videos: videos.map((v, i) => ({ n: i, title: v.title, kind: v.kind || 'video', isScene: !!v.isScene })) }
      }))`)

const setAnchor = "disposers.push(harness.handle('aurora-set', async (args) => {\n        const n = ((typeof args.index === 'number' ? args.index : 0) % videos.length + videos.length) % videos.length\n        current = n\n        return { index: n }\n      }))"
if (!src.includes(setAnchor)) throw new Error('aurora-set anchor not found')
src = src.replace(setAnchor, `disposers.push(harness.handle('aurora-set', async (args) => {
        const n = ((typeof args.index === 'number' ? args.index : 0) % videos.length + videos.length) % videos.length
        const raw = await dispatchRoute('/dyn/aurora-set?index=' + n)
        if (raw !== null) {
          try { const s = JSON.parse(String(raw)); if (typeof s.index === 'number') return { index: s.index } } catch (e) {}
        }
        current = n
        return { index: n }
      }))`)

const scanAnchor = "disposers.push(harness.handle('aurora-scan', async (args) => {\n        const before = videos.length"
if (!src.includes(scanAnchor)) throw new Error('aurora-scan anchor not found')
src = src.replace(scanAnchor, `disposers.push(harness.handle('aurora-scan', async (args) => {
        const forwarded = await dispatchRoute('/dyn/aurora-scan')
        if (forwarded !== null) {
          try { return JSON.parse(String(forwarded)) } catch (e) {}
        }
        const before = videos.length`)

const out = 'D:/杂活/aurora-wallpaper/src/restored-host.js'
fs.writeFileSync(out, src, 'utf8')
console.log('OK wrote', out, src.length, 'bytes')
