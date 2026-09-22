const { box, text, gradient, path, headerButton } = require('../../common/canvas.js')
const { WIDTH, HEIGHT, cellsFor, SHAPES } = require('./rules.js')

const PALETTE = {
  night: '#0c1429', night2: '#172646', panel: '#1c2c4d', grid: '#2b4164', brass: '#c9ab68', brassLight: '#f0d99a',
  ink: '#eaf1ff', muted: '#9fb1ce', button: '#243b64', buttonPressed: '#345686', overlay: 'rgba(5,10,24,.76)',
  blocks: {
    I: ['#39d6e5', '#117b99'], J: ['#6489f5', '#304da0'], L: ['#f3a64a', '#ae5b1d'], O: ['#f1d35c', '#aa7d19'],
    S: ['#5fd39a', '#218357'], T: ['#b27cf0', '#6636a2'], Z: ['#ee7182', '#a83e55']
  }
}

function formatScore(value) { return String(Math.max(0, Math.floor(value || 0))).padStart(6, '0') }

function tileRect(layout, x, y, inset = 0) {
  return { x: layout.board.x + x * layout.cell + inset, y: layout.board.y + y * layout.cell + inset,
    w: layout.cell - inset * 2, h: layout.cell - inset * 2 }
}

function drawBackdrop(c, layout) {
  c.clearRect(0, 0, layout.width, layout.height)
  c.fillStyle = gradient(c, 0, 0, layout.width, layout.height, ['#0b142a', '#182949'])
  c.fillRect(0, 0, layout.width, layout.height)
  c.fillStyle = 'rgba(194,171,104,.08)'
  for (let y = layout.top; y < layout.height; y += 18) for (let x = (y % 31); x < layout.width; x += 31) c.fillRect(x, y, 1, 1)
  c.fillStyle = 'rgba(222,198,125,.35)'; c.fillRect(0, layout.top + 95, layout.width, 1)
}

function drawHeader(c, layout, state) {
  const header = { fill: 'rgba(25,44,75,.92)', stroke: PALETTE.brass, color: PALETTE.ink, inner: 'rgba(255,232,164,.3)', shadow: 'rgba(0,0,0,.3)' }
  headerButton(c, layout.back, '‹  游戏合集', { ...header, size: 10 })
  headerButton(c, layout.reset, '重开', header)
  headerButton(c, layout.pause, '暂停', header)
  headerButton(c, layout.help, '玩法', header)
  text(c, '俄罗斯方块', 18, layout.top + 50, layout.compact ? 23 : 27, PALETTE.ink, 'left', true)
  text(c, '经典无尽 · 消行越多，速度越快', 20, layout.top + 76, 10, PALETTE.muted)
  drawStat(c, layout.stats.score, '分数', formatScore(state.score))
  drawStat(c, layout.stats.lines, '消行', String(state.lines).padStart(2, '0'))
  drawStat(c, layout.stats.level, '等级', String(state.level).padStart(2, '0'))
  box(c, layout.preview, 'rgba(31,50,85,.9)', 10, PALETTE.brass)
  text(c, '下一个', layout.preview.x + layout.preview.w / 2, layout.preview.y + 9, 8, PALETTE.muted, 'center')
  drawMiniPiece(c, layout.preview, state.queue[0])
}

function drawStat(c, rect, label, value) {
  box(c, rect, 'rgba(24,42,72,.9)', 7, 'rgba(201,171,104,.65)')
  text(c, label, rect.x + rect.w / 2, rect.y + 10, 8, PALETTE.muted, 'center')
  text(c, value, rect.x + rect.w / 2, rect.y + 28, 13, PALETTE.brassLight, 'center', true)
}

function drawFrame(c, layout) {
  const frame = { x: layout.board.x - 8, y: layout.board.y - 8, w: layout.board.w + 16, h: layout.board.h + 16 }
  c.save()
  c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 14; c.shadowOffsetY = 5
  box(c, frame, gradient(c, frame.x, frame.y, frame.w, frame.h, ['#d7bd79', '#796035']), 9, '#efd894')
  c.shadowColor = 'transparent'
  box(c, { x: frame.x + 4, y: frame.y + 4, w: frame.w - 8, h: frame.h - 8 }, '#0a1225', 6, 'rgba(255,235,164,.7)')
  c.restore()
}

