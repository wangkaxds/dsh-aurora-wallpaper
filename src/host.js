// DSH Aurora Wallpaper —— 宿主半
// 职责：扫描壁纸引擎目录（视频/场景均支持）、提供视频流/列表/状态/切换 HTTP 路由、
//       提供场景渲染器打包模块与场景包路由、向页面注入背景层（视频 + WebGL 场景）与同步脚本。
//
// 使用前请修改下方 CONFIG。

const CONFIG = {
  // Wallpaper Engine 工坊内容目录（按你的 Steam 库位置修改）
  workshopDir: 'D:\\steam\\steamapps\\workshop\\content\\431960',
  // 插件工作目录（缓存清单；需可写，不可写时仅丢失跨重启记忆）
  vaultDir: 'D:\\aurora-wallpaper',
  // we-scene 渲染器源码目录（用于打包 /dyn/aurora-lib.js，浏览器场景渲染）
  weSceneSrc: 'D:\\杂活\\aurora-wallpaper\\packages\\we-scene\\src',
  // Wallpaper Engine 安装目录（读取自带 util/noise 噪声纹理；不存在则回退合成噪声）
  weNoisePng: 'D:\\steam\\steamapps\\common\\wallpaper_engine\\assets\\materials\\util\\noise.png',
  // 官方 util/noise.tex（带 mip 链：sway 等效果靠 LINEAR_MIPMAP_LINEAR 平滑位移场）
  weNoiseTex: 'D:\\steam\\steamapps\\common\\wallpaper_engine\\assets\\materials\\util\\noise.tex',
  // Wallpaper Engine 安装目录的 shader 目录（效果 shader 与公共头文件；运行时读取，不分发）
  weShaderDir: 'D:\\steam\\steamapps\\common\\wallpaper_engine\\assets\\shaders',
}

// kind → 媒体类型
const MIME = {
  video: 'video/mp4',
  gif: 'image/gif',
  image: 'image/jpeg',
  webp: 'image/webp',
}

const LIB_FILES = [
  'pkg\\container.js',
  'pkg\\texture.js',
  'scene\\parse.js',
  'scene\\effects-parse.js',
  'render\\math.js',
  'render\\noise.js',
  'render\\hlsl2glsl.js',
  'render\\effects.js',
  'render\\renderer.js',
]

