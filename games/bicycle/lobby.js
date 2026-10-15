const { text, box } = require('../../common/canvas.js')
const { drawCover } = require('./renderer.js')
const { records, SAVE_KEY } = require('./rules.js')

function drawDetail(c, screen, art) {
  const { width, height, top, bottom } = screen
  c.clearRect(0, 0, width, height); c.fillStyle = '#edf1df'; c.fillRect(0, 0, width, height)
  const back = { x: 16, y: top + 4, w: 110, h: 36 }
  text(c, '‹  游戏合集', 21, top + 22, 13, '#243e36')
  text(c, '自行车大冒险', 23, top + 70, 30, '#243e36')
  text(c, '山风、跳台，还有下一次稳稳落地。', 24, top + 103, Math.min(12, (width - 48) / 24), '#698174')
  const available = height - top - bottom
  const cover = { x: 22, y: top + 124, w: width - 44, h: Math.min(286, available * .34) }
  drawCover(c, cover, art)
  const lines = ['轻点小跃起，跳台提供更大的腾空。', '长按加速后空翻，提前松手制动稳车。', '落下小坡横越公路，掠过铁路隧道顶。', '车轮稳落继续，撞击翻滚后结算成绩。']
  const font = Math.min(12, (width - 48) / 25)
  lines.forEach((row, i) => text(c, row, 24, cover.y + cover.h + 26 + i * 23, font, '#315746'))
  let best = records(null)
  try { best = records(wx.getStorageSync(SAVE_KEY)) } catch (error) {}
  const enter = { x: 22, y: height - bottom - 64, w: width - 44, h: 46 }
  text(c, `最长 ${best.distance} 米 · 最高 ${best.score} 分`, 24, enter.y - 21, 11, '#698174')
  box(c, enter, '#243e36', 12)
  text(c, '进入山野  →', width / 2, enter.y + 23, 15, '#f4f2db', 'center')
  return { back, enter, select: null }
}
module.exports = { drawDetail }
