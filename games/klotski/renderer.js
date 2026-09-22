const { palette: P, path, box, text, gradient, background, button, headerButton } = require('../../common/canvas.js')
const { drawLetter } = require('./lettering.js')

const finishes = {
  cao: ['#b96545', '#7e4032', '#452822'],
  guan: ['#719a86', '#3e6657', '#203f37'],
  horizontal: ['#6f9185', '#405f56', '#243b36'],
  general: ['#8790aa', '#4d5874', '#29334b'],
  zhang: ['#8790aa', '#4d5874', '#29334b'],
  ma: ['#c2a466', '#80693d', '#443820'],
  zhao: ['#789ba4', '#4d7079', '#2e4b54'],
  huang: ['#ad8b98', '#6d5262', '#42333e'],
  soldier: ['#d0a66a', '#93683c', '#503a29']
}

function drawWood(c, piece, x, y, w, h) {
  const seed = Array.from(piece.id).reduce((value, letter) => value + letter.charCodeAt(0), 0)
  // Grain stays fixed to each tile; irregular spacing avoids a striped texture.
  for (let n = 0; n < 24; n++) {
    const grainX = x + w * (n / 24 + Math.sin(n * 2.3 + seed) * .014)
    const bend = Math.sin(seed + n * .7) * w * .045
    c.lineWidth = n % 4 === 0 ? 1 : .45
    c.strokeStyle = n % 3 === 0 ? 'rgba(38,23,13,.13)' : 'rgba(255,225,174,.09)'
    c.beginPath()
    c.moveTo(grainX, y)
    c.quadraticCurveTo(grainX + bend, y + h * .3, grainX - bend * .4, y + h * .6)
    c.quadraticCurveTo(grainX - bend, y + h * .8, grainX + bend * .5, y + h)
    c.stroke()
  }
  const knotX = x + w * (.18 + seed % 5 * .12)
  const knotY = y + h * (.2 + seed % 3 * .14)
  for (let n = 1; n <= 3; n++) {
    const rx = w * .018 * n
    const ry = h * .042 * n
    c.strokeStyle = 'rgba(49,28,16,.09)'
    c.lineWidth = .6
    c.beginPath()
    c.moveTo(knotX, knotY - ry)
    c.quadraticCurveTo(knotX + rx * 2, knotY, knotX, knotY + ry)
    c.quadraticCurveTo(knotX - rx * 2, knotY, knotX, knotY - ry)
    c.stroke()
  }
  c.fillStyle = gradient(c, x, y, w * .6, h, ['rgba(255,238,199,.12)',
    'rgba(255,238,199,0)', 'rgba(22,15,11,.05)'])
  c.fillRect(x, y, w, h)
}

