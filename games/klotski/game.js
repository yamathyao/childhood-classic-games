const rulesApi = require('./rules.js')
const { getLevel, defaultLevel } = require('./levels.js')
const { layout: makeLayout } = require('./layout.js')
const { createRenderer } = require('./renderer.js')
const { contains } = require('../../common/canvas.js')
const { loadPortraits } = require('./art.js')
const SAVE_KEY = 'klotski.classic.v1'
const BEST_KEY = 'klotski.classic.best.v1'

function start({ context, screen, goHome, levelId = defaultLevel.id }) {
  let level = getLevel(levelId)
  let rules = rulesApi.create(level)
  let saveKey = `klotski.${level.id}.v1`
  let bestKey = `klotski.${level.id}.best.v1`
  let layout = makeLayout(screen)
  let storageWarning = false
  let state = rules.initialState()
  let best = 0
  try {
    state = rules.restore(wx.getStorageSync(saveKey))
    const savedBest = wx.getStorageSync(bestKey)
    if (Number.isInteger(savedBest) && savedBest > 0) best = savedBest
  } catch (error) { storageWarning = true }
  let modal = rules.isWon(state.pieces) ? 'won' : null
  let gesture = null
  let drag = null
  let selected = null
  let active = true
  let animation = null
  let frame = null
  let timerHandle = null
  let timerStartedAt = state.steps > 0 && !rules.isWon(state.pieces) ? Date.now() : null
  let dragFrame = null
  const renderer = createRenderer()
  const portraits = loadPortraits(repaint)

  function currentElapsedMs() {
    return state.elapsedMs + (timerStartedAt === null ? 0 : Date.now() - timerStartedAt)
  }

  function checkpointClock() {
    if (timerStartedAt === null) return
    state.elapsedMs = Math.max(0, Math.floor(currentElapsedMs()))
    timerStartedAt = Date.now()
  }

  function stopTimer() {
    checkpointClock()
    timerStartedAt = null
    if (timerHandle !== null && typeof clearInterval === 'function') clearInterval(timerHandle)
    timerHandle = null
  }

  function startTimer() {
    if (timerStartedAt === null && !rules.isWon(state.pieces)) timerStartedAt = Date.now()
    if (timerHandle === null && typeof setInterval === 'function') timerHandle = setInterval(repaint, 1000)
  }

  function repaint() {
    if (active) renderer.draw({ c: context, layout, state, elapsedMs: currentElapsedMs(), selected, drag, modal,
      portraits: portraits.portraits, best, storageWarning, level })
  }

  function persist() {
    checkpointClock()
    try { wx.setStorageSync(saveKey, rules.snapshot(state)); wx.setStorageSync('klotski.currentLevel', level.id); storageWarning = false }
    catch (error) { storageWarning = true }
  }

  function finishMove() {
    if (!rules.isWon(state.pieces)) return
    stopTimer()
    modal = 'won'
    if (!best || state.steps < best) {
      best = state.steps
      try { wx.setStorageSync(bestKey, best) }
      catch (error) { storageWarning = true }
    }
  }

  function stopAnimation() {
    if (frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
    frame = null
    animation = null
    drag = null
  }

  function stopDragFrame() {
    if (dragFrame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(dragFrame)
    dragFrame = null
  }

  function scheduleDrag() {
    if (dragFrame !== null) return
    function tick() {
      dragFrame = null
      if (!active || !gesture || !gesture.axis) return
      // Keep rendering between touch events. We ease the visible tile toward
      // the latest input while the released move still uses targetOffset.
      const current = drag && drag.id === gesture.id && drag.axis === gesture.axis ? drag.offset : 0
      const distance = gesture.targetOffset - current
      gesture.offset = typeof requestAnimationFrame === 'function'
        ? (Math.abs(distance) < .35 ? gesture.targetOffset : current + distance * .38)
        : gesture.targetOffset
      drag = { id: gesture.id, axis: gesture.axis, offset: gesture.offset }
      repaint()
      if (typeof requestAnimationFrame === 'function' && Math.abs(gesture.targetOffset - gesture.offset) >= .35) {
        dragFrame = requestAnimationFrame(tick)
      }
    }
    if (typeof requestAnimationFrame === 'function') dragFrame = requestAnimationFrame(tick)
    else tick()
  }

  function snapToGrid(id, axis, from, to, commit) {
    stopAnimation()
    if (Math.abs(from - to) < .5 || typeof requestAnimationFrame !== 'function') {
      commit()
      selected = null
      repaint()
      return
    }
    const began = Date.now()
    animation = { commit }
    function tick() {
      if (!active || !animation) return
      const progress = Math.min(1, (Date.now() - began) / 100)
      drag = { id, axis, offset: from + (to - from) * (1 - Math.pow(1 - progress, 3)) }
      repaint()
      if (progress < 1) frame = requestAnimationFrame(tick)
      else {
        const done = animation.commit
        stopAnimation()
        done()
        selected = null
        repaint()
      }
    }
    frame = requestAnimationFrame(tick)
  }

  function cancelGesture() {
    stopDragFrame()
    gesture = null
    selected = null
    // Moves are committed only on release; hide/resize completes a released move.
    if (animation) {
      const commit = animation.commit
      stopAnimation()
      commit()
    } else drag = null
    repaint()
  }

  function buttonAt(touch) {
    if (modal) {
      if (contains(layout.cancel, touch)) return 'cancel'
      if (contains(layout.confirm, touch)) return 'confirm'
      return null
    }
    for (const name of ['back', 'help', 'undo', 'reset', 'exit']) {
      if (contains(layout[name], touch)) return name
    }
    return null
  }

  function action(name) {
    if (name === 'back') { stopTimer(); persist(); goHome(); return }
    if (name === 'exit') { stopTimer(); persist(); goHome(); return }
    if (name === 'help') { stopTimer(); modal = 'rules' }
    if (name === 'reset') { stopTimer(); modal = 'reset' }
    if (name === 'undo') {
      if (rules.undo(state) && state.steps > 0 && !rules.isWon(state.pieces)) startTimer()
      persist()
    }
    if (name === 'cancel') { modal = null; if (state.steps > 0 && !rules.isWon(state.pieces)) startTimer() }
    if (name === 'confirm') {
      if (modal === 'reset' || modal === 'won') {
        stopTimer()
        state = rules.initialState()
        persist()
      }
      modal = null
      if (state.steps > 0 && !rules.isWon(state.pieces)) startTimer()
    }
  }

  function onTouchStart(e) {
    if (!active || gesture) return
    const t = (e.changedTouches || [])[0] || (e.touches || [])[0]
    if (!t) return
    // A new gesture completes a released move, so snapping never eats the next touch.
    if (animation) cancelGesture()
    const button = buttonAt(t)
    if (button) { gesture = { touch: { ...t }, button }; return }
    if (modal || rules.isWon(state.pieces)) return
    const { board, cell } = layout
    const x = (t.clientX - board.x) / cell
    const y = (t.clientY - board.y) / cell
    const piece = state.pieces.find(p => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h)
    if (piece) {
      selected = piece.id
      gesture = { touch: { ...t }, id: piece.id, axis: null, offset: 0, targetOffset: 0 }
      repaint()
    }
  }

  function updateDrag(touch) {
    const dx = touch.clientX - gesture.touch.clientX
    const dy = touch.clientY - gesture.touch.clientY
    if (!gesture.axis && Math.max(Math.abs(dx), Math.abs(dy)) >= 6) {
      gesture.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      gesture.range = rules.moveRange(state.pieces, gesture.id, gesture.axis)
    }
    if (!gesture.axis) return
    const offset = gesture.axis === 'x' ? dx : dy
    gesture.targetOffset = Math.max(gesture.range.min * layout.cell, Math.min(gesture.range.max * layout.cell, offset))
  }

  function onTouchMove(e) {
    if (!active || !gesture || gesture.button) return
    const touches = e.touches && e.touches.length ? e.touches : (e.changedTouches || [])
    const touch = touches.find(t => t.identifier === gesture.touch.identifier)
    if (!touch) return
    updateDrag(touch)
    if (gesture.axis) scheduleDrag()
  }

  function onTouchEnd(e) {
    if (!active || !gesture) return
    const touches = e.changedTouches && e.changedTouches.length ? e.changedTouches : []
    const touch = touches.find(t => t.identifier === gesture.touch.identifier)
    if (!touch) return
    if (gesture.button) {
      const current = gesture
      gesture = null
      const distance = Math.hypot(touch.clientX - current.touch.clientX, touch.clientY - current.touch.clientY)
      if (buttonAt(touch) === current.button && distance < 16) action(current.button)
      repaint()
      return
    }
    updateDrag(touch)
    const current = gesture
    gesture = null
    stopDragFrame()
    const delta = Math.sign(current.targetOffset) * Math.round(Math.abs(current.targetOffset) / layout.cell)
    const visibleOffset = drag && drag.id === current.id && drag.axis === current.axis ? drag.offset : current.targetOffset
    snapToGrid(current.id, current.axis, visibleOffset, delta * layout.cell, () => {
      if (current.axis && delta && rules.move(state, current.id, current.axis, delta)) {
        if (state.steps === 1) startTimer()
        persist()
        finishMove()
      }
    })
  }

  wx.onTouchStart(onTouchStart)
  wx.onTouchMove(onTouchMove)
  wx.onTouchEnd(onTouchEnd)
  wx.onTouchCancel(cancelGesture)
  if (timerStartedAt !== null) startTimer()
  repaint()

  return {
    resize(nextScreen) { cancelGesture(); layout = makeLayout(nextScreen); repaint() },
    hide() { cancelGesture(); stopTimer(); persist() },
    show() { if (state.steps > 0 && !rules.isWon(state.pieces)) startTimer(); repaint() },
    dispose() {
      cancelGesture()
      stopTimer()
      persist()
      active = false
      portraits.dispose()
      renderer.dispose()
      wx.offTouchStart(onTouchStart)
      wx.offTouchMove(onTouchMove)
      wx.offTouchEnd(onTouchEnd)
      wx.offTouchCancel(cancelGesture)
    }
  }
}
module.exports = { start, SAVE_KEY, BEST_KEY }
