const { box, text, gradient, background, headerButton } = require('../../common/canvas.js')

const SCENE = {
  ink: '#26333a', paper: '#f4e8c4', parchment: '#d6c58f', wood: '#d68126',
  woodDark: '#7b3f16', bronze: '#9a8e55', bronzeLight: '#d6cc95', brick: '#8f8e5d',
  floorA: '#efe5bb', floorB: '#e4d7a8', red: '#df7183', redDark: '#963f51',
}

// Box finishes vary subtly to keep a crowded classic level readable. These
// styles are visual metadata only; every box can occupy every goal.
const CRATE_STYLES = [
  { fill: '#e38a2c', stroke: '#8e4818', glow: 'rgba(78,43,11,.28)' },
  { fill: '#d97820', stroke: '#813d15', glow: 'rgba(78,43,11,.28)' },
  { fill: '#ed9a35', stroke: '#934b18', glow: 'rgba(78,43,11,.28)' },
  { fill: '#cf6e1d', stroke: '#773816', glow: 'rgba(78,43,11,.28)' }
]

function tileRect(layout, x, y, inset = 0) {
  return { x: layout.board.x + x * layout.cell + inset, y: layout.board.y + y * layout.cell + inset,
    w: layout.cell - inset * 2, h: layout.cell - inset * 2 }
}

// WeChat's canvas runtime does not expose ellipse() on every supported base
// library, so keep oval shadows portable by scaling a regular arc.
function ellipse(c, cx, cy, rx, ry, fill) {
  const k = .5522848
  c.beginPath()
  c.moveTo(cx + rx, cy)
  c.bezierCurveTo(cx + rx, cy + ry * k, cx + rx * k, cy + ry, cx, cy + ry)
  c.bezierCurveTo(cx - rx * k, cy + ry, cx - rx, cy + ry * k, cx - rx, cy)
  c.bezierCurveTo(cx - rx, cy - ry * k, cx - rx * k, cy - ry, cx, cy - ry)
  c.bezierCurveTo(cx + rx * k, cy - ry, cx + rx, cy - ry * k, cx + rx, cy)
  c.closePath()
  if (fill) { c.fillStyle = fill; c.fill() }
}

function drawScene(c, layout) {
  background(c, layout.width, layout.height)
  c.fillStyle = gradient(c, 0, 0, layout.width, layout.height, ['#f7efda', '#dfd2a8'])
  c.fillRect(0, 0, layout.width, layout.height)
  c.fillStyle = 'rgba(86,74,34,.045)'
  for (let row = 0; row < Math.ceil(layout.height / 22); row++) for (let col = 0; col < Math.ceil(layout.width / 19); col++) {
    const x = (col * 19 + (row % 2 ? 7 : 0)) % layout.width
    const y = row * 22 + 4
    c.fillRect(x, y, 1, 1)
  }
  box(c, { x: 0, y: layout.top + 101, w: layout.width, h: 5 }, '#777449', 0, '#b9b27b')
  c.fillStyle = 'rgba(255,255,231,.72)'; c.fillRect(0, layout.top + 106, layout.width, 2)
}

function drawHeader(c, layout, level, state) {
  headerButton(c, layout.back, '‹  游戏合集', { size: 10, color: SCENE.ink })
  headerButton(c, layout.picker, '选关', { color: SCENE.ink })
  headerButton(c, layout.help, '玩法', { color: SCENE.ink })
  text(c, '推箱子', 25, layout.top + 53, 29, SCENE.ink, 'left', true)
  text(c, '经典仓库番 · 木箱只能推不能拉', 26, layout.top + 80, 10, '#6f6945')
  const plaque = { x: 24, y: layout.top + 95, w: layout.width - 48, h: 25 }
  box(c, plaque, gradient(c, plaque.x, plaque.y, plaque.w, plaque.h, ['#aaa46c', '#7c7b50']), 7, '#5d603e')
  box(c, { x: plaque.x + 2, y: plaque.y + 2, w: plaque.w - 4, h: plaque.h - 4 }, null, 5, 'rgba(255,255,220,.24)')
  text(c, `${level.chapter}  ·  ${level.name}`, plaque.x + 12, plaque.y + plaque.h / 2, 11, '#fff6d6', 'left', true)
  text(c, `第 ${String(level.order).padStart(2, '0')} 关`, plaque.x + plaque.w - 12, plaque.y + plaque.h / 2, 10, '#f5edc2', 'right')
  const statsY = layout.top + 45
  drawStat(c, { x: layout.width - 137, y: statsY, w: 56, h: 43 }, '步数', String(state.steps).padStart(2, '0'))
  drawStat(c, { x: layout.width - 76, y: statsY, w: 56, h: 43 }, '推箱', String(state.pushes).padStart(2, '0'))
}

