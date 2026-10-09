const { palette: P, path, box, text, button } = require('../../common/canvas.js')

const games = [
  { id: 'klotski', name: '华容道', category: '经典益智' },
  { id: 'sokoban', name: '推箱子', category: '经典益智' },
  { id: 'tetris', name: '俄罗斯方块', category: '经典街机' },
  { id: 'driller', name: '钻地挑战', category: '矿层冒险' },
  { id: 'textbattle', name: '文字对战', category: '策略对战' }
]
const saveKey = 'collection.order.v1'
const longPressMs = 550

// Ignore removed/duplicate entries and append newly added games automatically.
function normalizeOrder(value) {
  const ids = games.map(game => game.id)
  const saved = Array.isArray(value) ? value : []
  return [...new Set(saved.filter(id => ids.includes(id)).concat(ids))]
}

function moveGame(order, id, index) {
  const result = order.filter(value => value !== id)
  result.splice(Math.max(0, Math.min(result.length, index)), 0, id)
  return result
}

function sortLayout(screen) {
  const { width, height, top, bottom } = screen
  const gap = 10
  const rowHeight = Math.min(104, (height - top - bottom - 208 - gap * (games.length - 1)) / games.length)
  const listTop = top + 108
  const rows = games.map((_, index) => ({ x: 22, y: listTop + index * (rowHeight + gap), w: width - 44, h: rowHeight }))
  const actionsY = height - bottom - 64
  return {
    rows, listTop, rowHeight, stride: rowHeight + gap,
    cancel: { x: 22, y: actionsY, w: (width - 56) / 2, h: 44 },
    done: { x: width / 2 + 6, y: actionsY, w: (width - 56) / 2, h: 44 },
    statusY: actionsY - 17
  }
}

function drawSort(c, screen, order, drag, selected, warning, drawPreview) {
  const view = sortLayout(screen)
  text(c, '游 戏 馆  /  自 定 义', 25, screen.top + 25, 11, P.wine)
  text(c, '排列你的游戏', 24, screen.top + 61, 26, P.ink, 'left', true)
  text(c, '按住任意卡片上下拖动，松手放置', 25, screen.top + 89, 12, P.muted)
  function drawRow(id, rect, index, floating = false) {
    const game = games.find(game => game.id === id)
    c.save()
    if (floating) { c.shadowColor = 'rgba(54,38,21,.22)'; c.shadowBlur = 16; c.shadowOffsetY = 5 }
    box(c, rect, floating ? '#fff9e9' : 'rgba(255,250,237,.85)', 13, floating || id === selected ? P.gold : '#d0bea0')
    c.shadowColor = 'transparent'
    const size = Math.min(64, rect.h - 12)
    const cover = { x: rect.x + 12, y: rect.y + (rect.h - size) / 2, w: size, h: size }
    box(c, cover, '#eadfc9', 8)
    c.save()
    path(c, cover.x, cover.y, size, size, 8); c.clip()
    c.translate(cover.x, cover.y); c.scale(size / 128, size / 128)
    // Render at a stable virtual size; existing covers use fixed tile insets.
    drawPreview(id, { x: 8, y: 8, w: 112, h: 112 })
    c.restore()
    const labelX = cover.x + size + 14
    text(c, game.name, labelX, rect.y + rect.h / 2 - 9, 17, P.ink, 'left', true)
    text(c, `${String(index + 1).padStart(2, '0')}  /  ${game.category}`, labelX, rect.y + rect.h / 2 + 13, 10, P.muted)
    const handleX = rect.x + rect.w - 23
    for (let row = -1; row <= 1; row++) for (const dx of [-3, 3]) {
      c.fillStyle = floating ? P.wine : '#a68c61'
      c.beginPath(); c.arc(handleX + dx, rect.y + rect.h / 2 + row * 6, 1.4, 0, Math.PI * 2); c.fill()
    }
    c.restore()
  }
  order.forEach((id, index) => {
    const rect = view.rows[index]
    if (drag && drag.id === id) {
      box(c, rect, 'rgba(195,163,106,.13)', 13, '#bda579')
      text(c, '放置到这里', rect.x + rect.w / 2, rect.y + rect.h / 2, 12, '#957444', 'center')
    } else drawRow(id, rect, index)
  })
  if (drag) drawRow(drag.id, { ...view.rows[0], y: drag.y }, order.indexOf(drag.id), true)
  text(c, warning || '完成后保存顺序 · 取消可放弃修改', screen.width / 2, view.statusY, 11, warning ? P.wine : P.muted, 'center')
  button(c, view.cancel, '取消')
  button(c, view.done, '完成', true)
  return view
}

module.exports = { games, saveKey, longPressMs, normalizeOrder, moveGame, sortLayout, drawSort }