function kindOf(fileName) {
  if (/\.mp4$/i.test(fileName)) return 'video'
  if (/\.gif$/i.test(fileName)) return 'gif'
  if (/\.webp$/i.test(fileName)) return 'webp'
  if (/\.(jpe?g|png)$/i.test(fileName)) return 'image'
  return null
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
      let libSource = ''

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
              const mime = MIME[v.kind] || 'application/octet-stream'
              const range = v.kind === 'video' ? req.headers.range : undefined
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
                  'Content-Type': mime,
                  'Content-Length': String(end - start + 1),
                  'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
                  'Accept-Ranges': 'bytes',
                  'Cache-Control': 'public, max-age=3600',
                })
                res.end(bytes.subarray(start, end + 1))
              } else {
                res.writeHead(200, {
                  'Content-Type': mime,
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

      // 场景包路由：/dyn/aurora-scene/<n>.pkg → 对应工坊文件夹的 scene.pkg
      function serveScenePkg(v) {
        if (!v.isScene) return
        const pkgPath = WORKSHOP + '\\' + v.folder + '\\scene.pkg'
        disposers.push(webServer.register({
          kind: 'exact',
          path: '/dyn/aurora-scene/' + v.n + '.pkg',
          handler: async (req, res) => {
            try {
              const target = await fs.resolve(pkgPath)
              const bytes = await fs.readBytes(target, undefined, 256 * 1024 * 1024)
              res.writeHead(200, {
                'Content-Type': 'application/octet-stream',
                'Content-Length': String(bytes.byteLength),
                'Cache-Control': 'no-store',
              })
              res.end(bytes)
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
          let type = 'video'
          if (proj && typeof proj.type === 'string') type = proj.type.toLowerCase()
          return { title, file, type }
        } catch (e) {
          return { title: subName, file: null, type: 'video' }
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
              let kind = null
              if (info.file) {
                const hit = files.find((f) => f.name === info.file)
                const k = hit ? kindOf(hit.name) : null
                if (hit && k) { full = subPath + '\\' + info.file; kind = k }
              }
              if (!full) {
                const mp4 = files.find((f) => kindOf(f.name) === 'video')
                if (mp4) { full = subPath + '\\' + mp4.name; kind = 'video' }
              }
              if (!full) {
                const gif = files.find((f) => kindOf(f.name) === 'gif')
                if (gif) { full = subPath + '\\' + gif.name; kind = 'gif' }
              }
              if (!full) {
                const img = files.find((f) => kindOf(f.name) === 'webp' || kindOf(f.name) === 'image')
                if (img) { full = subPath + '\\' + img.name; kind = kindOf(img.name) }
              }
              if (!full) continue
              if (videos.some((v) => v.file === full)) continue
              videos.push({ n: 0, file: full, title: info.title, kind, folder: subName, isScene: info.type === 'scene' })
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
        videos = videos.map((v, i) => ({ n: i, file: v.file, title: v.title, kind: v.kind || 'video', folder: v.folder, isScene: !!v.isScene }))
      }

      const boot = (async () => {
        try {
          const mt = await fs.resolve(MANIFEST)
          const manifest = JSON.parse(await fs.readText(mt))
          if (manifest && Array.isArray(manifest.videos) && manifest.videos.length > 0) {
            videos = manifest.videos.map((v) => ({ n: 0, file: v.file, title: v.title, kind: v.kind || 'video', folder: v.folder, isScene: !!v.isScene }))
          }
        } catch (e) {
          videos = []
        }
        await autoSync(WORKSHOP)
        renumber()
        await persist()
        for (const v of videos) {
          serveVideo(v)
          serveScenePkg(v)
        }

        // 渲染器打包模块（读取仓库源码拼接；浏览器场景渲染用）
        try {
          const parts = []
          for (const rel of LIB_FILES) {
            const t = await fs.resolve(CONFIG.weSceneSrc + '\\' + rel)
            parts.push(await fs.readText(t))
          }
          libSource = '// we-scene 打包模块（自动拼接）\n' + parts.join('\n// =====\n')
        } catch (e) {
          libSource = ''
        }

        disposers.push(webServer.register({
          kind: 'exact',
          path: '/dyn/aurora-lib.js',
          handler: async (req, res) => {
            if (!libSource) {
              res.writeHead(404)
              res.end()
              return
            }
            res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' })
            res.end(libSource)
          },
        }))

        disposers.push(webServer.register({
          kind: 'exact',
          path: '/dyn/aurora-noise.png',
          handler: async (req, res) => {
            try {
              const target = await fs.resolve(CONFIG.weNoisePng)
              const bytes = await fs.readBytes(target, undefined, 4 * 1024 * 1024)
              res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' })
              res.end(bytes)
            } catch (err) {
              res.writeHead(404)
              res.end()
            }
          },
        }))

        disposers.push(webServer.register({
          kind: 'exact',
          path: '/dyn/aurora-noise.tex',
          handler: async (req, res) => {
            try {
              const target = await fs.resolve(CONFIG.weNoiseTex)
              const bytes = await fs.readBytes(target, undefined, 4 * 1024 * 1024)
              res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' })
              res.end(bytes)
            } catch (err) {
              res.writeHead(404)
              res.end()
            }
          },
        }))

        // WE shader 源（效果 shader 与公共头文件）：运行时读取本机安装，不分发
        disposers.push(webServer.register({
          kind: 'prefix',
          path: '/dyn/aurora-shader',
          handler: async (req, res) => {
            try {
              const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).slice('/dyn/aurora-shader/'.length)
              if (!/^[A-Za-z0-9_./-]+$/.test(rel) || rel.includes('..')) {
                res.writeHead(403)
                res.end()
                return
              }
              const target = await fs.resolve(CONFIG.weShaderDir + '\\' + rel.split('/').join('\\'))
              const bytes = await fs.readBytes(target, undefined, 2 * 1024 * 1024)
              res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
              res.end(new TextDecoder().decode(bytes))
            } catch (err) {
              res.writeHead(404)
              res.end()
            }
          },
        }))

        disposers.push(webServer.register({
          kind: 'exact',
          path: '/dyn/aurora-list.json',
          handler: async (req, res) => {
            try {
              res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
              res.end(JSON.stringify({
                index: current,
                videos: videos.map((v, i) => ({ title: v.title, url: '/dyn/aurora-video/' + i + '.mp4', k: v.kind || 'video', s: !!v.isScene })),
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
          const listJs = JSON.stringify(videos.map((v) => [v.title, '/dyn/aurora-video/' + v.n + '.mp4', v.kind || 'video', !!v.isScene]))
          const injection = '<video id="aurora-bg" autoplay muted loop playsinline></video><canvas id="aurora-scene" width="1920" height="1080"></canvas><style>#aurora-bg,#aurora-scene{position:fixed;inset:0;width:100%;height:100%;object-fit:cover;z-index:-1;pointer-events:none;transition:opacity .5s;transform:translateZ(0);backface-visibility:hidden;will-change:transform}#aurora-scene{display:none}#aurora-bg.aurora-img{animation:auroraImgDrift 70s ease-in-out infinite alternate}@keyframes auroraImgDrift{0%{transform:translateZ(0) scale(1.02)}50%{transform:translateZ(0) scale(1.08)}100%{transform:translateZ(0) scale(1.04)}}@media (prefers-reduced-motion:reduce){#aurora-bg,#aurora-scene{display:none}}</style><script type="module">' + SCENE_GLUE + '</scr' + 'ipt>'
          return html.slice(0, at) + injection + html.slice(at)
        }))
      })()

      disposers.push(harness.handle('aurora-get', async () => ({ index: current, total: videos.length })))
      disposers.push(harness.handle('aurora-list', async () => ({
        index: current,
        videos: videos.map((v, i) => ({ n: i, title: v.title, kind: v.kind || 'video', isScene: !!v.isScene })),
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
          for (let i = before; i < videos.length; i++) {
            serveVideo(videos[i])
            serveScenePkg(videos[i])
          }
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

// 页面注入的场景渲染胶水脚本（模块脚本，动态导入打包模块）
const SCENE_GLUE = `
import * as lib from '/dyn/aurora-lib.js'
;(function () {
  var list = []
  var vid = document.getElementById('aurora-bg')
  var cv = document.getElementById('aurora-scene')
  var cur = -1
  var renderer = null
  var sceneLoaded = null
  var rafId = 0
  var saved = parseInt(localStorage.getItem('aurora-index') || '0', 10)
  if (isNaN(saved)) saved = 0

  function stopScene() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0 }
    sceneLoaded = null
    if (cv) { cv.style.display = 'none'; cv.style.opacity = 0 }
    if (vid) vid.style.display = 'block'
  }
  function startScene(n) {
    if (!cv) return
    cv.style.display = 'block'
    cv.style.opacity = 0
    if (vid) { vid.pause(); vid.removeAttribute('src'); vid.style.display = 'none' }
    document.body.classList.remove('aurora-live')
    if (sceneLoaded === n) { cv.style.opacity = 1; document.body.classList.add('aurora-live'); return }
    sceneLoaded = n
    var t0 = performance.now()
    fetch('/dyn/aurora-scene/' + n + '.pkg', { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('pkg ' + r.status)
      return r.arrayBuffer()
    }).then(function (buf) {
      var pkg = lib.parsePkg(new Uint8Array(buf))
      var scene = lib.parseScene(JSON.parse(new TextDecoder().decode(lib.getEntry(pkg, 'scene.json')).replace(/^\\uFEFF/, '')), null)
      var textures = new Map()
      if (!renderer) {
        // shader 源解析：pkg 内优先（场景自带版本），其次 WE 安装目录（运行时路由）
        renderer = lib.createRenderer(cv, { shaderResolver: function (rel) {
          var inner = rel.indexOf('shaders/') === 0 ? rel : 'shaders/' + rel
          var pkgEntry = lib.getEntry(pkg, inner)
          if (pkgEntry) return Promise.resolve(new TextDecoder().decode(pkgEntry).replace(/^\\uFEFF/, ''))
          var file = inner.slice('shaders/'.length)
          return fetch('/dyn/aurora-shader/' + file, { cache: 'no-store' }).then(function (r) {
            return r.ok ? r.text() : null
          }).catch(function () { return null })
        } })
      }
      var white = { glTex: lib.makeTexture(renderer.gl, new Uint8Array([255,255,255,255]), 1, 1), width: 1, height: 1, rg88: false }
      textures.set('util/white', white)
      var noflow = { glTex: lib.makeTexture(renderer.gl, new Uint8Array([127,127,127,255]), 1, 1), width: 1, height: 1, rg88: false }
      textures.set('util/noflow', noflow)
      var noiseEntry = { glTex: lib.makeTexture(renderer.gl, lib.generateNoiseTexture(), 256, 256), width: 256, height: 256, rg88: false }
      return fetch('/dyn/aurora-noise.tex', { cache: 'no-store' }).then(function (nr) {
        if (nr.ok) return nr.arrayBuffer().then(function (ab) {
          var ntex = lib.parseTex(new Uint8Array(ab))
          var mips = lib.decodeMips(ntex)
          return { glTex: lib.makeTextureMip(renderer.gl, mips), width: mips[0].width, height: mips[0].height, rg88: false, mips: mips }
        })
        return noiseEntry
      }).catch(function () { return noiseEntry })
      .then(function (noise) {
        textures.set('util/noise', noise)
        return loadScene(scene, textures)
      })
    }).then(function (ok) {
      if (sceneLoaded !== n) return
      cv.style.opacity = 1
      document.body.classList.add('aurora-live')
      var last = performance.now()
      function frame(now) {
        if (sceneLoaded !== n) return
        renderer.render(scene, textures, cv.width, cv.height, (now - last) / 1000).catch(function (e) {
          console.error('aurora-scene 渲染失败', e)
        })
        rafId = requestAnimationFrame(frame)
      }
      rafId = requestAnimationFrame(frame)
    }).catch(function (e) {
      console.error('aurora-scene 加载失败', e)
      if (vid) vid.style.display = 'block'
    })

    function loadScene(scene, textures) {
      var dec = new TextDecoder()
      function rd(b) { return dec.decode(b).replace(/^\\uFEFF/, '') }
      function loadTex(name) {
        if (textures.has(name)) return Promise.resolve(textures.get(name))
        var te = lib.getEntry(pkg, 'materials/' + name + '.tex')
        if (!te) return Promise.resolve(null)
        var tex = lib.parseTex(te)
        var m = lib.decodeMip0(tex)
        var rg88 = tex.format === 8
        if (m.video !== undefined) return Promise.resolve(null)
        if (m.png !== undefined || (m.image !== undefined && m.fif === lib.FIF.JPEG)) {
          var blob = new Blob([m.png || m.image], { type: m.png ? 'image/png' : 'image/jpeg' })
          return createImageBitmap(blob).then(function (bmp) {
            var e = { glTex: lib.makeTexture(renderer.gl, null, 0, 0, bmp), width: bmp.width, height: bmp.height, rg88: rg88 }
            textures.set(name, e)
            return e
          })
        }
        if (m.image !== undefined) return Promise.resolve(null)
        var mips = lib.decodeMips(tex)
        var e = { glTex: lib.makeTextureMip(renderer.gl, mips, rg88), width: mips[0].width, height: mips[0].height, rg88: rg88, mips: mips }
        textures.set(name, e)
        return Promise.resolve(e)
      }
      var jobs = []
      scene.layers.forEach(function (layer) {
        if (!layer.image) return
        jobs.push((function () {
          // 内置模型（models/util/*）直接映射；否则读 pkg
          var model
          if (lib.BUILTIN_MODELS[layer.image]) {
            model = lib.BUILTIN_MODELS[layer.image]
          } else {
            var me = lib.getEntry(pkg, layer.image)
            if (!me) return Promise.resolve()
            model = JSON.parse(rd(me))
          }
          var mat = lib.resolveMaterial(model)
          if (!mat) return Promise.resolve()
          var material
          if (lib.BUILTIN_MATERIALS[mat.materialPath]) {
            material = lib.BUILTIN_MATERIALS[mat.materialPath]
          } else {
            var matEntry = lib.getEntry(pkg, mat.materialPath)
            if (!matEntry) return Promise.resolve()
            material = JSON.parse(rd(matEntry))
          }
          var pass = material.passes && material.passes[0]
          var texName = pass && pass.textures && pass.textures[0]
          var chain = Promise.resolve()
          if (texName) {
            chain = chain.then(function () { return loadTex(texName) }).then(function (e) { if (e) layer.textureName = texName })
          }
          // 效果 material 链解析（effect.json → materials/effects/*.json）
          ;(layer.effects || []).forEach(function (ef) {
            lib.resolveEffectChain(pkg, ef, rd)
            ;(ef.passes || []).forEach(function (p) {
              ;(p.textures || []).forEach(function (tn) {
                if (typeof tn === 'string' && tn !== '' && tn.indexOf('util/') !== 0 && tn.indexOf('_rt_') !== 0) {
                  chain = chain.then(function () { return loadTex(tn) })
                }
              })
            })
          })
          return chain
        })())
      })
      return Promise.all(jobs).then(function () { return true })
    }
  }

  function show(n) {
    if (!list.length) return
    n = ((n % list.length) + list.length) % list.length
    if (n === cur) return
    cur = n
    var it = list[n]
    if (!it) return
    localStorage.setItem('aurora-index', String(n))
    if (it[3]) { startScene(n); return }
    stopScene()
    vid.style.opacity = 0
    if (it[2] === 'video') {
      vid.classList.remove('aurora-img')
      vid.style.backgroundImage = 'none'
      vid.src = it[1]
    } else {
      vid.classList.add('aurora-img')
      vid.removeAttribute('src')
      try { vid.load() } catch (e) {}
      vid.style.backgroundImage = 'url(' + it[1] + ')'
      vid.style.opacity = 1
      document.body.classList.add('aurora-live')
    }
  }
  vid.addEventListener('loadeddata', function () { vid.style.opacity = 1; document.body.classList.add('aurora-live') })
  vid.addEventListener('error', function () { document.body.classList.remove('aurora-live') })
  fetch('/dyn/aurora-set?index=' + saved, { cache: 'no-store' }).catch(function () {})
  function poll() {
    fetch('/dyn/aurora-list.json', { cache: 'no-store' }).then(function (r) { return r.json() }).then(function (s) {
      if (s && Array.isArray(s.videos) && s.videos.length) {
        list = s.videos.map(function (x) { return [x.title, x.url, x.k || 'video', !!x.s] })
        show(typeof s.index === 'number' ? s.index : 0)
      }
    }).catch(function () {})
  }
  poll()
  setInterval(poll, 3000)
})()
`
