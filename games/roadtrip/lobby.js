const { background, box, text } = require('../../common/canvas.js')
const { drawCover } = require('./renderer.js')
const store = require('./storage.js')
function drawDetail(c, screen) {
  const { width, height, top, bottom } = screen
  background(c, width, height)
  const back = { x: 16, y: top + 4, w: 110, h: 36 }
  text(c, '‹  游戏合集', 21, top + 22, 13, '#304b40')
  text(c, '滴滴叭叭', 24, top + 70, 31, '#304b40', 'left', true)
  text(c, '穿过街区、田野，邂逅下一处风景。', 24, top + 103, 12, '#808675')
  const cover = { x: 24, y: top + 125, w: width - 48, h: Math.min(260, (height - top - bottom) * .31) }
  drawCover(c, cover)
  const lines = ['六辆特色座驾 · 自动巡航 / 手动驾驶', '右侧匝道入场，沿途弯道与车道变化。', '里程与漂亮穿梭得分，超速抓拍扣分。', '每 1.6km 可从右匝道驶出，结束结算。']
  lines.forEach((line, i) => text(c, line, 24, cover.y + cover.h + 24 + i * 22, Math.min(12, (width - 48) / 24), '#315747'))
  let records = store.records(null)
  try { records = store.records(wx.getStorageSync(store.RECORDS_KEY)) } catch (error) {}
  const enter = { x: 22, y: height - bottom - 62, w: width - 44, h: 44 }
  if (enter.y > cover.y + cover.h + 130) text(c, `最高 ${records.bestScore} 分 · 最远 ${(records.bestDistance / 1000).toFixed(2)}km`, 24, enter.y - 22, 11, '#808675')
  box(c, enter, '#46634c', 10); text(c, '选择座驾  →', width / 2, enter.y + 22, 14, '#fffaf0', 'center')
  return { back, enter, select: null }
}
module.exports = { drawDetail }