function drawStat(c, rect, label, value) {
  box(c, rect, 'rgba(255,248,223,.72)', 8, '#b8aa72')
  text(c, label, rect.x + rect.w / 2, rect.y + 11, 9, '#6f6945', 'center')
  text(c, value, rect.x + rect.w / 2, rect.y + 29, 19, SCENE.redDark, 'center', true)
}

function drawWall(c, rect, x, y) {
  box(c, rect, gradient(c, rect.x, rect.y, rect.w, rect.h, ['#aaa76f', '#898957']), 1, '#686943')
  c.fillStyle = 'rgba(242,238,180,.28)'; c.fillRect(rect.x + 1, rect.y + 1, rect.w - 2, 2)
  c.strokeStyle = 'rgba(73,75,43,.55)'; c.lineWidth = 1
  c.beginPath(); c.moveTo(rect.x + 1, rect.y + rect.h * .58); c.lineTo(rect.x + rect.w - 1, rect.y + rect.h * .58); c.stroke()
  c.beginPath(); c.moveTo(rect.x + rect.w * ((x + y) % 2 ? .37 : .67), rect.y + 1); c.lineTo(rect.x + rect.w * ((x + y) % 2 ? .37 : .67), rect.y + rect.h * .58); c.stroke()
  c.fillStyle = 'rgba(67,68,39,.16)'; c.fillRect(rect.x + 3, rect.y + rect.h * .72, rect.w * .28, 1)
}

function drawFloor(c, rect, x, y) {
  box(c, rect, (x + y) % 2 ? SCENE.floorA : SCENE.paper, 1, '#d3c592')
  c.fillStyle = 'rgba(117,99,49,.16)'
  c.fillRect(rect.x + rect.w * .2, rect.y + rect.h * .22, 1, 1)
  c.fillRect(rect.x + rect.w * .72, rect.y + rect.h * .7, 1, 1)
  c.fillRect(rect.x + rect.w * .52, rect.y + rect.h * .42, 1, 1)
}

function drawVoid(c, rect) {
  box(c, rect, '#d7cca0', 1, '#c4b781')
  c.strokeStyle = 'rgba(111,101,57,.18)'; c.lineWidth = 1
  c.beginPath(); c.moveTo(rect.x + 3, rect.y + rect.h - 3); c.lineTo(rect.x + rect.w - 3, rect.y + 3); c.stroke()
}

function drawGoal(c, layout, x, y, variant = 0) {
  const rect = tileRect(layout, x, y)
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  const r = layout.cell * .31
  c.fillStyle = 'rgba(84,57,42,.22)'; c.beginPath(); c.arc(cx, cy + layout.cell * .07, r, 0, Math.PI * 2); c.fill()
  c.fillStyle = variant % 2 ? '#e6919b' : '#dc7d8e'; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill()
  c.strokeStyle = '#a94d62'; c.lineWidth = 1.4; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke()
  c.fillStyle = 'rgba(255,219,214,.55)'; c.beginPath(); c.arc(cx - r * .35, cy - r * .38, Math.max(1, layout.cell * .035), 0, Math.PI * 2); c.fill()
  c.strokeStyle = 'rgba(255,233,225,.7)'; c.lineWidth = 1; c.beginPath(); c.arc(cx, cy, r * .62, 0, Math.PI * 2); c.stroke()
}

