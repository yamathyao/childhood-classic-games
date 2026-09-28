const { background, box, text, button, selectionButton, palette } = require('../../common/canvas.js')
const { drawCover } = require('./renderer.js')
const { create } = require('./rules.js')
const { levels } = require('./levels.js')

function drawDetail(context, screen, level) {
  const { width, height, top, bottom } = screen
  background(context, width, height)
  const back = { x: 18, y: top + 5, w: 105, h: 32 }
  text(context, '‹  游戏合集', back.x + 4, back.y + 16, 13, palette.muted)
  text(context, '钻地挑战', 24, top + 66, 31, palette.ink, 'left', true)
  text(context, '初代街机玩法 · 连续深井挑战', 26, top + 98, 13, palette.muted)
  const cover = { x: 20, y: top + 120, w: width - 40, h: Math.min(280, (height - top - bottom) * .32) }
  box(context, cover, '#17303e', 16, '#929b81')
  drawCover(context, { x: cover.x + 18, y: cover.y + 16, w: cover.w - 36, h: cover.h - 32 })
  const select = { x: 22, y: height - bottom - 56, w: (width - 54) / 2, h: 44 }
  const enter = { x: select.x + select.w + 10, y: select.y, w: select.w, h: 44 }
  const infoY = cover.y + cover.h + 19
  text(context, `${level.name} · ${level.subtitle} · 3 次生命`, 24, infoY, 15, palette.wine, 'left', true)
  const lines = ['四色矿层不断深入，落块连成 4 格消除。', '氧气实时减少；O₂ 补给恢复 20 点。', '棕色 × 钻 5 次才碎，并扣除 20 点氧气。']
  lines.forEach((line, index) => text(context, line, 24, infoY + 32 + index * 25, Math.min(14, (width - 48) / 23), palette.ink))
  let saved = null
  try { const rules = create(level); saved = rules.restore(wx.getStorageSync(rules.saveKey)) } catch (error) {}
  selectionButton(context, select, '选择关卡')
  button(context, enter, saved && ['playing', 'respawn'].includes(saved.status) && saved.steps > 0 ? `继续 · ${saved.depth} 米` : '进入游戏  →', true)
  return { back, select, enter }
}

function drawPicker(context, screen, selectedId, page) {
  const { width, height, top, bottom } = screen
  const panel = { x: 18, y: top + 54, w: width - 36, h: Math.min(400, height - top - bottom - 76) }
  const result = { rows: [], close: { x: width - 70, y: panel.y + 10, w: 40, h: 36 } }
  context.fillStyle = 'rgba(15,31,39,.7)'; context.fillRect(0, 0, width, height)
  box(context, panel, '#f3e9d5', 16, '#ad9669')
  text(context, '选择挑战', width / 2, panel.y + 29, 23, palette.ink, 'center', true)
  text(context, '×', result.close.x + 20, result.close.y + 18, 24, palette.muted, 'center')
  text(context, '500 / 1000 米 · 独立存档', width / 2, panel.y + 60, 12, palette.muted, 'center')
  levels.forEach((level, index) => {
    const rect = { id: level.id, x: panel.x + 16, y: panel.y + 88 + index * 100, w: panel.w - 32, h: 84 }
    result.rows.push(rect)
    box(context, rect, selectedId === level.id ? '#d5e2d9' : '#fff8e9', 8, selectedId === level.id ? '#548579' : '#c9b996')
    text(context, `${level.name} · ${level.subtitle}`, rect.x + 16, rect.y + 27, 19, palette.ink, 'left', true)
    text(context, level.order === 1 ? '5 段矿层 · 熟悉补给与落块节奏' : '10 段矿层 · 更多硬块，更紧迫的氧气', rect.x + 16, rect.y + 58, 12, palette.muted)
  })
  text(context, '重新挑战生成新矿井，继续游戏保留布局', width / 2, panel.y + panel.h - 34, 12, palette.muted, 'center')
  return result
}

module.exports = { drawDetail, drawPicker }
