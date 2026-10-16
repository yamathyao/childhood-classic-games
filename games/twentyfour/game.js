const rules = require('./rules.js')
const renderer = require('./renderer.js')
const { layout } = require('./layout.js')
const { contains } = require('../../common/canvas.js')

function start({ context, screen, goHome }) {
  let state
  try { state = rules.restore(wx.getStorageSync(rules.SAVE_KEY)) } catch (error) { state = rules.initialState() }
  let view = layout(screen); let active = true; let visible = true; let help = false; let pressed = null; let dirty = false; let warning = ''
  let feedback = state.completed ? { type: 'success', message: '正好 24！点「→」继续下一题。' } : { type: '', message: '点扑克牌或下方键盘，慢慢来。' }
  function persist() {
    if (!dirty) return
    try { wx.setStorageSync(rules.SAVE_KEY, rules.snapshot(state)); dirty = false; warning = '' }
    catch (error) { warning = '保存失败 · 当前仍可继续，退出前将重试' }
  }
  function repaint() { if (active && visible) renderer.draw({ context, view, state, feedback, help, warning }) }
  function hit(t) {
    if (help) return contains(view.close, t) ? 'close' : null
    for (const key of ['back', 'help', 'swap', 'left', 'right']) if (contains(view[key], t)) return key
    if (contains(view.formula, t)) return 'cursor'
    for (let i = 3; i >= 0; i--) if (contains(view.cards[i], t)) return 'card-' + i
    const key = view.keys.find(key => contains(key, t)); return key && key.key
  }
  function act(key, touch) {
    if (key === 'back') { persist(); goHome(); return }
    if (key === 'help' || key === 'close') help = key === 'help'
    else if (key === 'cursor') {
      state.cursor = renderer.formulaCursor(context, view, state, touch.clientX); dirty = true
    } else if (key === 'hint') {
      if (state.completed) feedback = { type: 'success', message: '已经解开啦！点「→」试试下一题。' }
      else { state.hintLevel = Math.min(2, state.hintLevel + 1); const puzzle = rules.puzzles[state.puzzleId]
        feedback = { type: 'hint', message: state.hintLevel === 1 ? puzzle.hint : '参考：' + rules.display(puzzle.solution) + ' = 24' }; dirty = true }
    } else if (key === 'swap' || (key === 'submit' && state.completed)) {
      rules.next(state); feedback = { type: '', message: '新题来了，试试把它们凑成 24。' }; dirty = true
    } else if (key === 'submit') {
      const result = rules.submit(state); feedback = { type: result.ok ? 'success' : 'error', message: result.ok ? '正好 24！点「→」继续下一题。' : result.message }; dirty = true
    } else {
      if (key.startsWith('card-')) key = String(rules.puzzles[state.puzzleId].numbers[Number(key.slice(5))])
      if (rules.edit(state, key)) { dirty = true; if (!['left', 'right'].includes(key)) feedback = { type: '', message: '四个数字各用一次，算好后点「=」验证。' } }
      else if (state.expression.length >= 64) feedback = { type: 'error', message: '算式太长了，试试更简洁的写法。' }
    }
    persist(); repaint()
  }
  function onStart(e) {
    if (!active || !visible || pressed) return
    const t = (e.changedTouches || e.touches || [])[0]; if (!t) return
    const key = hit(t); if (key) pressed = { key, id: t.identifier, x: t.clientX, y: t.clientY }
  }
  function onMove(e) {
    if (!pressed) return
    const t = (e.touches || e.changedTouches || []).find(t => t.identifier === pressed.id)
    if (t && Math.hypot(t.clientX - pressed.x, t.clientY - pressed.y) >= 16) pressed = null
  }
  function onEnd(e) {
    if (!pressed || !active || !visible) return
    const t = (e.changedTouches || []).find(t => t.identifier === pressed.id); if (!t) return
    const gesture = pressed; pressed = null
    if (hit(t) === gesture.key && Math.hypot(t.clientX - gesture.x, t.clientY - gesture.y) < 16) act(gesture.key, t)
  }
  function onCancel(e) { if (!e || !e.changedTouches || (pressed && e.changedTouches.some(t => t.identifier === pressed.id))) pressed = null }
  const handlers = { Start: onStart, Move: onMove, End: onEnd, Cancel: onCancel }
  Object.keys(handlers).forEach(event => wx['onTouch' + event](handlers[event]))
  repaint()
  return {
    resize(screen) { pressed = null; view = layout(screen); persist(); repaint() },
    hide() { visible = false; pressed = null; persist() },
    show() { visible = true; repaint() },
    dispose() { if (!active) return; persist(); active = false; pressed = null; Object.keys(handlers).forEach(event => wx['offTouch' + event](handlers[event])) }
  }
}
module.exports = { start }
