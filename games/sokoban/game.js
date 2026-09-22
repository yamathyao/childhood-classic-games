const rulesApi = require('./rules.js')
const { levels, getLevel, defaultLevel } = require('./levels.js')
const { layout: makeLayout } = require('./layout.js')
const renderer = require('./renderer.js')
const { contains } = require('../../common/canvas.js')

function validBest(value) {
  if (Number.isInteger(value) && value > 0) return { steps: value, pushes: value, elapsedMs: 0 }
  if (!value || !Number.isInteger(value.steps) || value.steps <= 0) return null
  return {
    steps: value.steps,
    pushes: Number.isInteger(value.pushes) && value.pushes >= 0 ? value.pushes : value.steps,
    elapsedMs: Number.isFinite(value.elapsedMs) && value.elapsedMs >= 0 ? Math.floor(value.elapsedMs) : 0
  }
}

function start({ context, screen, goHome, levelId }) {
  let initialLevelId = levelId
  if (!initialLevelId) {
    try { initialLevelId = wx.getStorageSync('sokoban.currentLevel') } catch (error) {}
  }
  let level = getLevel(initialLevelId || defaultLevel.id)
  let rules = rulesApi.create(level)
  let layout = makeLayout(screen, rules.board)
  let state = rules.initialState()
  let best = null
  let modal = null
  let pickerOpen = false
  let pickerPage = 0
  let pickerLayout = null
  let gesture = null
  let timerStartedAt = null
  let timerHandle = null
  let active = true
  let storageWarning = false

  function saveKey() { return rules.saveKey }
  function bestKey() { return rules.bestKey }

  function loadLevel(nextId) {
    level = getLevel(nextId)
    rules = rulesApi.create(level)
    layout = makeLayout(screen, rules.board)
    try {
      state = rules.restore(wx.getStorageSync(saveKey()))
      best = validBest(wx.getStorageSync(bestKey()))
      wx.setStorageSync('sokoban.currentLevel', level.id)
      storageWarning = false
    } catch (error) {
      state = rules.initialState()
      best = null
      storageWarning = true
    }
    timerStartedAt = state.steps > 0 && !rules.isWon(state) ? Date.now() : null
    modal = rules.isWon(state) ? 'won' : null
  }

  loadLevel(level.id)

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
    if (timerStartedAt === null && !rules.isWon(state)) timerStartedAt = Date.now()
    if (timerHandle === null && typeof setInterval === 'function') timerHandle = setInterval(repaint, 1000)
  }

  function persist() {
    checkpointClock()
    try {
      wx.setStorageSync(saveKey(), rules.snapshot(state))
      wx.setStorageSync('sokoban.currentLevel', level.id)
      storageWarning = false
    } catch (error) { storageWarning = true }
  }

  function finishMove() {
    if (!rules.isWon(state)) return
    stopTimer()
    modal = 'won'
    const result = { steps: state.steps, pushes: state.pushes, elapsedMs: state.elapsedMs }
    if (!best || result.pushes < best.pushes || (result.pushes === best.pushes && result.steps < best.steps) ||
      (result.pushes === best.pushes && result.steps === best.steps && result.elapsedMs < best.elapsedMs)) {
      best = result
      try { wx.setStorageSync(bestKey(), best) } catch (error) { storageWarning = true }
    }
  }

  function repaint() {
    if (!active) return
    renderer.draw({ c: context, layout, state, board: rules.board, elapsedMs: currentElapsedMs(), modal, best, level,
      pickerOpen, pickerLevels: levels, pickerLayout, storageWarning,
      hasNextLevel: levels.findIndex(item => item.id === level.id) < levels.length - 1,
      deadlockReason: rules.deadlockReason(state) })
  }

  function openPicker() {
    pickerPage = Math.floor(Math.max(0, levels.findIndex(item => item.id === level.id)) / 8)
    pickerOpen = true
    pickerLayout = {
      width: screen.width, height: screen.height,
      picker: { x: 16, y: screen.top + 88, w: screen.width - 32, h: Math.min(screen.height - screen.top - screen.bottom - 104, 430) },
      close: { x: screen.width - 16 - 54, y: screen.top + 100, w: 38, h: 34 },
      rows: [], page: pickerPage
    }
    stopTimer()
    persist()
    repaint()
  }

  function buttonAt(touch) {
    if (pickerOpen) {
      if (contains(pickerLayout && pickerLayout.close, touch)) return 'picker-close'
      if (contains(pickerLayout && pickerLayout.prev, touch)) return 'picker-prev'
      if (contains(pickerLayout && pickerLayout.next, touch)) return 'picker-next'
      const row = pickerLayout && pickerLayout.rows.find(item => contains(item, touch))
      return row ? `level:${row.id}` : null
    }
    if (modal) {
      if (contains(layout.cancel, touch)) return 'cancel'
      if (contains(layout.confirm, touch)) return 'confirm'
      if (layout.nextEnabled && contains(layout.next, touch)) return 'next'
      return null
    }
    if (contains(layout.back, touch) || contains(layout.exit, touch)) return 'exit'
    if (contains(layout.picker, touch)) return 'picker'
    if (contains(layout.help, touch)) return 'help'
    if (contains(layout.undo, touch)) return 'undo'
    if (contains(layout.reset, touch)) return 'reset'
    for (const direction of Object.keys(layout.pad)) if (contains(layout.pad[direction], touch)) return direction
    return null
  }

  function move(direction) {
    if (modal || pickerOpen || rules.isWon(state)) return false
    if (!rules.move(state, direction)) return false
    if (state.steps === 1) startTimer()
    persist()
    finishMove()
    repaint()
    return true
  }

  function action(name) {
    if (name === 'exit') { stopTimer(); persist(); goHome(); return }
    if (name === 'picker') { openPicker(); return }
    if (name === 'help') { stopTimer(); modal = 'rules'; repaint(); return }
    if (name === 'undo') {
      if (rules.undo(state)) {
        modal = null
        if (state.steps > 0 && !rules.isWon(state)) startTimer()
        else stopTimer()
        persist()
        repaint()
      }
      return
    }
    if (name === 'reset') { stopTimer(); modal = 'reset'; repaint(); return }
    if (name === 'cancel') {
      modal = null
      if (state.steps > 0 && !rules.isWon(state)) startTimer()
      repaint()
      return
    }
    if (name === 'confirm') {
      if (modal === 'reset' || modal === 'won') {
        stopTimer()
        state = rules.initialState()
        persist()
      }
      modal = null
      repaint()
      return
    }
    if (name === 'next') {
      if (modal !== 'won') return
      const index = levels.findIndex(item => item.id === level.id)
      const nextLevel = levels[index + 1]
      if (!nextLevel) return
      stopTimer()
      loadLevel(nextLevel.id)
      repaint()
      return
    }
    if (['up', 'down', 'left', 'right'].includes(name)) move(name)
  }

  function pickerAction(name) {
    if (name === 'picker-close') { pickerOpen = false; pickerLayout = null; if (state.steps > 0 && !rules.isWon(state)) startTimer(); repaint(); return }
    if (name === 'picker-prev') { pickerPage = Math.max(0, pickerPage - 1); pickerLayout.page = pickerPage; repaint(); return }
    if (name === 'picker-next') { pickerPage = Math.min(Math.ceil(levels.length / 8) - 1, pickerPage + 1); pickerLayout.page = pickerPage; repaint(); return }
    if (name.startsWith('level:')) {
      const nextId = name.slice(6)
      pickerOpen = false
      pickerLayout = null
      stopTimer()
      loadLevel(nextId)
      repaint()
    }
  }

  function onTouchStart(e) {
    if (!active || gesture) return
    const touch = (e.changedTouches || [])[0] || (e.touches || [])[0]
    if (!touch) return
    const button = buttonAt(touch)
    if (button) { gesture = { touch: { ...touch }, button }; return }
    if (modal || pickerOpen || rules.isWon(state)) return
    if (touch.clientX >= layout.board.x && touch.clientX < layout.board.x + layout.board.w &&
      touch.clientY >= layout.board.y && touch.clientY < layout.board.y + layout.board.h) {
      gesture = { touch: { ...touch } }
    }
  }

  function onTouchMove() {}

  function onTouchEnd(e) {
    if (!active || !gesture) return
    const touch = (e.changedTouches || []).find(item => item.identifier === gesture.touch.identifier)
    if (!touch) return
    const current = gesture
    gesture = null
    if (current.button) {
      const distance = Math.hypot(touch.clientX - current.touch.clientX, touch.clientY - current.touch.clientY)
      if (distance < 16) {
        if (pickerOpen) pickerAction(current.button)
        else action(current.button)
      }
      return
    }
    const dx = touch.clientX - current.touch.clientX
    const dy = touch.clientY - current.touch.clientY
    const threshold = Math.max(18, layout.cell * .24)
    if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return
    const direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')
    move(direction)
  }

  function cancel() { gesture = null }

  wx.onTouchStart(onTouchStart)
  wx.onTouchMove(onTouchMove)
  wx.onTouchEnd(onTouchEnd)
  wx.onTouchCancel(cancel)
  if (timerStartedAt !== null) startTimer()
  repaint()

  return {
    resize(nextScreen) {
      cancel(); screen = nextScreen; layout = makeLayout(screen, rules.board)
      if (pickerOpen) openPicker()
      else repaint()
    },
    hide() { cancel(); stopTimer(); persist() },
    show() { if (state.steps > 0 && !rules.isWon(state) && !modal && !pickerOpen) startTimer(); repaint() },
    dispose() {
      cancel(); stopTimer(); persist(); active = false
      wx.offTouchStart(onTouchStart); wx.offTouchMove(onTouchMove); wx.offTouchEnd(onTouchEnd); wx.offTouchCancel(cancel)
    }
  }
}

module.exports = { start }
