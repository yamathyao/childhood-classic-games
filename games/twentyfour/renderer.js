const { text, box, background } = require('../../common/canvas.js')
const { puzzles, usage } = require('./rules.js')
const { drawCard, drawCover } = require('./cards.js')
const INK = '#273d35'; const MUTED = '#827d6b'; const GREEN = '#315747'
function wrap(c, value, x, y, width, size, color, lineH = size + 7) {
  let line = ''; let rows = 0
  for (const char of value) {
    if (line && (line + char).length * size > width) { text(c, line, x, y + rows++ * lineH, size, color); line = '' }
    line += char
  }
  if (line) text(c, line, x, y + rows++ * lineH, size, color)
  return rows * lineH
}
function formulaMetrics(c, view, state) {
  const font = `${view.compact ? 20 : 22}px monospace`
  const left = view.formula.x + 12; const width = view.formula.w - 86
  const positions = [0]
  c.save(); c.font = font
  for (let i = 1; i <= state.expression.length; i++) positions.push(c.measureText(state.expression.slice(0, i)).width)
  c.restore()
  const cursor = positions[state.cursor]; const maxOffset = Math.max(0, positions[positions.length - 1] - width)
  // Keep the viewport steady until the caret actually reaches one of its edges.
  let offset = Math.max(0, Math.min(view.formulaOffset || 0, maxOffset))
  if (cursor < offset) offset = cursor
  else if (cursor > offset + width) offset = cursor - width
  view.formulaOffset = offset
  return { font, positions, left, width, x: left - offset, cursorX: left + cursor - offset }
}
function formulaCursor(c, view, state, touchX) {
  const m = formulaMetrics(c, view, state)
  const x = Math.max(m.left, Math.min(touchX, m.left + m.width)) - m.x
  let cursor = 0
  for (let i = 1; i < m.positions.length; i++) {
    if (Math.abs(m.positions[i] - x) < Math.abs(m.positions[cursor] - x)) cursor = i
  }
  return cursor
}
function draw({ context: c, view: v, state: s, feedback, help, warning }) {
  const { width, height, top, pad } = v
  background(c, width, height)
  text(c, '‹', 25, top + 18, 26, MUTED, 'center')
  text(c, '算 24 点', pad + 28, top + 20, 21, INK, 'left', true)
  box(c, { x: pad + 144, y: top + 8, w: 40, h: 23 }, '#dfe5d6', 4, '#c8d1ba')
  text(c, '简单', pad + 164, top + 20, 11, GREEN, 'center')
  box(c, v.help, null, 17, '#c9c0ad'); text(c, '?', v.help.x + 17, v.help.y + 17, 18, INK, 'center')
  text(c, `第 ${String(s.round).padStart(2, '0')} 题`, pad, top + 59, 11, MUTED)
  text(c, '目标', pad + 69, top + 59, 11, MUTED); text(c, '24', pad + 98, top + 59, 23, INK, 'left', true)
  text(c, `已解 ${s.solved} 题`, width - pad, top + 59, 11, MUTED, 'right')
  const puzzle = puzzles[s.puzzleId]; const used = usage(s.expression, puzzle.numbers)
  v.cards.forEach((rect, i) => drawCard(c, rect, puzzle.numbers[i], i, used[i]))
  text(c, '四个数字各用一次 · 顺序不限', pad, v.swap.y + 15, width < 350 ? 10 : 11, MUTED)
  text(c, '↻ 换一题', v.swap.x + v.swap.w, v.swap.y + 15, 12, GREEN, 'right')
  c.fillStyle = '#eae4d6'; c.fillRect(0, v.workspaceY, width, height - v.workspaceY)
  c.fillStyle = '#cfc6b2'; c.fillRect(0, v.workspaceY, width, 1)
  box(c, { x: width / 2 - 18, y: v.workspaceY - 2, w: 36, h: 4 }, '#c4baa3', 2)
  text(c, '你的算式', pad, v.formula.y - 17, 12, INK)
  text(c, '‹', v.left.x + 13, v.left.y + 13, 22, GREEN, 'center')
  text(c, '›', v.right.x + 13, v.right.y + 13, 22, GREEN, 'center')
  text(c, '可用括号', width - pad - 65, v.formula.y - 17, 10, MUTED, 'right')
  box(c, v.formula, s.completed ? '#f1f5e8' : '#faf6eb', 9, feedback.type === 'error' ? '#b45b3c' : s.completed ? GREEN : '#bcb49f')
  const m = formulaMetrics(c, v, s)
  c.save(); c.beginPath(); c.rect(v.formula.x + 9, v.formula.y + 4, v.formula.w - 79, v.formula.h - 8); c.clip()
  c.font = m.font; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillStyle = INK
  if (s.expression) c.fillText(s.expression, m.x, v.formula.y + v.formula.h / 2)
  else text(c, '从这里开始…', m.left, v.formula.y + v.formula.h / 2, 16, '#a49b87')
  c.fillStyle = GREEN; c.fillRect(m.cursorX, v.formula.y + 11, 1, v.formula.h - 22)
  c.restore()
  text(c, s.completed ? '= 24' : '= ?', v.formula.x + v.formula.w - 12, v.formula.y + v.formula.h / 2, 20, s.completed ? GREEN : '#a49b87', 'right')
  wrap(c, warning || feedback.message, pad, v.formula.y + v.formula.h + 12, width - pad * 2, 10,
    warning || feedback.type === 'error' ? '#a2452c' : feedback.type === 'success' ? GREEN : MUTED, 14)
  v.keys.forEach(rect => {
    const op = ['+', '−', '×', '÷'].includes(rect.key); const primary = rect.key === 'submit'
    const utility = ['hint', 'clear', 'delete'].includes(rect.key)
    const label = rect.key === 'hint' ? s.hintLevel ? '答案' : '提示' : rect.key === 'clear' ? '清空' : rect.key === 'delete' ? '⌫' : primary ? s.completed ? '→' : '=' : rect.key
    box(c, { ...rect, y: rect.y + 1 }, '#c4baa5', 6)
    box(c, rect, primary ? s.completed ? '#b45b3c' : GREEN : op ? '#dce3d5' : utility ? '#e2dac9' : '#fffaf1', 6, primary ? GREEN : '#cfc7b6')
    text(c, label, rect.x + rect.w / 2, rect.y + rect.h / 2, utility ? rect.key === 'delete' ? 18 : 11 : 22, primary ? '#fffaf0' : op ? GREEN : INK, 'center')
  })
  if (help) {
    c.fillStyle = 'rgba(34,54,42,.50)'; c.fillRect(0, 0, width, height)
    box(c, v.panel, '#fffaf0', 16, '#c4b89d')
    text(c, '四个数字，算出 24。', v.panel.x + 18, v.panel.y + 32, 20, INK, 'left', true)
    let y = v.panel.y + 70
    for (const line of ['四个数字各用一次，只用加减乘除，可以使用括号。不能把数字拼成多位数。', '点扑克牌或数字键输入，点算式定位，‹ › 移动光标，⌫ 删除。先乘除，后加减。', '例如：(1 + 2 + 3) × 4 = 24', '不限时。点提示看思路，再点一次看参考答案。换题和退出会保存进度。']) {
      y += wrap(c, line, v.panel.x + 18, y, v.panel.w - 36, 12, MUTED, 19) + 10
    }
    box(c, v.close, GREEN, 8); text(c, '知道了，开始算', width / 2, v.close.y + 20, 14, '#fffaf0', 'center')
  }
}
module.exports = { draw, drawCover, formulaMetrics, formulaCursor }
