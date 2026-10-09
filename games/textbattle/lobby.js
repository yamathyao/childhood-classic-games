const { background, text, button, box, palette: P } = require('../../common/canvas.js')
const { drawCover } = require('./renderer.js')
const { loadProgress } = require('./rules.js')
function drawDetail(c, screen, art) {
  const { width, height, top, bottom } = screen
  background(c, width, height)
  const back = { x: 18, y: top + 5, w: 105, h: 32 }
  text(c, '‹  游戏合集', 22, top + 21, 13, P.muted)
  text(c, '文字对战', 24, top + 70, 31, P.ink, 'left', true)
  text(c, '武器克制 · 自动轻技能 · 连胜挑战', 26, top + 101, 12, P.muted)
  const cover = { x: 20, y: top + 124, w: width - 40, h: Math.min(260, (height - top - bottom) * .34) }
  drawCover(c, cover, art)
  const enter = { x: 24, y: height - bottom - 68, w: width - 48, h: 44 }
  const info = { x: 20, y: cover.y + cover.h + 16, w: width - 40, h: enter.y - cover.y - cover.h - 32 }
  box(c, info, 'rgba(255,250,237,.74)', 12, '#d0bea0')
  text(c, '玩法说明', info.x + 14, info.y + 22, 15, P.wine, 'left', true)
  const lines = ['首战选择武器，后续战斗仅调整姿态。', '伤害、受击、暴击与闪避积攒武势。', '胜利后三选一强化，满血挑战下一战。']
  lines.forEach((line, i) => text(c, line, info.x + 14, info.y + 51 + i * 24, 13, P.ink))
  if (info.h > 145) text(c, '单人挑战 · 可暂停 · 本机自动存档', info.x + 14, info.y + 137, 12, P.muted)
  const saved = loadProgress(key => wx.getStorageSync(key))
  button(c, enter, saved ? `继续挑战 · ${saved.streak} 连胜` : '进入游戏  →', true)
  return { back, enter, select: null }
}
module.exports = { drawDetail }