function drawPiece(c, piece, board, cell, selected, drag, portraits) {
  const offsetX = drag && drag.id === piece.id && drag.axis === 'x' ? drag.offset : 0
  const offsetY = drag && drag.id === piece.id && drag.axis === 'y' ? drag.offset : 0
  const gap = Math.max(2, cell * .04)
  const rect = { x: board.x + piece.x * cell + gap + offsetX,
    y: board.y + piece.y * cell + gap + offsetY, w: piece.w * cell - gap * 2, h: piece.h * cell - gap * 2 }
  const { x, y, w, h } = rect
  const colors = finishes[piece.id] || finishes[piece.role] || finishes.soldier
  c.save()
  c.shadowColor = 'rgba(0,0,0,.35)'
  c.shadowBlur = selected === piece.id ? 10 : 3
  c.shadowOffsetY = 3
  box(c, rect, gradient(c, x, y, w, h, colors), 5)
  c.shadowColor = 'transparent'
  path(c, x, y, w, h, 5)
  c.clip()
  const portrait = portraits && portraits[piece.id]
  if (portrait) {
    const { image, sx, sy, sw, sh } = portrait
    const scale = Math.max(w / sw, h / sh)
    const cropW = w / scale
    const cropH = h / scale
    // Keep faces towards the upper part of portrait crops.
    c.drawImage(image, sx + (sw - cropW) / 2, sy + (sh - cropH) * .22,
      cropW, cropH, x, y, w, h)
    c.fillStyle = 'rgba(57,37,20,.08)'
    c.fillRect(x, y, w, h)
  } else {
    // The primary art direction is a carved wooden tile; the portrait atlas stays optional.
    drawWood(c, piece, x, y, w, h)
    const glyph = piece.role === 'soldier' ? '卒' : piece.name[0]
    c.shadowColor = 'rgba(38, 24, 13, .45)'
    c.shadowOffsetX = 1
    c.shadowOffsetY = 2
    c.shadowBlur = 0
    c.fillStyle = '#e4ce9e'
    drawLetter(c, glyph, x + w / 2, y + h * .40,
      Math.min(w * .72, h * .49))
    c.shadowColor = 'transparent'
  }
  const labelHeight = Math.max(20, Math.min(28, cell * .36))
  c.fillStyle = gradient(c, x, y + h - labelHeight - 12, 0, labelHeight + 12,
    ['rgba(20,19,15,0)', 'rgba(20,19,15,.58)'])
  c.fillRect(x, y + h - labelHeight - 12, w, labelHeight + 12)
  text(c, piece.name, x + w / 2, y + h - labelHeight * .5,
    Math.min(17, cell * .25), '#fff1d2', 'center', true)
  c.restore()
  c.save()
  // A light bevel, recessed groove and fine metal inlay give the edge depth.
  box(c, { x: x + 1, y: y + 1, w: w - 2, h: h - 2 }, null, 4,
    gradient(c, x, y, w * .3, h, ['#ead19b', '#97733f', '#594023']))
  box(c, { x: x + 3, y: y + 3, w: w - 6, h: h - 6 }, null, 3, 'rgba(34,22,13,.45)')
  const gold = gradient(c, x, y, w, h, ['#e4c68b', '#997744', '#cfb179', '#886337'])
  box(c, { x: x + 5, y: y + 5, w: w - 10, h: h - 10 }, null, 2, gold)
  c.strokeStyle = gold
  c.lineWidth = 1
  for (const [cx, cy, dx, dy] of [[x + 8, y + 8, 1, 1], [x + w - 8, y + 8, -1, 1],
    [x + 8, y + h - 8, 1, -1], [x + w - 8, y + h - 8, -1, -1]]) {
    const length = Math.min(7, cell * .1)
    c.beginPath()
    c.moveTo(cx, cy + dy * length)
    c.lineTo(cx, cy)
    c.lineTo(cx + dx * length, cy)
    c.stroke()
  }
  if (selected === piece.id) {
    c.save()
    path(c, x - 1, y - 1, w + 2, h + 2, 6)
    c.strokeStyle = '#f5d68b'
    c.lineWidth = 1.5
    c.stroke()
    c.restore()
  }
  c.restore()
}

