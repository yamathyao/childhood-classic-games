const { text, box } = require('../../common/canvas.js')
const { drawCover } = require('./renderer.js')
const { restore, SAVE_KEY } = require('./rules.js')

function drawDetail(c, screen) {
  const { width, height, top, bottom } = screen
  c.clearRect(0, 0, width, height); c.fillStyle = '#fff'; c.fillRect(0, 0, width, height)
  const back = { x: 16, y: top + 4, w: 110, h: 36 }
  text(c, '‹  游戏合集', back.x + 5, back.y + 18, 13, '#171717')
  text(c, '办公室投篮', 23, top + 70, 30, '#171717')
  text(c, '一张废纸，一点闲暇。', 24, top + 103, 13, '#737373')
  const cover = { x: 22, y: top + 128, w: width - 44, h: Math.min(300, (height - top - bottom) * .36) }
  drawCover(c, cover)
  const infoY = cover.y + cover.h + 29
  const lines = ['上下左右滑动，调整投掷方向。', '按住圆点蓄力，松手投出纸团。', '纸团会堆叠，投偏太多同事会清理。']
  lines.forEach((line, index) => text(c, line, 24, infoY + index * 25, Math.min(13, (width - 48) / 22), '#171717'))
  let saved
  try { saved = restore(wx.getStorageSync(SAVE_KEY)) } catch (error) {}
  const enter = { x: 22, y: height - bottom - 61, w: width - 44, h: 44 }
  box(c, enter, '#171717', 2)
  text(c, saved && saved.throws ? `继续投篮 · 已投 ${saved.throws} 次` : '进入办公室  →', width / 2, enter.y + 22, 14, '#fff', 'center')
  return { back, enter, select: null }
}

module.exports = { drawDetail }
