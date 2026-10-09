const { contains } = require('../../common/canvas.js')
const rules = require('./rules.js')
const { layout, nameControls } = require('./layout.js')
const { draw, drawCombatFrame } = require('./renderer.js')
const { loadSprites } = require('./art.js')
const { createFeedback, recordEvents, isAnimating } = require('./feedback.js')

function start({ context, screen: initialScreen, goHome }) {
  let screen = initialScreen; let view = layout(screen)
  const newState = () => rules.initialState((Date.now() ^ Math.floor(Math.random() * 4294967296)) >>> 0)
  let state = newState(); let records = []
  state = rules.loadProgress(key => wx.getStorageSync(key)) || state
  try {
    const stored = wx.getStorageSync(rules.bestKey)
    if (Array.isArray(stored)) records = stored.filter(item => item && Number.isInteger(item.runId) &&
      typeof item.name === 'string' && item.name.length <= 8 && Number.isInteger(item.streak) && item.streak > 0 && item.streak <= 100)
      .sort((a, b) => b.streak - a.streak).slice(0, 20)
  } catch (error) {}
  const nameState = { rng: (Date.now() ^ Math.floor(Math.random() * 4294967296)) >>> 0 || 1 }
  let recentNames = []
  try {
    const stored = wx.getStorageSync('textbattle.names.v1')
    if (Array.isArray(stored)) recentNames = stored.filter(value => typeof value === 'string' && value.length <= 8).slice(-64)
  } catch (error) {}
  if (recentNames[recentNames.length - 1] !== state.player.name) recentNames.push(state.player.name)
  recentNames = recentNames.slice(-64)
  let active = true; let hidden = false; let pressed = null; let keyboardOpen = false
  const pendingUpgrade = () => state.progression && state.progression.pending
  let modal = pendingUpgrade() ? 'growth' : state.status === 'fighting' ? 'pause' : ['won', 'lost'].includes(state.status) ? 'result' : null
  let timer = null; let lastTick = null; let resultAt = null; let saveFailed = false; let lastSaved = 0; let logOffset = 0; let reviewing = false
  let feedback = createFeedback(state, Date.now())
  const art = loadSprites(paint)
  function clearFeedback() { feedback = createFeedback(state, Date.now()) }
  function remember() {
    if (state.streak <= 0) return
    const previous = records.find(item => item.runId === state.runId)
    if (previous) { previous.streak = Math.max(previous.streak, state.streak); previous.name = state.player.name }
    else records.push({ runId: state.runId, name: state.player.name, streak: state.streak })
    records.sort((a, b) => b.streak - a.streak); records = records.slice(0, 20)
  }
  function persist() {
    remember()
    try {
      wx.setStorageSync(rules.saveKey, rules.snapshot(state)); wx.setStorageSync(rules.bestKey, records)
      saveFailed = false
    } catch (error) { saveFailed = true }
    lastSaved = Date.now()
  }
  function paint(animationOnly = false) {
    if (!active || hidden) return
    const options = { modal, best: records, feedback, now: Date.now(), saveFailed, logOffset, reviewing, art }
    if (animationOnly && !modal && !reviewing) drawCombatFrame(context, view, state, options)
    else draw(context, view, state, options)
  }
  function stop() {
    if (timer !== null && typeof clearTimeout === 'function') clearTimeout(timer)
    timer = null; lastTick = null
  }
  function advance() {
    const now = Date.now()
    if (lastTick === null || modal || reviewing || state.status !== 'fighting') { lastTick = now; return false }
    const events = rules.tick(state, Math.max(0, now - lastTick))
    lastTick = now
    recordEvents(feedback, state, events, now)
    // Save the outcome immediately; let the last hit settle before the dialog.
    if (state.status !== 'fighting') { resultAt = now + 400; stop(); persist() }
    else if (now - lastSaved >= 2000) persist()
    return events.length > 0
  }
  function schedule() {
    if (!active || hidden || modal || reviewing || (state.status !== 'fighting' && resultAt === null) || timer !== null || typeof setTimeout !== 'function') return
    const now = Date.now()
    if (lastTick === null) lastTick = now
    const nextAttack = Math.max(1, Math.ceil(Math.min(state.player.cooldown, state.enemy.cooldown)))
    const delay = resultAt !== null ? Math.max(1, Math.min(34, resultAt - now)) : isAnimating(feedback, now) ? Math.min(34, nextAttack) : nextAttack
    timer = setTimeout(() => {
      timer = null
      if (!active || hidden || modal) return
      if (resultAt !== null) {
        if (Date.now() >= resultAt) { resultAt = null; modal = 'result'; clearFeedback(); paint() }
        else { paint(true); schedule() }
        return
      }
      const hadEffects = feedback.effects.length > 0 || isAnimating(feedback, Date.now())
      const changed = advance()
      if (changed || hadEffects || modal) paint(!changed && !modal)
      schedule()
    }, delay)
  }
  function pause(next = 'pause') {
    const wasFighting = state.status === 'fighting' && !modal
    advance(); stop(); resultAt = null; clearFeedback(); pressed = null
    modal = wasFighting && state.status !== 'fighting' ? 'result' : next
    persist(); paint()
  }
  function closeKeyboard() {
    if (keyboardOpen && wx.hideKeyboard) wx.hideKeyboard({})
    keyboardOpen = false
  }
  function onKeyboardConfirm(event) {
    if (!active || hidden || !keyboardOpen || state.status !== 'prepare') return
    const name = String(event.value || '').trim().replace(/[\x00-\x1f\x7f]/g, '').slice(0, 8)
    if (name) state.player.name = name
    closeKeyboard(); persist(); paint()
  }
  function onKeyboardComplete() {
    if (!active || !keyboardOpen) return
    keyboardOpen = false; paint()
  }
  function rename() {
    if (state.status !== 'prepare') return
    if (wx.showKeyboard && wx.onKeyboardConfirm) {
      keyboardOpen = true
      wx.showKeyboard({ defaultValue: state.player.name, maxLength: 8, multiple: false, confirmHold: false,
        confirmType: 'done', fail: () => { if (active) { keyboardOpen = false; paint() } } })
    } else { randomName(); paint() }
  }
  function randomName() {
    closeKeyboard()
    if (recentNames[recentNames.length - 1] !== state.player.name) recentNames.push(state.player.name)
    state.player.name = rules.nickname(nameState, recentNames.slice(-64))
    state.player.gender = rules.randomGender(nameState)
    recentNames.push(state.player.name); recentNames = recentNames.slice(-64)
    try { wx.setStorageSync('textbattle.names.v1', recentNames) } catch (error) {}
    persist()
  }
  function dispatch(action) {
    if (action === 'home') { pause(); closeKeyboard(); goHome(); return }
    if (action === 'restart') { closeKeyboard(); pause('reset'); return }
    if (action === 'info') { pause('help'); return }
    if (action === 'tactics') { closeKeyboard(); pause('weapons'); return }
    if (action.startsWith('guide:')) { modal = action.slice(6); paint(); return }
    if (action === 'pause') { pause(state.status === 'fighting' ? 'pause' : 'records'); return }
    if (action === 'secondary') {
      if (modal === 'result') { modal = null; logOffset = 0; clearFeedback() }
      else modal = pendingUpgrade() ? 'growth' : state.status === 'fighting' ? 'pause' : null
    }
    else if (action === 'primary') {
      if (modal === 'result') {
        if (state.status === 'won' && state.round < 100) { rules.nextRound(state); modal = 'growth'; clearFeedback(); logOffset = 0; reviewing = false; persist() }
        else { state = newState(); modal = null; clearFeedback(); logOffset = 0; reviewing = false; persist() }
      } else if (modal === 'records') modal = 'reset'
      else if (modal === 'reset') { state = newState(); modal = null; clearFeedback(); logOffset = 0; reviewing = false; persist() }
      else { modal = pendingUpgrade() ? 'growth' : null; reviewing = false; logOffset = 0 }
    } else if (action.startsWith('upgrade:')) {
      if (rules.chooseUpgrade(state, action.slice(8))) { modal = null; clearFeedback(); persist() }
    } else if (action === 'name') rename()
    else if (action === 'randomName' && state.status === 'prepare') {
      randomName()
    }
    else if (action === 'reroll') { if (rules.reroll(state)) persist() }
    else if (action === 'gender') {
      if (rules.configure(state, 'gender', state.player.gender === 'female' ? 'male' : 'female')) persist()
    }
    else if (action.startsWith('weapon:')) { if (rules.configure(state, 'weapon', action.slice(7))) persist() }
    else if (action.startsWith('stance:')) { if (rules.configure(state, 'stance', action.slice(7))) persist() }
    else if (action === 'action') {
      closeKeyboard()
      if (state.status === 'prepare') { rules.startFight(state); clearFeedback(); lastTick = Date.now(); persist() }
      else if (state.status === 'fighting') {
        if (reviewing) { reviewing = false; logOffset = 0; lastTick = null }
        else { advance(); stop(); clearFeedback(); reviewing = state.status === 'fighting'; persist() }
      }
      else modal = 'result'
    }
    if (modal && resultAt !== null) { resultAt = null; stop(); clearFeedback() }
    paint(); schedule()
  }
  function hit(touch) {
    if (modal) {
      if (modal === 'growth') {
        const index = view.growthCards.findIndex(rect => contains(rect, touch))
        const choice = rules.upgradeChoices(state)[index]
        if (choice) return `upgrade:${choice.id}`
        return contains(view.growthHome, touch) ? 'home' : contains(view.growthRestart, touch) ? 'restart' : null
      }
      if (['help', 'weapons', 'relations', 'momentum'].includes(modal)) {
        const index = view.guideTabs.findIndex(rect => contains(rect, touch))
        if (index >= 0) return `guide:${['help', 'weapons', 'relations', 'momentum'][index]}`
        return contains(view.guidePrimary, touch) ? 'primary' : contains(view.guideSecondary, touch) ? 'secondary' : null
      }
      return contains(view.modalPrimary, touch) ? 'primary' : contains(view.modalSecondary, touch) ? 'secondary' : null
    }
    for (const key of ['home', 'restart', 'info', 'pause', 'action', 'tactics']) if (contains(view[key], touch)) return key
    if (state.status !== 'prepare') return null
    const controls = nameControls(view, state.player.name)
    if (contains(controls.name, touch)) return 'name'
    if (contains(view.gender, touch)) return 'gender'
    if (contains(controls.randomName, touch)) return 'randomName'
    if (state.round === 1 && contains(view.reroll, touch)) return 'reroll'
    const weapon = view.weapons.findIndex(rect => contains(rect, touch))
    if (state.round === 1 && weapon >= 0) return `weapon:${rules.weapons[weapon].id}`
    const stance = view.stances.findIndex(rect => contains(rect, touch))
    if (stance >= 0) return `stance:${rules.stances[stance].id}`
    return null
  }
  function onStart(event) {
    if (!active || hidden || pressed) return
    const touch = event.changedTouches[0]
    const action = hit(touch)
    if (action) pressed = { ...touch, action }
    else if (!modal && state.status !== 'prepare' && contains(view.log, touch)) pressed = { ...touch, action: 'log-scroll', offset: logOffset }
  }
  function onMove(event) {
    if (!active || hidden || !pressed || pressed.action !== 'log-scroll') return
    const touch = (event.touches || []).find(item => item.identifier === pressed.identifier)
    if (!touch) return
    const distance = touch.clientY - pressed.clientY
    if (Math.abs(distance) < 6) return
    if (state.status === 'fighting' && !reviewing) {
      advance(); stop(); clearFeedback()
      if (state.status !== 'fighting') { pressed = null; paint(); return }
      reviewing = true; persist()
    }
    const next = Math.max(0, Math.min(Math.max(0, state.logs.length - view.logPageSize), pressed.offset + Math.round(distance / view.logLineHeight)))
    if (next === logOffset && pressed.scrolled) return
    pressed.scrolled = true; logOffset = next
    paint()
  }
  function onEnd(event) {
    if (!active || hidden || !pressed) return
    const touch = event.changedTouches.find(item => item.identifier === pressed.identifier)
    if (!touch) return
    const start = pressed; pressed = null
    if (hit(touch) === start.action && Math.hypot(touch.clientX - start.clientX, touch.clientY - start.clientY) < 16) dispatch(start.action)
  }
  function cancel() { pressed = null }
  wx.onTouchStart(onStart); wx.onTouchEnd(onEnd); wx.onTouchCancel(cancel)
  if (wx.onTouchMove) wx.onTouchMove(onMove)
  if (wx.onKeyboardConfirm) wx.onKeyboardConfirm(onKeyboardConfirm)
  if (wx.onKeyboardComplete) wx.onKeyboardComplete(onKeyboardComplete)
  persist(); paint()
  return {
    hide() { if (!active) return; pause(state.status === 'fighting' ? 'pause' : modal); hidden = true; closeKeyboard() },
    show() { if (!active) return; hidden = false; paint() },
    resize(next) { if (!active) return; if (state.status === 'fighting') pause(); screen = next; view = layout(screen); logOffset = Math.min(logOffset, Math.max(0, state.logs.length - view.logPageSize)); pressed = null; paint() },
    dispose() {
      if (!active) return
      if (!hidden) advance()
      stop(); resultAt = null; persist(); closeKeyboard(); active = false; pressed = null; clearFeedback()
      art.dispose()
      wx.offTouchStart(onStart); wx.offTouchEnd(onEnd); wx.offTouchCancel(cancel)
      if (wx.offTouchMove) wx.offTouchMove(onMove)
      if (wx.offKeyboardConfirm) wx.offKeyboardConfirm(onKeyboardConfirm)
      if (wx.offKeyboardComplete) wx.offKeyboardComplete(onKeyboardComplete)
    }
  }
}
module.exports = { start }