function drawMap(c, layout, state, board) {
  const frame = { x: layout.board.x - 13, y: layout.board.y - 13, w: layout.board.w + 26, h: layout.board.h + 26 }
  c.save()
  c.shadowColor = 'rgba(83,68,34,.28)'; c.shadowBlur = 14; c.shadowOffsetY = 6
  box(c, frame, gradient(c, frame.x, frame.y, frame.w, frame.h, ['#aaa36c', '#777647']), 8, '#5c5e3d')
  c.shadowColor = 'transparent'
  box(c, { x: frame.x + 4, y: frame.y + 4, w: frame.w - 8, h: frame.h - 8 }, null, 6, 'rgba(248,244,191,.32)')
  box(c, { x: frame.x + 8, y: frame.y + 8, w: frame.w - 16, h: frame.h - 16 }, '#d1c58f', 3, '#5f603d')
  c.restore()
  for (let y = 0; y < board.height; y++) for (let x = 0; x < board.width; x++) {
    const position = y * board.width + x
    const rect = tileRect(layout, x, y, 1.5)
    if (board.walls.has(position)) drawWall(c, rect, x, y)
    else if (board.voids && board.voids.has(position)) drawVoid(c, rect)
    else drawFloor(c, rect, x, y)
    if (board.goals.has(position)) drawGoal(c, layout, x, y, board.goalStyles.get(position))
  }
  for (const [boxIndex, position] of state.boxes.entries()) {
    const x = position % board.width; const y = Math.floor(position / board.width); const rect = tileRect(layout, x, y, layout.cell * .09)
    const variant = Array.isArray(state.gemStyles) && Number.isInteger(state.gemStyles[boxIndex])
      ? state.gemStyles[boxIndex] : (boxIndex % CRATE_STYLES.length)
    const onGoal = board.goals.has(position)
    drawCrate(c, rect, onGoal, layout.cell, variant)
  }
  const playerX = state.player % board.width; const playerY = Math.floor(state.player / board.width)
  const playerRect = tileRect(layout, playerX, playerY)
  const cx = playerRect.x + playerRect.w / 2; const cy = playerRect.y + playerRect.h / 2
  drawMover(c, cx, cy, layout.cell)
}

function drawCrate(c, rect, onGoal, cell, variant = 0) {
  const cx = rect.x + rect.w / 2; const cy = rect.y + rect.h / 2
  const style = CRATE_STYLES[variant % CRATE_STYLES.length]
  c.save(); c.shadowColor = 'rgba(88,45,13,.35)'; c.shadowBlur = 6; c.shadowOffsetY = 3
  c.fillStyle = 'rgba(88,45,13,.24)'
  ellipse(c, cx, cy + cell * .35, cell * .28, cell * .1, 'rgba(88,45,13,.24)')
  c.shadowColor = 'transparent'
  const r = cell * .32
  c.fillStyle = style.fill
  c.strokeStyle = style.stroke; c.lineWidth = 1.5
  c.beginPath(); c.moveTo(cx - r, cy - r); c.lineTo(cx + r, cy - r); c.lineTo(cx + r, cy + r); c.lineTo(cx - r, cy + r); c.closePath()
  c.fill(); c.stroke()
  c.strokeStyle = 'rgba(91,42,12,.82)'; c.lineWidth = Math.max(1, cell * .045)
  c.beginPath(); c.moveTo(cx - r * .82, cy - r * .82); c.lineTo(cx + r * .82, cy + r * .82); c.moveTo(cx + r * .82, cy - r * .82); c.lineTo(cx - r * .82, cy + r * .82); c.stroke()
  c.strokeStyle = 'rgba(255,190,84,.56)'; c.lineWidth = Math.max(1, cell * .028)
  c.beginPath(); c.moveTo(cx - r * .72, cy - r * .88); c.lineTo(cx + r * .72, cy - r * .88); c.stroke()
  c.fillStyle = 'rgba(255,221,145,.62)'; c.beginPath(); c.arc(cx - r * .55, cy - r * .58, Math.max(1, cell * .04), 0, Math.PI * 2); c.fill()
  if (onGoal) {
    c.strokeStyle = '#f3b1aa'; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, r * 1.12, 0, Math.PI * 2); c.stroke()
  }
  c.restore()
}

