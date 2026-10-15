const rules = require('./rules.js')
const { layout } = require('./layout.js')
const renderer = require('./renderer.js')
const { contains } = require('../../common/canvas.js')
const { loadArt } = require('./art.js')

function start({ context, screen, goHome }) {
  let view = layout(screen); let state = rules.initialState(rules.randomSeed()); let best = rules.records(null)
  try { best = rules.records(wx.getStorageSync(rules.SAVE_KEY)) } catch (error) {}
  let active = true; let visible = true; let paused = false; let pressed = null
  let frame = null; let lastAt = Date.now(); let warning = ''; let dirty = false; let lastSaved = lastAt
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : callback => setTimeout(callback, 16)
  const caf = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout
  const art = loadArt(repaint)
  function repaint() { if (active && visible) renderer.draw({ context, view, state, paused, best, warning, art }) }
  function stop() { if (frame !== null) caf(frame); frame = null }
  function collect() {
    const next = rules.updateRecords(best, state)
    if (next.distance !== best.distance || next.score !== best.score || next.flips !== best.flips) { best = next; dirty = true }
  }
  function persist() {
    collect()
    if (!dirty) return
    try { wx.setStorageSync(rules.SAVE_KEY, best); dirty = false; warning = '' }
    catch (error) { warning = '纪录保存失败 · 当前仍可游玩' }
    lastSaved = Date.now()
  }
  function schedule() {
    if (frame === null && active && visible && !paused && rules.isAnimating(state)) frame = raf(update)
  }
  function update() {
    frame = null
    if (!active || !visible || paused || !rules.isAnimating(state)) return
    const now = Date.now(); rules.tick(state, now - lastAt); lastAt = now
    if (state.status === 'crashing' && pressed && pressed.action === 'ride') pressed = null
    if (state.status === 'over') { pressed = null; persist() }
    else if (now - lastSaved >= 2000) persist()
    repaint(); schedule()
  }
  function clearPress() { pressed = null; rules.release(state) }
  function pause() { clearPress(); paused = true; stop(); persist(); repaint() }
  function resume() { clearPress(); paused = false; lastAt = Date.now(); repaint(); schedule() }
  function findTouch(e) { return (e.changedTouches || []).find(t => pressed && t.identifier === pressed.id) }
  function onStart(e) {
    if (!active || !visible || pressed) return
    const t = (e.changedTouches || e.touches || [])[0]
    if (!t) return
    let action
    if (contains(view.back, t)) action = 'back'
    else if (rules.isAnimating(state) && contains(view.pause, t)) action = 'pause'
    else if (contains(view.action, t) && (state.status !== 'crashing' || paused)) action = state.status === 'running' && !paused ? 'ride' : 'action'
    if (!action) return
    pressed = { id: t.identifier, action, x: t.clientX, y: t.clientY }
    if (action === 'ride') { rules.press(state); repaint() }
  }
  function onMove() { /* The button keeps ownership while the finger drifts. */ }
  function onEnd(e) {
    if (!active || !visible || !pressed) return
    const t = findTouch(e)
    if (!t) return
    const gesture = pressed; clearPress()
    if (gesture.action === 'ride') { repaint(); return }
    const rect = gesture.action === 'action' ? view.action : view[gesture.action]
    if (!contains(rect, t) || Math.hypot(t.clientX - gesture.x, t.clientY - gesture.y) > 18) { repaint(); return }
    if (gesture.action === 'back') { persist(); goHome(); return }
    if (gesture.action === 'pause') { if (paused) resume(); else pause(); return }
    if (state.status === 'over') { state = rules.initialState(rules.randomSeed()); rules.begin(state); resume() }
    else if (state.status === 'ready') { rules.begin(state); resume() }
    else resume()
  }
  function onCancel(e) {
    if (!pressed || (e && e.changedTouches && e.changedTouches.length && !findTouch(e))) return
    clearPress(); repaint()
  }
  const listeners = [['Start', onStart], ['Move', onMove], ['End', onEnd], ['Cancel', onCancel]]
  for (const [event, callback] of listeners) wx['onTouch' + event](callback)
  repaint()
  return {
    resize(nextScreen) { view = layout(nextScreen); if (rules.isAnimating(state)) pause(); else { clearPress(); repaint() } },
    hide() { visible = false; if (rules.isAnimating(state)) pause(); else { clearPress(); stop(); persist() } },
    show() { if (!active) return; visible = true; lastAt = Date.now(); repaint() },
    dispose() {
      if (!active) return
      clearPress(); stop(); persist(); active = false; art.dispose()
      for (const [event, callback] of listeners) wx['offTouch' + event](callback)
    }
  }
}
module.exports = { start }