function drawBoard(c, board, cell, pieces, selected, drag, portraits, omittedPiece) {
  const frame = { x: board.x - 12, y: board.y - 12, w: board.w + 24, h: board.h + 24 }
  c.save()
  c.shadowColor = 'rgba(48,31,17,.3)'
  c.shadowBlur = 22
  c.shadowOffsetY = 10
  box(c, frame, gradient(c, frame.x, frame.y, frame.w, frame.h, ['#67503b', '#35291f', '#5c4531']), 12)
  c.shadowColor = 'transparent'
  box(c, { x: frame.x + 3, y: frame.y + 3, w: frame.w - 6, h: frame.h - 6 }, null, 10, '#b79761')
  box(c, { x: frame.x + 7, y: frame.y + 7, w: frame.w - 14, h: frame.h - 14 }, null, 8, 'rgba(242,211,151,.5)')
  box(c, board, '#282923', 4, '#c4a975')
  c.save()
  path(c, frame.x, frame.y, frame.w, frame.h, 12)
  c.clip()
  c.strokeStyle = 'rgba(225,180,115,.07)'
  c.lineWidth = 1
  for (let i = 0; i < frame.h; i += 5) {
    c.beginPath()
    c.moveTo(frame.x, frame.y + i)
    c.quadraticCurveTo(frame.x + frame.w * .55, frame.y + i + 5, frame.x + frame.w, frame.y + i - 3)
    c.stroke()
  }
  c.restore()
  c.fillStyle = '#c7a86b'
  for (const [sx, sy] of [[frame.x + 7, frame.y + 7], [frame.x + frame.w - 7, frame.y + 7],
    [frame.x + 7, frame.y + frame.h - 7], [frame.x + frame.w - 7, frame.y + frame.h - 7]]) {
    c.beginPath(); c.arc(sx, sy, 1.4, 0, Math.PI * 2); c.fill()
  }
  for (let y = 0; y < 5; y++) for (let x = 0; x < 4; x++) {
    box(c, { x: board.x + x * cell + 2, y: board.y + y * cell + 2, w: cell - 4, h: cell - 4 },
      (x + y) % 2 ? '#33332b' : '#36372e', 2)
  }
  // A visible gap in the lower frame marks the two-cell exit.
  c.fillStyle = '#292b25'
  c.fillRect(board.x + cell + 2, board.y + board.h - 1, cell * 2 - 4, 14)
  const ordered = pieces.filter(p => p.id !== selected).concat(pieces.filter(p => p.id === selected))
  ordered.filter(piece => piece.id !== omittedPiece)
    .forEach(piece => drawPiece(c, piece, board, cell, selected, drag, portraits))
  c.restore()
}

function drawDialog(c, layout, type, steps, best, levelName, hasNextLevel) {
  const { width, height, dialog, cancel, confirm, next } = layout
  c.fillStyle = 'rgba(23,26,23,.58)'
  c.fillRect(0, 0, width, height)
  box(c, dialog, '#f4ecdc', 16, '#d9c298')
  const cx = dialog.x + dialog.w / 2
  const title = { reset: '重新开局', rules: `${levelName || '华容道'} · 玩法`, won: '成功解围' }[type]
  text(c, type === 'won' ? '过 关' : '华 容 道', cx, dialog.y + 29, 11, P.wine, 'center')
  text(c, title, cx, dialog.y + 63, 25, P.ink, 'center', true)
  const lines = type === 'rules'
    ? ['棋子只能上下左右平移，不能旋转。', '将曹操移到底部中央两格出口。', '同一棋子一次直线滑动计 1 步。', '悔棋会撤销上一步，并扣回步数。']
    : type === 'reset'
      ? ['本局的步数与棋盘将重置。', '取消后可以继续当前进度。']
      : [`本次完成：${steps} 步`, best ? `个人最佳：${best} 步` : '每一步，都为最后的出路。']
  lines.forEach((line, i) => text(c, line, cx, dialog.y + 105 + i * 21, 12, P.muted, 'center'))
  if (type === 'won') {
    const gap = 6; const buttonW = (dialog.w - 24 - gap * 2) / 3; const buttonX = dialog.x + 12; const buttonY = dialog.y + 190
    layout.cancel = { x: buttonX, y: buttonY, w: buttonW, h: 42 }
    layout.confirm = { x: buttonX + buttonW + gap, y: buttonY, w: buttonW, h: 42 }
    layout.next = { x: buttonX + (buttonW + gap) * 2, y: buttonY, w: buttonW, h: 42 }
    layout.nextEnabled = Boolean(hasNextLevel)
    button(c, cancel, '查看棋盘')
    button(c, confirm, '再来一局', true)
    button(c, next, '下一关', false, layout.nextEnabled)
  } else {
    layout.nextEnabled = false
    button(c, cancel, type === 'rules' ? '返回' : '取消')
    button(c, confirm, type === 'rules' ? '开始解局' : '确认重开', true)
  }
}

