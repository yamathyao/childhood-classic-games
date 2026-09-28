const { contains } = require('../../common/canvas.js')
const { getLevel, levels } = require('./levels.js')
const { create } = require('./rules.js')
const { layout, cameraFor } = require('./layout.js')
const renderer = require('./renderer.js')

function start({ context, screen: initialScreen, goHome, levelId }) {
  let screen = initialScreen
  let level = getLevel(levelId)
  let rules
  let state
  let view
  let best = 0
  let active = true
  let hidden = false
  let gesture = null
  let modal = null
  let motion = null
  let frame = null
  let lastTick = null
  let lastPersist = 0
  let saveFailed = false
  let lastPaint = 0
  let dirty = true
  let animationFrame = false
  const useAnimationFrame = typeof requestAnimationFrame === 'function'
  const painter = renderer.createRenderer()

  function hasNext() { return state.status === 'won' && level.order < levels.length }
  function newSeed() { return (Date.now() ^ Math.floor(Math.random() * 4294967296)) >>> 0 }
  function persist() {
    best = Math.max(best, state.score)
    const previouslyFailed = saveFailed
    try {
      wx.setStorageSync('driller.currentLevel', level.id)
      wx.setStorageSync(rules.saveKey, rules.snapshot(state))
      wx.setStorageSync(rules.bestKey, best)
      saveFailed = false
    } catch (error) { saveFailed = true }
    if (saveFailed !== previouslyFailed) dirty = true
    lastPersist = Date.now()
  }
  function load(nextLevel) {
    level = nextLevel; rules = create(level); view = layout(screen, level)
    state = rules.initialState(newSeed()); best = 0
    try {
      state = rules.restore(wx.getStorageSync(rules.saveKey)) || state
      const savedBest = wx.getStorageSync(rules.bestKey)
      if (Number.isSafeInteger(savedBest) && savedBest >= 0) best = savedBest
    } catch (error) {}
    modal = state.status !== 'playing' ? 'result' : state.started ? 'pause' : null
    persist()
  }
  function stopFrame() {
    if (frame !== null) {
      if (animationFrame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
      else if (typeof clearTimeout === 'function') clearTimeout(frame)
    }
    frame = null; lastTick = null
  }
  function pose() {
    const target = { playerX: state.player % rules.width, playerY: Math.floor(state.player / rules.width), camera: cameraFor(state, view) }
    if (!motion) return target
    const progress = Math.min(1, (Date.now() - motion.startedAt) / motion.duration)
    const ease = 1 - Math.pow(1 - progress, 3)
    return Object.fromEntries(Object.keys(target).map(key => [key, motion[key] + (target[key] - motion[key]) * ease]))
  }
  function showResult(result, before, duration = 130, playerChanged = false) {
    if (result.events.length || playerChanged) {
      motion = { ...before, events: result.events, startedAt: Date.now(), duration }
      dirty = true
    }
    best = Math.max(best, state.score)
    if (state.status !== 'playing') { modal = 'result'; gesture = null; lastTick = null; persist() }
  }
  function advance() {
    if (hidden || modal || !state.started || state.status !== 'playing') { lastTick = null; return }
    const now = Date.now()
    const delta = lastTick === null ? 0 : Math.max(0, Math.min(1000, now - lastTick))
    lastTick = now
    if (delta > 0) {
      const before = pose()
      const player = state.player
      const oxygen = state.oxygen
      const combo = state.combo
      const result = rules.tick(state, delta)
      if (state.oxygen !== oxygen || state.combo !== combo) dirty = true
      showResult(result, before, 95, state.player !== player)
      if (now - lastPersist >= 1000) persist()
    }
  }
  function schedule() {
    if (!active || hidden || frame !== null || (!motion && (modal || !state.started || state.status !== 'playing'))) return
    const callback = () => {
      frame = null
      if (!active || hidden) return
      advance()
      if (gesture && gesture.repeating && !modal && Date.now() >= gesture.repeatAt) {
        gesture.repeatAt = Date.now() + 140
        dispatch(gesture.action)
      }
      if ((dirty || motion) && (Date.now() - lastPaint >= 30 || modal)) repaint()
      else schedule()
    }
    animationFrame = useAnimationFrame && (Boolean(motion) || typeof setTimeout !== 'function')
    if (animationFrame) frame = requestAnimationFrame(callback)
    else if (typeof setTimeout === 'function') frame = setTimeout(callback, 50)
  }
  function repaint() {
    if (!active || hidden) return
    const progress = motion ? Math.min(1, (Date.now() - motion.startedAt) / motion.duration) : 1
    painter.draw({ context, view, level, state, modal, hasNext: hasNext(), motion, progress, saveFailed, best })
    dirty = false
    if (progress >= 1) motion = null
    lastPaint = Date.now()
    schedule()
  }
  function dispatch(action) {
    advance()
    if (action === 'exit') { persist(); goHome(); return }
    if (action === 'pause' || action === 'reset') {
      modal = action === 'reset' ? 'reset' : state.status === 'playing' ? 'pause' : 'result'
      motion = null; stopFrame(); persist(); repaint(); return
    }
    if (action === 'resume' || action === 'view') { modal = null; lastTick = Date.now(); repaint(); return }
    if (action === 'revive') { rules.revive(state); modal = state.status === 'playing' ? null : 'result'; motion = null; lastTick = Date.now(); persist(); repaint(); return }
    if (action === 'retry') { state = rules.initialState(newSeed()); modal = null; motion = null; stopFrame(); persist(); repaint(); return }
    if (action === 'next' && hasNext()) { motion = null; stopFrame(); load(levels[level.order]); repaint(); return }
    if (modal) return
    const before = pose()
    const player = state.player
    const result = rules.move(state, action)
    if (!result.changed) return
    showResult(result, before, 130, state.player !== player)
    if (lastTick === null) lastTick = Date.now()
    persist(); repaint()
  }
  function buttonAt(touch) {
    if (modal) return (renderer.modalButtons(view, modal, hasNext(), state.status).find(rect => contains(rect, touch)) || {}).action
    for (const name of ['back', 'reset', 'pause']) if (contains(view[name], touch)) return name === 'back' ? 'exit' : name
    for (const name of ['left', 'down', 'right', 'up']) if (contains(view.pad[name], touch)) return name
    return null
  }
  function onStart(event) {
    if (!active || hidden || gesture) return
    const touch = (event.changedTouches || [])[0] || (event.touches || [])[0]
    if (!touch) return
    const action = buttonAt(touch)
    if (!action && (modal || !contains(view.board, touch))) return
    const repeating = !modal && ['left', 'right', 'down', 'up'].includes(action) && state.status === 'playing'
    gesture = { ...touch, action, repeating, repeatAt: Date.now() + 300 }
    if (repeating) dispatch(action)
  }
  function onMove(event) {
    if (!gesture) return
    const touch = (event.touches || []).find(item => item.identifier === gesture.identifier)
    if (touch && gesture.repeating && buttonAt(touch) !== gesture.action) gesture.repeating = false
  }
  function onEnd(event) {
    if (!active || hidden || !gesture) return
    const touch = (event.changedTouches || []).find(item => item.identifier === gesture.identifier)
    if (!touch) return
    const previous = gesture; gesture = null
    const deltaX = touch.clientX - previous.clientX
    const deltaY = touch.clientY - previous.clientY
    if (previous.action) {
      if (['left', 'right', 'up', 'down'].includes(previous.action)) return
      if (Math.hypot(deltaX, deltaY) < 16 && buttonAt(touch) === previous.action) dispatch(previous.action)
    } else if (!modal && Math.max(Math.abs(deltaX), Math.abs(deltaY)) >= view.cell * .45) {
      if (Math.abs(deltaX) > Math.abs(deltaY)) dispatch(deltaX > 0 ? 'right' : 'left')
      else dispatch(deltaY > 0 ? 'down' : 'up')
    }
  }
  function cancel() { gesture = null }
  load(level)
  wx.onTouchStart(onStart); wx.onTouchEnd(onEnd); wx.onTouchCancel(cancel)
  if (wx.onTouchMove) wx.onTouchMove(onMove)
  repaint()
  return {
    resize(nextScreen) { advance(); cancel(); motion = null; screen = nextScreen; view = layout(screen, level); repaint() },
    hide() { advance(); hidden = true; cancel(); motion = null; stopFrame(); painter.dispose(); if (state.status === 'playing') modal = 'pause'; persist() },
    show() { hidden = false; lastTick = null; repaint() },
    dispose() {
      advance(); active = false; cancel(); motion = null; stopFrame(); painter.dispose(); persist()
      wx.offTouchStart(onStart); wx.offTouchEnd(onEnd); wx.offTouchCancel(cancel)
      if (wx.offTouchMove) wx.offTouchMove(onMove)
    }
  }
}

module.exports = { start }
