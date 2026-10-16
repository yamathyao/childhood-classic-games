const { background, box, text } = require('../../common/canvas.js')
const { drawCover } = require('./cards.js')
const { SAVE_KEY, restore } = require('./rules.js')
function drawDetail(c, screen) {
  const { width, height, top, bottom } = screen
  background(c, width, height)
  const back = { x: 16, y: top + 4, w: 110, h: 36 }
  text(c, '‹  游戏合集', 21, top + 22, 13, '#273d35')
  text(c, '算 24 点', 24, top + 70, 31, '#273d35', 'left', true)
  text(c, '四张扑克牌，一道小小的脑筋体操。', 24, top + 103, 12, '#827d6b')
  const cover = { x: 24, y: top + 125, w: width - 48, h: Math.min(260, (height - top - bottom) * .33) }
  drawCover(c, cover)
  const lines = ['四个数字各用一次，加减乘除凑出 24。', '简单题、不限时，可以使用括号。', '点击牌面或专用键盘，填好算式验证。', '提示给思路，进度自动保存在本机。']
  lines.forEach((line, i) => text(c, line, 24, cover.y + cover.h + 25 + i * 23, Math.min(12, (width - 48) / 24), '#315747'))
  let saved
  try { const value = wx.getStorageSync(SAVE_KEY); if (value) saved = restore(value) } catch (error) {}
  const enter = { x: 22, y: height - bottom - 62, w: width - 44, h: 44 }
  box(c, enter, '#315747', 10)
  text(c, saved ? `继续计算 · 已解 ${saved.solved} 题` : '开始计算  →', width / 2, enter.y + 22, 14, '#fffaf0', 'center')
  return { back, enter, select: null }
}
module.exports = { drawDetail }