function drawPlayfield(c, layout, state) {
  drawFrame(c, layout)
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
    const rect = tileRect(layout, x, y, 1)
    box(c, rect, (x + y) % 2 ? '#14223d' : '#172844', 2, 'rgba(95,126,170,.25)')
    const value = state.board[y * WIDTH + x]
    if (value) drawBlock(c, rect, value)
  }
  if (!state.gameOver && state.active) {
    let ghost = { ...state.active }
    while (canPlace(state, { ...ghost, y: ghost.y + 1 })) ghost = { ...ghost, y: ghost.y + 1 }
    for (const [x, y] of cellsFor(ghost)) if (y >= 0) drawBlock(c, tileRect(layout, x, y, 1), ghost.type, true)
    for (const [x, y] of cellsFor(state.active)) if (y >= 0) drawBlock(c, tileRect(layout, x, y, 1), state.active.type)
  }
}

function canPlace(state, active) {
  for (const [x, y] of cellsFor(active)) {
    if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return false
    if (state.board[y * WIDTH + x]) return false
  }
  return true
}

function drawBlock(c, rect, type, ghost = false) {
  const colors = PALETTE.blocks[type] || PALETTE.blocks.T
  c.save()
  if (ghost) {
    c.globalAlpha = .28
    box(c, rect, null, 2, colors[0])
    c.restore()
    return
  }
  box(c, rect, gradient(c, rect.x, rect.y, rect.w, rect.h, [colors[0], colors[1]]), 2, 'rgba(255,247,205,.85)')
  c.fillStyle = 'rgba(255,255,255,.36)'
  c.fillRect(rect.x + 2, rect.y + 2, Math.max(1, rect.w - 5), Math.max(1, rect.h * .12))
  c.fillStyle = 'rgba(0,0,0,.24)'
  c.fillRect(rect.x + 2, rect.y + rect.h - 3, Math.max(1, rect.w - 5), 2)
  c.restore()
}

function drawMiniPiece(c, rect, type) {
  if (!type || !SHAPES[type]) return
  const cells = SHAPES[type][0]
  const minX = Math.min(...cells.map(cell => cell[0])); const maxX = Math.max(...cells.map(cell => cell[0]))
  const minY = Math.min(...cells.map(cell => cell[1])); const maxY = Math.max(...cells.map(cell => cell[1]))
  const cell = Math.min(12, (rect.w - 12) / (maxX - minX + 1), (rect.h - 20) / (maxY - minY + 1))
  const width = cell * (maxX - minX + 1); const height = cell * (maxY - minY + 1)
  const ox = rect.x + (rect.w - width) / 2; const oy = rect.y + 17 + (rect.h - 17 - height) / 2
  for (const [x, y] of cells) drawBlock(c, { x: ox + (x - minX) * cell + 1, y: oy + (y - minY) * cell + 1, w: cell - 2, h: cell - 2 }, type)
}

function drawControls(c, layout) {
  button(c, layout.pad.left, '←')
  button(c, layout.pad.rotate, '↻', true)
  button(c, layout.pad.right, '→')
  button(c, layout.softDrop, '软降  ↓')
  button(c, layout.hardDrop, '硬降  ⇣', true)
}

function button(c, rect, label, primary = false, enabled = true) {
  c.save()
  if (!enabled) c.globalAlpha = .36
  box(c, rect, primary ? gradient(c, rect.x, rect.y, rect.w, rect.h, ['#3b6093', '#22385f']) : '#1a2d4e', 8,
    primary ? PALETTE.brassLight : 'rgba(142,168,205,.7)')
  text(c, label, rect.x + rect.w / 2, rect.y + rect.h / 2, 14, primary ? '#fff2c6' : PALETTE.ink, 'center', true)
  c.restore()
}

function modalButtons(layout, modal) {
  const d = layout.dialog
  if (modal === 'over') return {
    cancel: { x: d.x + 18, y: d.y + d.h - 54, w: (d.w - 46) / 2, h: 38 },
    confirm: { x: d.x + d.w / 2 + 5, y: d.y + d.h - 54, w: (d.w - 46) / 2, h: 38 }
  }
  if (modal === 'pause') return {
    cancel: { x: d.x + 18, y: d.y + d.h - 54, w: (d.w - 46) / 2, h: 38 },
    confirm: { x: d.x + d.w / 2 + 5, y: d.y + d.h - 54, w: (d.w - 46) / 2, h: 38 },
    extra: { x: d.x + 18, y: d.y + d.h - 100, w: d.w - 36, h: 34 }
  }
  return {
    cancel: { x: d.x + 18, y: d.y + d.h - 54, w: (d.w - 46) / 2, h: 38 },
    confirm: { x: d.x + d.w / 2 + 5, y: d.y + d.h - 54, w: (d.w - 46) / 2, h: 38 }
  }
}

