const rules = require('./rules.js')
const { layout, hitCharge } = require('./layout.js')
const renderer = require('./renderer.js')
const { contains } = require('../../common/canvas.js')

function start({ context, screen, goHome }) {
  let view = layout(screen)
  let state
  try { state = rules.restore(wx.getStorageSync(rules.SAVE_KEY)) } catch (error) { state = rules.initialState() }
  let active = true
  let visible = true
  let paused = false
  let pressed = null
  let frame = null
  let lastAt = Date.now()
  let lastSaved = lastAt
  let warning = ''
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : callback => setTimeout(callback, 16)
  const caf = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout
  const heldMs = () => pressed && pressed.action === 'charge' ? Math.max(0, Date.now() - pressed.at) : 0

  function persist() {
    try { wx.setStorageSync(rules.SAVE_KEY, rules.snapshot(state)); warning = '' }
    catch (error) { warning = '保存失败 · 当前仍可继续投掷' }
    lastSaved = Date.now()
  }
  function repaint() {
    if (active && visible) renderer.draw({ context, view, state, paused, warning,
      charging: pressed && pressed.action === 'charge', power: Math.min(1, heldMs() / rules.MAX_CHARGE_MS) })
  }
  function stop() { if (frame !== null) caf(frame); frame = null }
  function schedule() {
    if (frame === null && active && visible && !paused &&
        !state.gameOver && (rules.active(state) || (pressed && pressed.action === 'charge'))) frame = raf(update)
  }
  function update() {
    frame = null
    if (!active || !visible || paused) return
    const now = Date.now()
    const wasActive = rules.active(state)
    if (wasActive) rules.tick(state, now - lastAt)
    if (state.gameOver) pressed = null
    lastAt = now
    if ((wasActive && !rules.active(state)) || now - lastSaved >= 1000) persist()
    repaint(); schedule()
  }
  function findTouch(e, id) { return (e.changedTouches || []).find(touch => touch.identifier === id) }
  function onStart(e) {
    if (!active || !visible || pressed) return
    const t = (e.changedTouches || e.touches || [])[0]
    if (!t) return
    let action = null
    if (contains(view.back, t)) action = 'back'
    else if (state.gameOver && contains(view.restart, t)) action = 'restart'
    else if (!state.gameOver && contains(view.pause, t)) action = 'pause'
    else if (!state.gameOver && contains(view.clean, t)) action = 'clean'
    else if (!state.gameOver && !paused && hitCharge(view, t)) action = 'charge'
    else if (!state.gameOver && !paused && contains(view.scene, t)) action = 'aim'
    if (!action) return
    pressed = { id: t.identifier, action, at: Date.now(), x: t.clientX, y: t.clientY,
      startX: t.clientX, startY: t.clientY }
    if (action === 'charge') { lastAt = Date.now(); schedule() }
    repaint()
  }
  function onMove(e) {
    if (!pressed || !active || !visible || paused) return
    const t = (e.touches || []).find(touch => touch.identifier === pressed.id) || findTouch(e, pressed.id)
    if (!t) return
    if (pressed.action === 'aim') {
      rules.aim(state, t.clientX - pressed.x, t.clientY - pressed.y, view.width, renderer.aimGuide(view.scene, state).pitchScale)
      pressed.x = t.clientX; pressed.y = t.clientY
      repaint()
    }
    // A charge gesture belongs to the circular button until release, even if the finger drifts.
  }
  function onEnd(e) {
    if (!pressed || !active || !visible) return
    const t = findTouch(e, pressed.id)
    if (!t) return
    const gesture = pressed
    if (gesture.action === 'charge' && !paused && !state.gameOver) rules.launch(state, heldMs())
    else if (gesture.action === 'aim' && !state.gameOver) rules.aim(state, t.clientX - gesture.x, t.clientY - gesture.y, view.width, renderer.aimGuide(view.scene, state).pitchScale)
    pressed = null
    if (['back', 'pause', 'clean', 'restart'].includes(gesture.action)) {
      const rect = view[gesture.action]
      if (contains(rect, t) && Math.hypot(t.clientX - gesture.startX, t.clientY - gesture.startY) < 16) {
        if (gesture.action === 'back') { persist(); goHome(); return }
        if (gesture.action === 'restart') { state = rules.initialState(); paused = false; stop() }
        else if (gesture.action === 'clean') { rules.clearPaper(state); stop() }
        else { paused = !paused; stop() }
      }
    }
    lastAt = Date.now(); persist(); repaint(); schedule()
  }
  function onCancel(e) {
    if (pressed && (!e || !e.changedTouches || findTouch(e, pressed.id))) {
      pressed = null; persist(); repaint()
      if (!rules.active(state)) stop()
    }
  }
  for (const [event, callback] of [['Start', onStart], ['Move', onMove], ['End', onEnd], ['Cancel', onCancel]]) wx['onTouch' + event](callback)
  repaint(); schedule()
  return {
    resize(nextScreen) { pressed = null; view = layout(nextScreen); lastAt = Date.now(); persist(); repaint(); if (!rules.active(state)) stop() },
    hide() { visible = false; pressed = null; stop(); persist() },
    show() { visible = true; lastAt = Date.now(); repaint(); schedule() },
    dispose() {
      if (!active) return
      pressed = null; persist(); active = false; stop()
      for (const [event, callback] of [['Start', onStart], ['Move', onMove], ['End', onEnd], ['Cancel', onCancel]]) wx['offTouch' + event](callback)
    }
  }
}

module.exports = { start }