function drawLevelPicker(c, layout, levels, currentId) {
  const { width, height, picker } = layout
  c.fillStyle = 'rgba(23,26,23,.58)'; c.fillRect(0, 0, width, height)
  box(c, picker, '#f4ecdc', 16, '#d9c298')
  const centerX = picker.x + picker.w / 2
  text(c, '选择布局', centerX, picker.y + 28, 22, P.ink, 'center', true)
  text(c, '规则已核验 · 每个布局独立存档', centerX, picker.y + 54, 11, P.muted, 'center')
  text(c, '×', layout.levelClose.x + layout.levelClose.w / 2, layout.levelClose.y + layout.levelClose.h / 2, 24, P.muted, 'center')
  layout.levelRows.length = 0
  const pageSize = 8
  const pageCount = Math.max(1, Math.ceil(levels.length / pageSize))
  const page = Math.max(0, Math.min(pageCount - 1, layout.levelPage || 0))
  const visible = levels.slice(page * pageSize, page * pageSize + pageSize)
  const columns = 2
  const rowH = 54
  const outer = 14
  const gutter = 12
  const columnW = (picker.w - outer * 2 - gutter) / columns
  visible.forEach((level, index) => {
    const column = index % columns
    const line = Math.floor(index / columns)
    const row = { id: level.id, x: picker.x + outer + column * (columnW + gutter), y: picker.y + 72 + line * rowH, w: columnW, h: rowH - 8 }
    layout.levelRows.push(row)
    box(c, row, level.id === currentId ? 'rgba(132,61,50,.12)' : 'rgba(255,251,240,.72)', 9,
      level.id === currentId ? '#a36b57' : '#d7c7aa')
    text(c, level.name, row.x + 10, row.y + 17, 13, level.id === currentId ? P.wine : P.ink, 'left', true)
    text(c, level.subtitle, row.x + 10, row.y + 37, 9, P.muted)
    if (level.id === currentId) text(c, '当前', row.x + row.w - 8, row.y + 18, 9, P.wine, 'right')
  })
  layout.levelPrev = { x: picker.x + 16, y: picker.y + picker.h - 40, w: 70, h: 28 }
  layout.levelNext = { x: picker.x + picker.w - 86, y: picker.y + picker.h - 40, w: 70, h: 28 }
  button(c, layout.levelPrev, '‹ 上一页', false, page > 0)
  button(c, layout.levelNext, '下一页 ›', false, page < pageCount - 1)
  text(c, `${page + 1} / ${pageCount}`, picker.x + picker.w / 2, picker.y + picker.h - 21, 10, P.muted, 'center')
}