function drawModal(c, layout, modal, state) {
  c.fillStyle = PALETTE.overlay; c.fillRect(0, 0, layout.width, layout.height)
  const d = layout.dialog
  box(c, d, gradient(c, d.x, d.y, d.w, d.h, ['#21365d', '#111e3c']), 14, PALETTE.brass)
  box(c, { x: d.x + 5, y: d.y + 5, w: d.w - 10, h: d.h - 10 }, null, 10, 'rgba(255,232,164,.35)')
  const buttons = modalButtons(layout, modal)
  if (modal === 'over') {
    text(c, '本局结束', d.x + d.w / 2, d.y + 40, 24, PALETTE.brassLight, 'center', true)
    text(c, `得分  ${formatScore(state.score)}`, d.x + d.w / 2, d.y + 82, 14, PALETTE.ink, 'center')
    text(c, `消行  ${state.lines}    等级  ${state.level}`, d.x + d.w / 2, d.y + 108, 12, PALETTE.muted, 'center')
    text(c, `最高分  ${formatScore(state.best)}`, d.x + d.w / 2, d.y + 134, 11, PALETTE.muted, 'center')
    button(c, buttons.cancel, '游戏合集')
    button(c, buttons.confirm, '再来一局', true)
  } else if (modal === 'pause') {
    text(c, '游戏暂停', d.x + d.w / 2, d.y + 38, 23, PALETTE.brassLight, 'center', true)
    text(c, '准备好后继续堆叠方块。', d.x + d.w / 2, d.y + 80, 12, PALETTE.muted, 'center')
    button(c, buttons.extra, '重新开始')
    button(c, buttons.cancel, '继续游戏', true)
    button(c, buttons.confirm, '游戏合集')
  } else if (modal === 'rules') {
    text(c, '玩法说明', d.x + d.w / 2, d.y + 36, 22, PALETTE.brassLight, 'center', true)
    const lines = ['左右滑动移动方块，点击棋盘旋转。', '下滑软降，上滑或按硬降直接落底。', '填满整行即可消除，等级越高速度越快。']
    lines.forEach((line, index) => text(c, line, d.x + d.w / 2, d.y + 78 + index * 24, 12, PALETTE.ink, 'center'))
    button(c, buttons.cancel, '返回游戏', true)
  } else {
    text(c, '重新开始？', d.x + d.w / 2, d.y + 42, 23, PALETTE.brassLight, 'center', true)
    text(c, '当前棋盘和分数会被清空。', d.x + d.w / 2, d.y + 86, 12, PALETTE.muted, 'center')
    button(c, buttons.cancel, '取消')
    button(c, buttons.confirm, '确认重开', true)
  }
}

function draw({ c, layout, state, modal }) {
  drawBackdrop(c, layout)
  drawHeader(c, layout, state)
  drawPlayfield(c, layout, state)
  drawControls(c, layout)
  if (modal) drawModal(c, layout, modal, state)
}

function drawCover(c, rect, options = {}) {
  const cell = Math.min(22, (rect.w - 30) / 10, (rect.h - 20) / 12)
  const board = { x: rect.x + (rect.w - cell * 10) / 2, y: rect.y + (rect.h - cell * 12) / 2, w: cell * 10, h: cell * 12 }
  const frame = options.compact
    ? { x: board.x - 8, y: board.y - 8, w: board.w + 16, h: board.h + 16 }
    : rect
  box(c, frame, gradient(c, frame.x, frame.y, frame.w, frame.h, ['#1c3155', '#0d172e']), 14, PALETTE.brass)
  for (let y = 0; y < 12; y++) for (let x = 0; x < 10; x++) box(c, { x: board.x + x * cell + 1, y: board.y + y * cell + 1, w: cell - 2, h: cell - 2 }, '#142441', 1, 'rgba(111,146,191,.24)')
  const blocks = [['T', 2, 2], ['T', 3, 2], ['T', 4, 2], ['T', 3, 1], ['I', 6, 5], ['I', 7, 5], ['I', 8, 5], ['I', 9, 5], ['O', 1, 8], ['O', 2, 8], ['O', 1, 9], ['O', 2, 9], ['L', 5, 9], ['L', 5, 10], ['L', 6, 10], ['L', 7, 10]]
  blocks.forEach(([type, x, y]) => drawBlock(c, { x: board.x + x * cell + 1, y: board.y + y * cell + 1, w: cell - 2, h: cell - 2 }, type))
}

module.exports = { PALETTE, draw, drawBlock, drawMiniPiece, drawCover, modalButtons, formatScore }
