// DSH Aurora Wallpaper —— 宿主半
// 职责：扫描壁纸引擎目录、提供视频流/列表/状态 HTTP 路由、
//       向页面注入 <video> 背景层与同步脚本、接收设置页的切换 RPC。
//
// 使用前请修改下方 CONFIG。

const CONFIG = {
  // Wallpaper Engine 工坊内容目录（按你的 Steam 库位置修改）
  workshopDir: 'D:\\steam\\steamapps\\workshop\\content\\431960',
  // 插件工作目录（缓存清单；需可写，不可写时仅丢失跨重启记忆）
  vaultDir: 'D:\\aurora-wallpaper',
}

export default {
  apply(ctx) {
    const webServer = ctx.get('webServer')
    const fs = ctx.get('fs')
    const sandboxPolicy = ctx.get('sandboxPolicy')
    if (webServer === undefined || fs === undefined) return
    ctx.effect(() => {
      const disposers = []
      const VAULT = CONFIG.vaultDir
      const MANIFEST = VAULT + '\\manifest.json'
      const WORKSHOP = CONFIG.workshopDir
      let videos = []
      let current = 0
      let cached = null

      async function persist() {
        if (sandboxPolicy === undefined) return false
        try {
          const policy = sandboxPolicy.resolve({})
          const mt = await fs.resolve(MANIFEST)
          await fs.writeText(mt, JSON.stringify({ videos }, null, 2), undefined, undefined, policy)
          return true
        } catch (e) {
          return false
        }
      }

      function serveVideo(v) {
        disposers.push(webServer.register({
          kind: 'exact',
          path: '/dyn/aurora-video/' + v.n + '.mp4',
          handler: async (req, res) => {
            try {
              let bytes
              if (cached !== null && cached.path === v.file) {
                bytes = cached.bytes
              } else {
                const target = await fs.resolve(v.file)
                bytes = await fs.readBytes(target, undefined, 512 * 1024 * 1024)
                cached = { path: v.file, bytes }
              }
              const total = bytes.byteLength
              const range = req.headers.range
              if (typeof range === 'string') {
                const m = /bytes=(\d*)-(\d*)/.exec(range)
                let start = 0
                let end = total - 1
                if (m) {
                  if (m[1] !== '') start = parseInt(m[1], 10)
                  if (m[2] !== '') end = parseInt(m[2], 10)
                }
                if (isNaN(start) || start < 0) start = 0
                if (isNaN(end) || end < 0 || end >= total) end = total - 1
                if (start > end || start >= total) {
                  res.writeHead(416, { 'Content-Range': 'bytes */' + total })
                  res.end()
                  return
                }
                res.writeHead(206, {
                  'Content-Type': 'video/mp4',
                  'Content-Length': String(end - start + 1),
                  'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
                  'Accept-Ranges': 'bytes',
                  'Cache-Control': 'public, max-age=3600',
                })
                res.end(bytes.subarray(start, end + 1))
              } else {
                res.writeHead(200, {
                  'Content-Type': 'video/mp4',
                  'Content-Length': String(total),
                  'Accept-Ranges': 'bytes',
                  'Cache-Control': 'public, max-age=3600',
                })
                res.end(bytes)
              }
            } catch (err) {
              res.writeHead(404)
              res.end()
            }
          },
        }))
      }

      async function readProjectInfo(subPath, subName) {
        try {
          const pt = await fs.resolve(subPath + '\\project.json')
          const raw = await fs.readText(pt)
          const proj = JSON.parse(raw.replace(/^\uFEFF/, ''))
          let title = subName
          if (proj && typeof proj.title === 'string' && proj.title.trim()) title = proj.title.trim()
          let file = null
          if (proj && typeof proj.file === 'string' && proj.file.trim()) file = proj.file.trim()
          return { title, file }
        } catch (e) {
          return { title: subName, file: null }
        }
      }

      async function autoSync(rootPath) {
        const added = []
        const errors = []
        try {
          const t = await fs.resolve(rootPath)
          const subs = await fs.listDir(t, undefined)
          for (const s of subs) {
            const subName = s.name || String(s)
            try {
              const subPath = rootPath + '\\' + subName
              const info = await readProjectInfo(subPath, subName)
              const st = await fs.resolve(subPath)
              const files = await fs.listDir(st, undefined)
              let full = null
              if (info.file) {
                const hit = files.find((f) => f.name === info.file)
                if (hit) full = subPath + '\\' + info.file
              }
              if (!full) {
                const mp4 = files.find((f) => /\.mp4$/i.test(f.name))
                if (mp4) full = subPath + '\\' + mp4.name
              }
              if (!full) continue
              if (videos.some((v) => v.file === full)) continue
              videos.push({ n: 0, file: full, title: info.title })
              added.push(info.title)
            } catch (e2) {
              // 跳过不可读的子目录
            }
          }
        } catch (e) {
          errors.push(rootPath + ': ' + String(e && e.message || e))
        }
        return { added, errors }
      }

      function renumber() {
        videos = videos.map((v, i) => ({ n: i, file: v.file, title: v.title }))
      }

      const boot = (async () => {
        try {
          const mt = await fs.resolve(MANIFEST)
          const manifest = JSON.parse(await fs.readText(mt))
          if (manifest && Array.isArray(manifest.videos) && manifest.videos.length > 0) {
            videos = manifest.videos.map((v) => ({ n: 0, file: v.file, title: v.title }))
          }
        } catch (e) {
          videos = []
        }
        await autoSync(WORKSHOP)
        renumber()
        await persist()
        for (const v of videos) serveVideo(v)

        disposers.push(webServer.register({
          kind: 'exact',
          path: '/dyn/aurora-list.json',
          handler: async (req, res) => {
            try {
              res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
              res.end(JSON.stringify({
                index: current,
                videos: videos.map((v, i) => ({ title: v.title, url: '/dyn/aurora-video/' + i + '.mp4' })),
              }))
            } catch (err) {
              res.writeHead(500)
              res.end()
            }
          },
        }))

        disposers.push(webServer.register({
          kind: 'exact',
          path: '/dyn/aurora-state.json',
          handler: async (req, res) => {
            try {
              res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
              res.end(JSON.stringify({ index: current, total: videos.length }))
            } catch (err) {
              res.writeHead(500)
              res.end()
            }
          },
        }))

        disposers.push(webServer.register({
          kind: 'exact',
          path: '/dyn/aurora-set',
          handler: async (req, res) => {
            try {
              const url = new URL(req.url || '/', 'http://x')
              const raw = url.searchParams.get('index')
              if (raw !== null) {
                const n = parseInt(raw, 10)
                if (!isNaN(n)) current = ((n % videos.length) + videos.length) % videos.length
              }
              res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
              res.end(JSON.stringify({ index: current }))
            } catch (err) {
              res.writeHead(500)
              res.end()
            }
          },
        }))

        disposers.push(webServer.tapIndex((html) => {
          const body = /<body(?:\s[^>]*)?>/i.exec(html)
          if (body === null) return html
          const at = body.index + body[0].length
          const listJs = JSON.stringify(videos.map((v) => [v.title, '/dyn/aurora-video/' + v.n + '.mp4']))
          const injection = '<video id="aurora-bg" autoplay muted loop playsinline></video><style>#aurora-bg{position:fixed;inset:0;width:100%;height:100%;object-fit:cover;z-index:-1;pointer-events:none;transition:opacity .5s;transform:translateZ(0);backface-visibility:hidden;will-change:transform}@media (prefers-reduced-motion:reduce){#aurora-bg{display:none}}</style><script>(function(){var list=' + listJs + ';var v=document.getElementById("aurora-bg");var cur=-1;var saved=parseInt(localStorage.getItem("aurora-index")||"0",10);if(isNaN(saved))saved=0;function show(n){if(!list.length)return;n=((n%list.length)+list.length)%list.length;if(n===cur)return;cur=n;var it=list[n];if(!it)return;v.style.opacity=0;v.src=it.url;localStorage.setItem("aurora-index",String(n))}v.addEventListener("loadeddata",function(){v.style.opacity=1;document.body.classList.add("aurora-live")});v.addEventListener("error",function(){document.body.classList.remove("aurora-live")});fetch("/dyn/aurora-set?index="+saved,{cache:"no-store"}).catch(function(){});function poll(){fetch("/dyn/aurora-list.json",{cache:"no-store"}).then(function(r){return r.json()}).then(function(s){if(s&&Array.isArray(s.videos)&&s.videos.length){list=s.videos;show(typeof s.index==="number"?s.index:0)}}).catch(function(){})}poll();setInterval(poll,3000)})();</scr' + 'ipt>'
          return html.slice(0, at) + injection + html.slice(at)
        }))
      })()

      disposers.push(harness.handle('aurora-get', async () => ({ index: current, total: videos.length })))
      disposers.push(harness.handle('aurora-list', async () => ({
        index: current,
        videos: videos.map((v, i) => ({ n: i, title: v.title })),
      })))
      disposers.push(harness.handle('aurora-set', async (args) => {
        const n = ((typeof args.index === 'number' ? args.index : 0) % videos.length + videos.length) % videos.length
        current = n
        return { index: n }
      }))
      disposers.push(harness.handle('aurora-scan', async (args) => {
        const before = videos.length
        let result
        if (args && typeof args.path === 'string' && args.path) result = await autoSync(args.path)
        else result = await autoSync(WORKSHOP)
        if (videos.length !== before) {
          renumber()
          for (let i = before; i < videos.length; i++) serveVideo(videos[i])
          await persist()
        }
        return result
      }))

      return () => {
        for (const dispose of disposers) dispose()
      }
    })
  },
}
