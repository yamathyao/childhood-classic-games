const rules = require('./rules.js')
const route = require('./route.js')
const renderer = require('./renderer.js')
const store = require('./storage.js')
const { layout } = require('./layout.js')
const { contains } = require('../../common/canvas.js')

function start({ canvas, context, screen, goHome }) {
  const read = key => { try { return wx.getStorageSync(key) } catch (error) { return null } }
  let settings = store.settings(read(store.SETTINGS_KEY)); let records = store.records(read(store.RECORDS_KEY))
  let page = 'setup'; let state = null; let view = layout(screen)
  let active = true; let visible = true; let help = false; let frame = null; let last = 0
  const FRAME_MS = 1000 / 30
  let nextPaint = 0
  let nativeFrameRate = false
  if (typeof wx.setPreferredFramesPerSecond === 'function') {
    try { wx.setPreferredFramesPerSecond(30); nativeFrameRate = true } catch (error) { /* Use a paced timer on older runtimes. */ }
  }
  let sourceScreen = screen
  function sizeCanvas(next, restore = false) {
    if (!canvas || !next.dpr || typeof context.scale !== 'function') return
    const dpr = restore ? next.dpr : Math.min(1.5, next.dpr)
    canvas.width = Math.round(next.width * dpr); canvas.height = Math.round(next.height * dpr)
    context.scale(dpr, dpr)
  }
  sizeCanvas(screen)
  let settingsDirty = false; let recordsDirty = false; let settled = false; let warning = ''
  const fingers = new Map(); const input = { left: false, right: false, brake: false, accelerate: false }
  function persist() {
    warning = ''
    try {
      if (settingsDirty) { wx.setStorageSync(store.SETTINGS_KEY, { ...settings }); settingsDirty = false }
      if (recordsDirty) { wx.setStorageSync(store.RECORDS_KEY, { ...records }); recordsDirty = false }
    } catch (error) { warning = '保存失败，当前可继续 · 稍后重试' }
  }
  function repaint() {
    if (active && visible) renderer.draw({ context, view, page, settings, records, state, input, help, warning })
  }
  function repaintInput() {
    // A running scene already has a frame queued; touch events only update its shared input.
    if (frame === null) repaint()
  }
  function clearInput() { fingers.clear(); Object.keys(input).forEach(key => { input[key] = false }) }
  function stop() {
    if (frame !== null) { if (nativeFrameRate) cancelAnimationFrame(frame); else clearTimeout(frame) }
    frame = null; last = 0; nextPaint = 0
  }
  function pause() { stop(); clearInput(); if (state && state.status === 'running') state.status = 'paused' }
  function settle() {
    if (!state || settled || !['crashed', 'finished'].includes(state.status)) return
    settled = true; records = store.finish(records, state); recordsDirty = true; persist()
  }
  function schedule() {
    if (frame === null && active && visible && !help && state && state.status === 'running') {
      frame = nativeFrameRate ? requestAnimationFrame(update) : setTimeout(update, Math.max(1, Math.ceil(nextPaint - Date.now())))
    }
  }
  function update() {
    frame = null
    if (!active || !visible || help || !state || state.status !== 'running') return
    const now = Date.now()
    if (last && now < nextPaint - .5) { schedule(); return }
    const dt = last ? Math.min(.1, Math.max(0, (now - last) / 1000)) : 0
    last = now; nextPaint = nextPaint && now - nextPaint < FRAME_MS ? nextPaint + FRAME_MS : now + FRAME_MS
    rules.step(state, input, dt)
    if (state.status !== 'running') { stop(); clearInput(); settle() }
    repaint(); schedule()
  }
  function begin() {
    stop(); clearInput(); settled = false; state = rules.create(settings); rules.start(state); page = 'drive'
    last = Date.now(); nextPaint = last
    settingsDirty = true; persist(); repaint(); schedule()
  }
  function select() { pause(); settle(); persist(); page = 'setup'; state = null; help = false; repaint() }
  function exitAvailable() {
    if (!state || state.status !== 'running' || state.phase !== 'driving') return false
    const exit = route.exitAt(state.distance)
    return exit.remaining <= 220 && state.distance <= exit.decisionEnd
  }
  function hit(t) {
    if (help) return contains(view.close, t) ? 'close' : null
    if (page === 'drive' && state.status !== 'running') {
      if (contains(view.resume, t)) return 'resume'
      if (contains(view.choose, t)) return 'choose'
      return null
    }
    if (contains(view.back, t)) return 'back'
    if (contains(view.help, t)) return 'help'
    if (page === 'setup') {
      if (contains(view.start, t)) return 'start'
      for (const [name, list] of [['model', view.cars], ['mode', view.modes], ['density', view.densities]]) {
        const i = list.findIndex(r => contains(r, t)); if (i >= 0) return name + '-' + i
      }
    } else {
      if (contains(view.pause, t)) return 'pause'
      if (exitAvailable() && contains(view.exit, t)) return 'exit'
      const r = view.controls.find(r => contains(r, t)); if (r) return r.key
    }
    return null
  }
  function act(key) {
    if (key === 'back') { if (page === 'setup') { persist(); goHome(); return } select(); return }
    if (key === 'help') { pause(); help = true }
    else if (key === 'close') help = false
    else if (key === 'start') { begin(); return }
    else if (key === 'pause') pause()
    else if (key === 'choose') { select(); return }
    else if (key === 'resume') {
      if (state.status === 'paused') { clearInput(); rules.start(state); last = Date.now(); nextPaint = last; schedule() }
      else { begin(); return }
    } else if (key === 'exit') rules.requestExit(state)
    else if (key.startsWith('model-')) { settings.model = Number(key.slice(6)); settingsDirty = true }
    else if (key.startsWith('mode-')) { settings.mode = ['cruise', 'manual'][Number(key.slice(5))]; settingsDirty = true }
    else if (key.startsWith('density-')) { settings.density = ['easy', 'normal', 'busy'][Number(key.slice(8))]; settingsDirty = true }
    persist(); repaint()
  }
  function syncInput() {
    Object.keys(input).forEach(key => { input[key] = [...fingers.values()].some(f => f.key === key) })
  }
  function onStart(e) {
    if (!active || !visible) return
    for (const t of e.changedTouches || e.touches || []) {
      if (fingers.has(t.identifier)) continue
      const key = hit(t); if (!key) continue
      // UI actions use a single owner; driving controls allow a different finger on each button.
      const control = Object.prototype.hasOwnProperty.call(input, key)
      if (!control && fingers.size) continue
      if ([...fingers.values()].some(f => f.key === key)) continue
      fingers.set(t.identifier, { key, x: t.clientX, y: t.clientY })
      if (control && state.mode === 'cruise' && (key === 'left' || key === 'right')) rules.changeLane(state, key === 'left' ? -1 : 1)
    }
    syncInput(); repaintInput()
  }
  function onMove(e) {
    if (!active || !visible) return
    for (const t of e.touches || e.changedTouches || []) {
      const f = fingers.get(t.identifier); if (!f) continue
      if (hit(t) !== f.key || (!Object.prototype.hasOwnProperty.call(input, f.key) && Math.hypot(t.clientX - f.x, t.clientY - f.y) > 16)) fingers.delete(t.identifier)
    }
    syncInput(); repaintInput()
  }
  function onEnd(e) {
    if (!active || !visible) return
    const actions = []
    for (const t of e.changedTouches || []) {
      const f = fingers.get(t.identifier); fingers.delete(t.identifier)
      if (f && !Object.prototype.hasOwnProperty.call(input, f.key) && hit(t) === f.key && Math.hypot(t.clientX - f.x, t.clientY - f.y) < 16) actions.push(f.key)
    }
    syncInput(); actions.forEach(act); if (!actions.length) repaintInput()
  }
  function onCancel(e) {
    if (!e || !e.changedTouches || !e.changedTouches.length) clearInput()
    else { for (const t of e.changedTouches) fingers.delete(t.identifier); syncInput() }
    repaintInput()
  }
  const handlers = { Start: onStart, Move: onMove, End: onEnd, Cancel: onCancel }
  Object.keys(handlers).forEach(name => wx['onTouch' + name](handlers[name]))
  repaint()
  return {
    resize(next) { pause(); renderer.releaseCaches(); sourceScreen = next; sizeCanvas(next); view = layout(next); persist(); repaint() },
    hide() { visible = false; pause(); settle(); persist() },
    show() { visible = true; persist(); repaint() },
    dispose() {
      if (!active) return
      pause(); settle(); persist(); active = false
      renderer.releaseCaches()
      sizeCanvas(sourceScreen, true)
      if (nativeFrameRate) { try { wx.setPreferredFramesPerSecond(60) } catch (error) { /* Scene is already stopped. */ } }
      Object.keys(handlers).forEach(name => wx['offTouch' + name](handlers[name]))
    }
  }
}
module.exports = { start }