function drawMover(c, cx, cy, cell) {
  c.save(); c.shadowColor = 'rgba(42,49,57,.32)'; c.shadowBlur = 5; c.shadowOffsetY = 3
  ellipse(c, cx, cy + cell * .3, cell * .2, cell * .08, 'rgba(42,49,57,.22)')
  c.fillStyle = '#2c5d8c'; c.beginPath(); c.moveTo(cx - cell * .17, cy + cell * .03); c.lineTo(cx + cell * .17, cy + cell * .03); c.lineTo(cx + cell * .2, cy + cell * .25); c.lineTo(cx - cell * .2, cy + cell * .25); c.closePath(); c.fill()
  c.strokeStyle = '#183d69'; c.lineWidth = 1; c.stroke()
  c.fillStyle = '#f0c39b'; c.beginPath(); c.arc(cx, cy - cell * .11, cell * .2, 0, Math.PI * 2); c.fill()
  c.strokeStyle = '#9d654d'; c.lineWidth = 1; c.stroke()
  c.fillStyle = '#1c2029'; c.beginPath(); c.arc(cx, cy - cell * .23, cell * .205, Math.PI, Math.PI * 2); c.fill()
  c.fillRect(cx - cell * .205, cy - cell * .23, cell * .07, cell * .16); c.fillRect(cx + cell * .135, cy - cell * .23, cell * .07, cell * .16)
  c.fillStyle = '#202633'; c.beginPath(); c.arc(cx - cell * .07, cy - cell * .1, cell * .025, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(cx + cell * .07, cy - cell * .1, cell * .025, 0, Math.PI * 2); c.fill()
  c.strokeStyle = '#b64f53'; c.lineWidth = 1; c.beginPath(); c.arc(cx, cy - cell * .03, cell * .06, 0.15, Math.PI - .15); c.stroke()
  c.restore()
}

function drawDialog(c, layout, type, state, best, level, hasNextLevel) {
  c.fillStyle = 'rgba(52,55,33,.5)'; c.fillRect(0, 0, layout.width, layout.height)
  box(c, layout.dialog, gradient(c, layout.dialog.x, layout.dialog.y, layout.dialog.w, layout.dialog.h, ['#f8edc9', '#ded09a']), 16, '#767348')
  box(c, { x: layout.dialog.x + 5, y: layout.dialog.y + 5, w: layout.dialog.w - 10, h: layout.dialog.h - 10 }, null, 12, 'rgba(255,255,224,.48)')
  const cx = layout.dialog.x + layout.dialog.w / 2
  c.fillStyle = type === 'won' ? '#df7183' : '#8f8e5d'
  c.beginPath(); c.arc(layout.dialog.x + layout.dialog.w - 29, layout.dialog.y + 29, 13, 0, Math.PI * 2); c.fill()
  text(c, type === 'won' ? '解' : '谜', layout.dialog.x + layout.dialog.w - 29, layout.dialog.y + 29, 11, '#fff8e6', 'center', true)
  const title = type === 'rules' ? '仓库番 · 玩法' : type === 'reset' ? '重新开始' : '仓库已清空'
  text(c, level.name, cx, layout.dialog.y + 29, 11, SCENE.red, 'center')
  text(c, title, cx, layout.dialog.y + 62, 23, SCENE.ink, 'center', true)
  const lines = type === 'rules'
    ? ['把所有木箱推到红色目标点。', '木箱只能推不能拉，卡住时可悔棋。', '滑动棋盘或点方向键移动仓库工人。']
    : type === 'reset'
      ? ['本关的进度将重置。', '已完成的关卡记录不会删除。']
      : [`本次完成：${state.pushes} 次推箱 · ${state.steps} 步`, best ? `个人最佳：${best.pushes} 推 · ${best.steps} 步` : '每一次推动，都是新的路线。']
  lines.forEach((line, i) => text(c, line, cx, layout.dialog.y + 104 + i * 22, 11, '#5c6041', 'center'))
  if (type === 'won') {
    const gap = 6; const x = layout.dialog.x + 12; const w = (layout.dialog.w - 24 - gap * 2) / 3; const y = layout.dialog.y + 190
    layout.cancel = { x, y, w, h: 42 }
    layout.confirm = { x: x + w + gap, y, w, h: 42 }
    layout.next = { x: x + (w + gap) * 2, y, w, h: 42 }
    layout.nextEnabled = Boolean(hasNextLevel)
    stoneButton(c, layout.cancel, '查看棋盘')
    stoneButton(c, layout.confirm, '再来一局', true)
    stoneButton(c, layout.next, '下一关', false, layout.nextEnabled)
  } else {
    stoneButton(c, { x: layout.dialog.x + 20, y: layout.dialog.y + 190, w: (layout.dialog.w - 50) / 2, h: 42 }, type === 'rules' ? '返回' : '取消')
    stoneButton(c, { x: layout.dialog.x + layout.dialog.w / 2 + 5, y: layout.dialog.y + 190, w: (layout.dialog.w - 50) / 2, h: 42 }, type === 'rules' ? '开始解局' : '确认重开', true)
    layout.cancel = { x: layout.dialog.x + 20, y: layout.dialog.y + 190, w: (layout.dialog.w - 50) / 2, h: 42 }
    layout.confirm = { x: layout.dialog.x + layout.dialog.w / 2 + 5, y: layout.dialog.y + 190, w: (layout.dialog.w - 50) / 2, h: 42 }
    layout.next = null
    layout.nextEnabled = false
  }
}

function drawLevelPicker(c, layout, levels, currentId) {
  const { picker } = layout
  c.fillStyle = 'rgba(52,55,33,.5)'; c.fillRect(0, 0, layout.width, layout.height)
  box(c, picker, gradient(c, picker.x, picker.y, picker.w, picker.h, ['#f8edc9', '#d8cc9b']), 16, '#767348')
  box(c, { x: picker.x + 5, y: picker.y + 5, w: picker.w - 10, h: picker.h - 10 }, null, 12, 'rgba(255,255,224,.45)')
  const cx = picker.x + picker.w / 2
  text(c, '选择关卡', cx, picker.y + 28, 22, SCENE.ink, 'center', true)
  text(c, '26 关基础教学 + 20 关 XSokoban 挑战 · 独立存档', cx, picker.y + 54, 10, '#6f6945', 'center')
  text(c, '×', layout.close.x + layout.close.w / 2, layout.close.y + layout.close.h / 2, 24, '#5c6041', 'center')
  const pageSize = 8; const pageCount = Math.ceil(levels.length / pageSize); const page = Math.min(pageCount - 1, layout.page || 0)
  const visible = levels.slice(page * pageSize, page * pageSize + pageSize)
  layout.rows.length = 0
  const outer = 14; const gutter = 12; const columnW = (picker.w - outer * 2 - gutter) / 2
  visible.forEach((level, index) => {
    const row = { id: level.id, x: picker.x + outer + (index % 2) * (columnW + gutter), y: picker.y + 72 + Math.floor(index / 2) * 54, w: columnW, h: 46 }
    layout.rows.push(row)
    box(c, row, level.id === currentId ? 'rgba(224,133,126,.26)' : 'rgba(255,249,221,.7)', 9, level.id === currentId ? '#b95c65' : '#b7aa73')
    text(c, `${level.order}. ${level.name}`, row.x + 9, row.y + 16, 12, level.id === currentId ? '#7d3542' : SCENE.ink, 'left', true)
    text(c, `${level.chapter} · ${level.template} · ≥${level.minimumPushes} 推`, row.x + 9, row.y + 35, 8.5, '#6f6945')
  })
  layout.prev = { x: picker.x + 16, y: picker.y + picker.h - 40, w: 70, h: 28 }
  layout.next = { x: picker.x + picker.w - 86, y: picker.y + picker.h - 40, w: 70, h: 28 }
  stoneButton(c, layout.prev, '‹ 上一页', false, page > 0); stoneButton(c, layout.next, '下一页 ›', false, page < pageCount - 1)
  text(c, `${page + 1} / ${pageCount}`, cx, picker.y + picker.h - 21, 10, '#6f6945', 'center')
}

function stoneButton(c, rect, label, accent = false, enabled = true) {
  c.save()
  if (!enabled) c.globalAlpha = .4
  c.shadowColor = 'rgba(81,65,29,.2)'; c.shadowBlur = 5; c.shadowOffsetY = 2
  box(c, rect, gradient(c, rect.x, rect.y, rect.w, rect.h, accent ? ['#df8a31', '#b85a1b'] : ['#f6edc9', '#d8c898']), 8, accent ? '#8e4818' : '#a79a65')
  c.shadowColor = 'transparent'
  box(c, { x: rect.x + 2, y: rect.y + 2, w: rect.w - 4, h: rect.h - 4 }, null, 6, 'rgba(255,255,222,.42)')
  text(c, label, rect.x + rect.w / 2, rect.y + rect.h / 2, 12, accent ? '#fff3d0' : SCENE.ink, 'center', true)
  c.restore()
}

function drawDirectionPad(c, layout) {
  const pad = layout.pad
  const outer = { x: pad.left.x - 7, y: pad.up.y - 7, w: pad.right.x + pad.right.w - pad.left.x + 14, h: pad.down.y + pad.down.h - pad.up.y + 14 }
  box(c, outer, gradient(c, outer.x, outer.y, outer.w, outer.h, ['#b2aa73', '#777547']), 13, '#5c5e3d')
  box(c, { x: outer.x + 4, y: outer.y + 4, w: outer.w - 8, h: outer.h - 8 }, null, 10, 'rgba(255,255,220,.32)')
  for (const [direction, label] of [['up', '↑'], ['left', '←'], ['down', '↓'], ['right', '→']]) {
    const rect = pad[direction]
    c.save(); c.shadowColor = 'rgba(81,65,29,.28)'; c.shadowBlur = 4; c.shadowOffsetY = 2
    box(c, rect, gradient(c, rect.x, rect.y, rect.w, rect.h, ['#fff2c8', '#d9c98f']), 9, '#8b8353')
    c.shadowColor = 'transparent'; box(c, { x: rect.x + 2, y: rect.y + 2, w: rect.w - 4, h: rect.h - 4 }, null, 7, 'rgba(255,255,228,.5)')
    text(c, label, rect.x + rect.w / 2, rect.y + rect.h / 2, 23, '#4e563c', 'center', true)
    c.restore()
  }
}

function draw({ c, layout, state, modal, best, level, board, pickerOpen, pickerLevels, pickerLayout, hasNextLevel, deadlockReason }) {
  drawScene(c, layout)
  drawHeader(c, layout, level, state)
  drawMap(c, layout, state, board)
  const matched = state.boxes.filter(position => board.goals.has(position)).length
  const status = deadlockReason || `目标归位 ${matched}/${state.boxes.length} · ${level.hint}`
  text(c, status, layout.width / 2, layout.board.y + layout.board.h + 36, 10, deadlockReason ? '#ffd28b' : '#f1d4a3', 'center')
  stoneButton(c, layout.undo, '↶  悔棋', false, state.steps > 0)
  stoneButton(c, layout.reset, '重新开始', true)
  stoneButton(c, layout.exit, '退出棋局', false)
  drawDirectionPad(c, layout)
  if (modal) drawDialog(c, layout, modal, state, best, level, hasNextLevel)
  if (pickerOpen) drawLevelPicker(c, pickerLayout, pickerLevels, level.id)
}

module.exports = { draw, drawLevelPicker, drawGoal, drawCrate, drawMover, drawVoid, drawWall, drawFloor }
