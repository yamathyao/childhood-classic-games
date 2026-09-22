const { createRules } = require('./rules.js')
const { layout: makeLayout } = require('./layout.js')
const renderer = require('./renderer.js')
const { contains } = require('../../common/canvas.js')

function validBest(value) {
  if (Number.isFinite(value) && value >= 0) return Math.floor(value)
  if (value && Number.isFinite(value.score) && value.score >= 0) return Math.floor(value.score)
  return 0
}

function gestureAction(start, end, cell) {
  const dx = end.clientX - start.clientX
  const dy = end.clientY - start.clientY
  const distance = Math.max(Math.abs(dx), Math.abs(dy))
  const threshold = Math.max(12, cell * .34)
  if (distance < threshold) return ['rotate']
  if (Math.abs(dx) > Math.abs(dy)) {
    const count = Math.min(6, Math.max(1, Math.floor(Math.abs(dx) / Math.max(1, cell))))
    return Array(count).fill(dx > 0 ? 'right' : 'left')
  }
  if (dy < 0) return ['hardDrop']
  const count = Math.min(8, Math.max(1, Math.floor(Math.abs(dy) / Math.max(1, cell))))
  return Array(count).fill('softDrop')
}

function start({ context: c, screen: initialScreen, goHome }) {
  let screen = initialScreen
  let layout = makeLayout(screen)
  const rules = createRules()
  let state
  let best = 0
  let modal = null
  let gesture = null
  let active = true
  let timerHandle = null
  let clockRunning = false
  let lastTickAt = null
  let lastPersistAt = 0

  function load() {
    try { state = rules.restore(wx.getStorageSync('tetris.v1')) } catch (error) { state = rules.initialState() }
    try { best = validBest(wx.getStorageSync('tetris.best.v1')) } catch (error) { best = 0 }
    state.best = Math.max(state.best, best)
    modal = state.gameOver ? 'over' : null
  }

  function elapsedMs() {
    return state.elapsedMs + (clockRunning && lastTickAt !== null ? Math.max(0, Date.now() - lastTickAt) : 0)
  }

  function persist() {
    state.best = Math.max(state.best, best, state.score)
    best = state.best
    try {
      wx.setStorageSync('tetris.v1', rules.snapshot(state))
      wx.setStorageSync('tetris.best.v1', best)
    } catch (error) {}
  }

  function checkpointClock() {
    if (!clockRunning || lastTickAt === null) return
    const now = Date.now()
    state.elapsedMs += Math.max(0, now - lastTickAt)
    lastTickAt = now
  }

  function stopClock() {
    checkpointClock()
    clockRunning = false
    lastTickAt = null
    if (timerHandle !== null && typeof clearInterval === 'function') clearInterval(timerHandle)
    timerHandle = null
  }

  function startClock() {
    if (!state.started || state.gameOver || modal) return
    if (!clockRunning) { clockRunning = true; lastTickAt = Date.now() }
    if (timerHandle !== null || typeof setInterval !== 'function') return
    timerHandle = setInterval(() => {
      if (!active || !clockRunning || modal) return
      const now = Date.now()
      const delta = Math.max(0, now - (lastTickAt === null ? now : lastTickAt))
      lastTickAt = now
      const result = rules.tick(state, delta)
      if (result.changed && state.gameOver) {
        stopClock()
        modal = 'over'
      }
      if (now - lastPersistAt > 800 || result.changed) { persist(); lastPersistAt = now }
      repaint()
    }, 50)
  }

  function repaint() {
    if (!active) return
    renderer.draw({ c, layout, state, elapsedMs: elapsedMs(), modal })
  }

  function restart() {
    stopClock()
    state = rules.initialState()
    state.best = best
    modal = null
    persist()
    repaint()
  }

  function resume() {
    modal = null
    if (state.started && !state.gameOver) startClock()
    repaint()
  }

  function dispatch(name) {
    if (name === 'exit') { stopClock(); persist(); goHome(); return }
    if (name === 'pause') {
      if (!modal) { stopClock(); modal = 'pause'; persist(); repaint() }
      return
    }
    if (name === 'help') { stopClock(); modal = 'rules'; repaint(); return }
    if (name === 'reset') { stopClock(); modal = 'reset'; repaint(); return }
    if (name === 'restart') { restart(); return }
    if (name === 'resume') { resume(); return }
    if (name === 'confirm-reset' || name === 'confirm-over') { restart(); return }
    if (name === 'continue') { resume(); return }
    if (modal) return
    let result
    if (name === 'left' || name === 'right' || name === 'softDrop') result = rules.move(state, name)
    else if (name === 'rotate') result = rules.rotate(state)
    else if (name === 'hardDrop') result = rules.hardDrop(state)
    else return
    if (!result.changed) { repaint(); return }
    state.started = true
    best = Math.max(best, state.score)
    if (state.gameOver) { stopClock(); modal = 'over' }
    else startClock()
    persist()
    repaint()
  }

  function buttonAt(touch) {
    if (modal) {
      const buttons = renderer.modalButtons(layout, modal)
      if (buttons.extra && contains(buttons.extra, touch)) return modal === 'pause' ? 'reset' : null
      if (contains(buttons.cancel, touch)) {
        if (modal === 'over') return 'exit'
        if (modal === 'pause') return 'continue'
        return 'continue'
      }
      if (contains(buttons.confirm, touch)) {
        if (modal === 'over') return 'confirm-over'
        if (modal === 'pause') return 'exit'
        if (modal === 'reset') return 'confirm-reset'
      }
      return null
    }
    if (contains(layout.back, touch)) return 'exit'
    if (contains(layout.reset, touch)) return 'reset'
    if (contains(layout.pause, touch)) return 'pause'
    if (contains(layout.help, touch)) return 'help'
    if (contains(layout.pad.left, touch)) return 'left'
    if (contains(layout.pad.rotate, touch)) return 'rotate'
    if (contains(layout.pad.right, touch)) return 'right'
    if (contains(layout.softDrop, touch)) return 'softDrop'
    if (contains(layout.hardDrop, touch)) return 'hardDrop'
    return null
  }

  function onTouchStart(e) {
    if (!active || gesture) return
    const touch = (e.changedTouches || [])[0] || (e.touches || [])[0]
    if (!touch) return
    const button = buttonAt(touch)
    if (button) { gesture = { touch: { ...touch }, button }; return }
    if (modal || touch.clientX < layout.board.x || touch.clientX >= layout.board.x + layout.board.w ||
      touch.clientY < layout.board.y || touch.clientY >= layout.board.y + layout.board.h) return
    gesture = { touch: { ...touch } }
  }

  function onTouchMove() {}

  function onTouchEnd(e) {
    if (!active || !gesture) return
    const touch = (e.changedTouches || []).find(item => item.identifier === gesture.touch.identifier)
    if (!touch) return
    const current = gesture
    gesture = null
    if (current.button) {
      if (Math.hypot(touch.clientX - current.touch.clientX, touch.clientY - current.touch.clientY) < 16) dispatch(current.button)
      return
    }
    if (modal) return
    for (const action of gestureAction(current.touch, touch, layout.cell)) dispatch(action)
  }

  function cancel() { gesture = null }

  load()
  wx.onTouchStart(onTouchStart)
  if (wx.onTouchMove) wx.onTouchMove(onTouchMove)
  wx.onTouchEnd(onTouchEnd)
  wx.onTouchCancel(cancel)
  if (state.started && !state.gameOver) startClock()
  repaint()

  return {
    resize(nextScreen) { cancel(); screen = nextScreen; layout = makeLayout(screen); repaint() },
    hide() { cancel(); stopClock(); persist(); repaint() },
    show() { if (state.started && !state.gameOver && !modal) startClock(); repaint() },
    dispose() {
      active = false
      cancel()
      stopClock()
      persist()
      wx.offTouchStart(onTouchStart)
      if (wx.offTouchMove) wx.offTouchMove(onTouchMove)
      wx.offTouchEnd(onTouchEnd)
      wx.offTouchCancel(cancel)
    }
  }
}

module.exports = { start, gestureAction }