function formatDuration(elapsedMs) {
  const totalSeconds = Math.max(0, Math.floor((elapsedMs || 0) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function draw({ c, layout, state, elapsedMs, selected, drag, modal, portraits, best, storageWarning, omittedPiece, level, hasNextLevel,
  pickerOpen, pickerLayout, pickerLevels }) {
  const { width, height, top, board, cell } = layout
  background(c, width, height)
  headerButton(c, layout.back, '‹  游戏合集', { size: 10, color: P.ink })
  headerButton(c, layout.picker, '选关', { color: P.ink })
  headerButton(c, layout.help, '玩法', { color: P.ink })
  text(c, level ? level.name : '华容道', 25, top + 64, 31, P.ink, 'left', true)
  text(c, level ? level.subtitle : '一帅 · 五将 · 四兵', 26, top + 95, 12, P.muted)
  text(c, '计 时', width - 116, top + 52, 10, P.muted, 'center')
  text(c, formatDuration(elapsedMs), width - 116, top + 80, 20, P.wine, 'center', true)
  text(c, '步 数', width - 43, top + 52, 10, P.muted, 'center')
  text(c, String(state.steps).padStart(2, '0'), width - 43, top + 80, 28, P.wine, 'center', true)
  drawBoard(c, board, cell, state.pieces, selected, drag, portraits, omittedPiece)
  text(c, '↓  出 口', width / 2, board.y + board.h + 28, 11, P.muted, 'center')
  text(c, '将曹操移到底部中央 · 棋子不可旋转', width / 2, board.y + board.h + 47, 11, P.muted, 'center')
  button(c, layout.undo, '↶  悔棋', false, state.steps > 0)
  button(c, layout.reset, '重新开始', true)
  button(c, layout.exit, '退出棋局', false)
  text(c, storageWarning ? '本机保存不可用，请勿关闭游戏' : '进度自动保存在本机', width / 2,
    layout.exit.y + layout.exit.h + 16, 10, storageWarning ? P.wine : P.muted, 'center')
  if (modal) drawDialog(c, layout, modal, state.steps, best, level && level.name, hasNextLevel)
  if (pickerOpen && pickerLayout) drawLevelPicker(c, pickerLayout, pickerLevels || [], level && level.id)
}

// Cache the stationary scene while dragging. Only the moving tile is redrawn per frame.
// Older base libraries retain the same rendering through the direct Canvas fallback.
function createRenderer() {
  let surface = null
  let context = null
  let cachedLayout = null
  let cachedKey = null
  let disabled = typeof wx === 'undefined'

  function createSurface(layout, mainContext) {
    const dpr = layout.dpr || 1
    const width = Math.ceil(layout.width * dpr)
    const height = Math.ceil(layout.height * dpr)
    if (typeof wx.createOffscreenCanvas === 'function') {
      const factories = [
        () => wx.createOffscreenCanvas({ type: '2d', width, height }),
        () => wx.createOffscreenCanvas()
      ]
      for (const factory of factories) {
        try {
          const candidate = factory()
          if (!candidate || candidate === mainContext || !candidate.getContext) continue
          try { candidate.width = width; candidate.height = height } catch (error) {}
          const candidateContext = candidate.getContext('2d') || candidate.getContext()
          if (candidateContext && candidateContext !== mainContext) {
            candidateContext.scale(dpr, dpr)
            return { surface: candidate, context: candidateContext }
          }
        } catch (error) {}
      }
    }
    // Older game runtimes can expose only createCanvas. Use it as an offscreen
    // surface when it returns a distinct canvas; never paint the main canvas
    // into itself, which would make the drag cache ineffective.
    if (typeof wx.createCanvas === 'function') {
      try {
        const candidate = wx.createCanvas()
        if (candidate && candidate !== mainContext && candidate.getContext) {
          candidate.width = width
          candidate.height = height
          const candidateContext = candidate.getContext('2d')
          if (candidateContext && candidateContext !== mainContext) {
            candidateContext.scale(dpr, dpr)
            return { surface: candidate, context: candidateContext }
          }
        }
      } catch (error) {}
    }
    return null
  }

  function dispose() {
    if (surface) { surface.width = 1; surface.height = 1 }
    surface = null
    context = null
    cachedLayout = null
    cachedKey = null
  }

  return {
    draw(args) {
      if (disabled || !args.selected || args.modal || args.pickerOpen) { cachedKey = null; draw(args); return }
      const { c, layout, state, selected, drag, portraits } = args
      try {
        if (!surface || cachedLayout !== layout) {
          dispose()
          const created = createSurface(layout, c)
          if (!created) {
            disabled = true
            draw(args)
            return
          }
          surface = created.surface
          context = created.context
          cachedLayout = layout
        }
        const key = [selected, state.steps, formatDuration(args.elapsedMs), args.storageWarning,
          args.best, ...state.pieces.map(p => `${p.id}:${p.x}:${p.y}`)].join('|')
        if (key !== cachedKey) {
          draw({ ...args, c: context, omittedPiece: selected })
          cachedKey = key
        }
        c.clearRect(0, 0, layout.width, layout.height)
        c.drawImage(surface, 0, 0, surface.width, surface.height, 0, 0, layout.width, layout.height)
        const piece = state.pieces.find(p => p.id === selected)
        if (piece) drawPiece(c, piece, layout.board, layout.cell, selected, drag, portraits)
      } catch (error) {
        disabled = true
        dispose()
        draw(args)
      }
    },
    dispose
  }
}

module.exports = { draw, drawBoard, formatDuration, createRenderer, drawLevelPicker }
