// DSH Aurora Wallpaper —— 客户端半
// 职责：注册主题（token 覆盖）与设置页 UI（壁纸列表/主题/性能档位/扫描）。
// 性能档位：均衡 60fps / 省电 30fps / 低配 30fps+降采样，失焦暂停开关（localStorage 'aurora-perf'，宿主半读取生效）。

return {
  apply(ctx) {
    const theme = ctx.get('theme')
    const slots = ctx.get('slots')
    if (theme === undefined || slots === undefined) return
    const disposeDark = theme.register({
      id: 'aurora-dark',
      colorScheme: 'dark',
      tokens: {
        '--dsw-alias-bg-base': '#1515152E',
        '--dsw-alias-bg-layer-1': '#1A1A1A40',
        '--dsw-alias-bg-layer-2': '#22222266',
        '--dsw-alias-bg-overlay': '#1E1E1EF0',
        '--dsw-alias-border-l1': '#38383880',
        '--dsw-alias-border-l2': '#4A4A4A8C',
        '--dsw-specific-sidebar-fill': '#12121273',
        '--dsw-specific-input-major': '#121212CC',
        '--dsw-specific-tip': '#121212B3',
        '--dsw-alias-button-ghost-active-fill': 'rgba(34, 34, 40, 0.55)',
      },
    })
    const disposeLight = theme.register({
      id: 'aurora-light',
      colorScheme: 'light',
      tokens: {
        '--dsw-alias-bg-base': '#F5F3EF40',
        '--dsw-alias-bg-layer-1': '#FAF8F44D',
        '--dsw-alias-bg-layer-2': '#EFEBE280',
        '--dsw-alias-bg-overlay': '#FBF9F4EB',
        '--dsw-alias-border-l1': '#C9C2B173',
        '--dsw-alias-border-l2': '#B3AC9A8C',
        '--dsw-specific-sidebar-fill': '#EDEAE34D',
        '--dsw-specific-input-major': '#F0EEE9D9',
        '--dsw-specific-tip': '#F5F3EFBF',
        '--dsw-alias-button-ghost-active-fill': 'rgba(24, 24, 28, 0.08)',
      },
    })
    theme.setTheme('aurora-dark')
    const disposeStyles = styles.insert(`
html { background: #DCD9D2; }
html:has(body[data-ds-dark-theme]) { background: #0E0E10; }
body { background: transparent; }
body { --dsw-shadow-lv2: 0 1px 2px rgba(30, 40, 70, 0.04), 0 10px 28px rgba(30, 40, 70, 0.10); }
body[data-ds-dark-theme] { --dsw-shadow-lv2: 0 10px 28px rgba(0, 0, 0, 0.28); }
body { --dsw-alias-button-ghost-active-fill: rgba(24, 24, 28, 0.08); }
body[data-ds-dark-theme] { --dsw-alias-button-ghost-active-fill: rgba(34, 34, 40, 0.55); }
body::before, body::after {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
}
body::before {
  background:
    radial-gradient(58vmax 58vmax at 30% 28%, rgba(122, 168, 232, 1), transparent 64%),
    radial-gradient(46vmax 46vmax at 76% 60%, rgba(240, 184, 136, 0.95), transparent 64%),
    radial-gradient(52vmax 52vmax at 68% 22%, rgba(111, 196, 180, 0.9), transparent 64%),
    radial-gradient(44vmax 44vmax at 24% 76%, rgba(183, 155, 224, 0.92), transparent 64%);
  animation: dshAuroraDriftA 60s ease-in-out infinite alternate;
}
body.aurora-live::before { animation: none; }
body[data-ds-dark-theme]::before {
  background:
    radial-gradient(58vmax 58vmax at 30% 28%, rgba(120, 165, 245, 0.95), transparent 64%),
    radial-gradient(46vmax 46vmax at 76% 60%, rgba(235, 170, 95, 0.85), transparent 64%),
    radial-gradient(52vmax 52vmax at 68% 22%, rgba(95, 190, 168, 0.85), transparent 64%),
    radial-gradient(44vmax 44vmax at 24% 76%, rgba(165, 135, 220, 0.9), transparent 64%);
}
body::after {
  background:
    linear-gradient(180deg, rgba(255, 253, 248, 0.35) 0%, rgba(255, 253, 248, 0) 14%),
    linear-gradient(180deg, rgba(255, 253, 248, 0.10), rgba(255, 253, 248, 0.06));
}
body[data-ds-dark-theme]::after {
  background:
    linear-gradient(180deg, rgba(14, 14, 16, 0) 50%, rgba(14, 14, 16, 0.05) 61%, rgba(14, 14, 16, 0.12) 71%, rgba(14, 14, 16, 0.22) 80%, rgba(14, 14, 16, 0.36) 88%, rgba(14, 14, 16, 0.5) 95%, rgba(14, 14, 16, 0.58) 100%),
    linear-gradient(180deg, rgba(14, 14, 16, 0.75) 0%, rgba(14, 14, 16, 0.75) 8%, rgba(14, 14, 16, 0) 35%),
    linear-gradient(180deg, rgba(24, 24, 26, 0.08), rgba(24, 24, 26, 0.10));
}
[data-cordis-status] .cvtE3a_output { background: rgba(16, 16, 20, 0.6) !important; }
[data-composer-seat] * { box-shadow: none !important; }
.aurora-panel{display:flex;flex-direction:column;gap:14px;font-size:13px;line-height:20px}
.aurora-title{font-size:14px;font-weight:500;color:var(--dsw-alias-label-primary)}
.aurora-sub{color:var(--dsw-alias-label-tertiary);font-size:12px}
.aurora-actions{display:flex;gap:8px;flex-wrap:wrap}
.aurora-btn{appearance:none;cursor:pointer;font:inherit;font-size:12px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:5px 12px}
.aurora-btn:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}
.aurora-btn:disabled{opacity:.45;cursor:default}
.aurora-btn[data-active=true]{background:var(--dsw-alias-interactive-bg-hover-solid);border-color:var(--dsw-alias-state-business-primary)}
.aurora-list{list-style:none;margin:0;padding:0;max-height:300px;overflow-y:auto;display:flex;flex-direction:column;gap:2px}
.aurora-item{appearance:none;cursor:pointer;font:inherit;font-size:13px;text-align:left;color:var(--dsw-alias-label-secondary);background:transparent;border:1px solid transparent;border-radius:8px;padding:7px 10px}
.aurora-item:hover{background:var(--dsw-alias-interactive-bg-hover)}
.aurora-item[data-active=true]{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover-solid);border-color:var(--dsw-alias-border-l1)}
.aurora-err{color:var(--dsw-alias-state-error-primary);font-size:12px}
@keyframes dshAuroraDriftA {
  0% { transform: translate3d(-2%, -1.5%, 0) scale(1.02); }
  50% { transform: translate3d(2%, 1.5%, 0) scale(1.06); }
  100% { transform: translate3d(-1%, 1.5%, 0) scale(1.03); }
}
@media (prefers-reduced-motion: reduce) {
  body::before { animation: none; }
}
`)
    const disposeSection = slots.inject('settings.section', () => slots.register(
      { name: 'settings.section', id: 'wallpaper', order: 30, label: '壁纸背景' },
      (props) => React.createElement(WallpaperSection, { close: props.close }),
    ))
    ctx.effect(() => () => {
      disposeSection()
      disposeStyles()
      disposeLight()
      disposeDark()
    })
    function WallpaperSection(props) {
      const [list, setList] = React.useState(null)
      const [index, setIndex] = React.useState(0)
      const [scan, setScan] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [err, setErr] = React.useState('')
      const [pref, setPref] = React.useState('')
      const [perfMode, setPerfMode] = React.useState('balanced')
      const [pauseOnBlur, setPauseOnBlur] = React.useState(true)
      const THEMES = [
        { id: 'aurora-dark', label: '动态壁纸·暗' },
        { id: 'aurora-light', label: '动态壁纸·亮' },
        { id: 'dark', label: '内置暗色' },
        { id: 'light', label: '内置亮色' },
      ]
      const PERF_LABELS = { balanced: '均衡 · 60fps', powersave: '省电 · 30fps', lowend: '低配 · 30fps+降采样' }
      React.useEffect(() => {
        let alive = true
        host.call('aurora-list', {}).then((r) => {
          if (!alive) return
          setList(r.videos || [])
          setIndex(r.index || 0)
        }).catch(() => { if (alive) setErr('读取壁纸列表失败') })
        const snap = theme.getTheme()
        if (snap && snap.preference) setPref(snap.preference)
        try {
          const p = JSON.parse(localStorage.getItem('aurora-perf') || '{}')
          if (p.mode) setPerfMode(p.mode)
          if (p.pauseOnBlur !== undefined) setPauseOnBlur(p.pauseOnBlur)
        } catch (e) {}
        return () => { alive = false }
      }, [])
      const refreshList = () => {
        host.call('aurora-list', {}).then((r) => {
          setList(r.videos || [])
          setIndex(r.index || 0)
        }).catch(() => setErr('刷新列表失败'))
      }
      const switchTheme = (id) => {
        theme.setTheme(id)
        const snap = theme.getTheme()
        setPref(snap.preference)
      }
      const go = (n) => {
        setBusy(true)
        host.call('aurora-set', { index: n }).then((r) => {
          setIndex(r.index)
          setBusy(false)
        }).catch(() => { setErr('切换失败'); setBusy(false) })
      }
      const doScan = (path) => {
        setBusy(true)
        setScan(null)
        host.call('aurora-scan', path ? { path: path } : {}).then((r) => {
          setScan(r)
          setBusy(false)
          refreshList()
        }).catch(() => { setErr('扫描失败'); setBusy(false) })
      }
      const pickFolder = () => {
        const ws = ctx.get('workspaces')
        if (ws === undefined) { setErr('此环境不支持文件夹选择'); return }
        ws.pickDirectory().then((p) => {
          if (p) doScan(p)
        }).catch(() => { setErr('无法打开文件夹选择器') })
      }
      const setPerf = (mode, pause) => {
        localStorage.setItem('aurora-perf', JSON.stringify({ mode: mode, pauseOnBlur: pause }))
        setPerfMode(mode)
        setPauseOnBlur(pause)
      }
      const total = list ? list.length : 0
      const cur = list && list[index] ? list[index] : null
      return React.createElement('div', { className: 'aurora-panel' }, [
        React.createElement('div', { key: 't', className: 'aurora-title' }, '壁纸背景视频'),
        React.createElement('div', { key: 'th', className: 'aurora-sub' }, '主题（外观行只支持内置三档，壁纸主题在这里切换）：'),
        React.createElement('div', { key: 'ta', className: 'aurora-actions' }, THEMES.map((th) => React.createElement('button', {
          key: th.id,
          className: 'aurora-btn',
          'data-active': String(pref === th.id),
          onClick: () => switchTheme(th.id),
        }, th.label))),
        React.createElement('div', { key: 'pt', className: 'aurora-sub' }, '性能（场景壁纸渲染档位，不影响画质）：'),
        React.createElement('div', { key: 'pa', className: 'aurora-actions' }, Object.keys(PERF_LABELS).map((m) => React.createElement('button', {
          key: m,
          className: 'aurora-btn',
          'data-active': String(perfMode === m),
          onClick: () => setPerf(m, pauseOnBlur),
        }, PERF_LABELS[m]))),
        React.createElement('div', { key: 'pb', className: 'aurora-actions' }, [
          React.createElement('button', {
            key: 'pause',
            className: 'aurora-btn',
            'data-active': String(pauseOnBlur),
            onClick: () => setPerf(perfMode, !pauseOnBlur),
          }, '失焦暂停：' + (pauseOnBlur ? '开' : '关')),
        ]),
        React.createElement('div', { key: 'c', className: 'aurora-sub' }, cur ? ('当前：' + cur.title + '（' + (index + 1) + '/' + total + '）') : (list && list.length === 0 ? '未在壁纸引擎目录中发现壁纸。' : '加载中…')),
        React.createElement('div', { key: 'a', className: 'aurora-actions' }, [
          React.createElement('button', { key: 'p', className: 'aurora-btn', disabled: busy || !list || list.length === 0, onClick: () => go(index - 1) }, '上一张'),
          React.createElement('button', { key: 'n', className: 'aurora-btn', disabled: busy || !list || list.length === 0, onClick: () => go(index + 1) }, '下一张'),
        ]),
        React.createElement('ul', { key: 'l', className: 'aurora-list' }, (list || []).map((v, i) => React.createElement('li', { key: String(v.n) + ':' + String(i) },
          React.createElement('button', { className: 'aurora-item', 'data-active': String(i === index), onClick: () => go(i) }, v.title),
        ))),
        React.createElement('div', { key: 's', className: 'aurora-actions' }, [
          React.createElement('button', { key: 'scan', className: 'aurora-btn', disabled: busy, onClick: () => doScan(null) }, '同步壁纸引擎目录'),
          React.createElement('button', { key: 'pick', className: 'aurora-btn', disabled: busy, onClick: pickFolder }, '从文件夹选择'),
        ]),
        scan && React.createElement('div', { key: 'r' }, [
          scan.added && scan.added.length > 0 && React.createElement('div', { className: 'aurora-sub' }, '已自动加入 ' + scan.added.length + ' 个：' + scan.added.join('、')),
          (!scan.added || scan.added.length === 0) && React.createElement('div', { className: 'aurora-sub' }, '没有新壁纸，列表已是最新。'),
          scan.errors && scan.errors.length > 0 && React.createElement('div', { className: 'aurora-err' }, '部分目录不可读：' + scan.errors.join('；')),
        ]),
        err && React.createElement('div', { key: 'e', className: 'aurora-err' }, err),
      ])
    }
  },
}
