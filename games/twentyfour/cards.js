const { box, text } = require('../../common/canvas.js')
const SUITS = ['spade', 'heart', 'club', 'diamond']
const pair = rows => rows.flatMap(y => [[34, y], [66, y]])
const POSITIONS = { 1: [[50, 70]], 2: [[50, 39], [50, 101]], 3: [[50, 39], [50, 70], [50, 101]],
  4: pair([39, 101]), 5: [...pair([39, 101]), [50, 70]], 6: pair([39, 70, 101]),
  7: [...pair([39, 70, 101]), [50, 54]], 8: [...pair([39, 70, 101]), [50, 54], [50, 86]],
  9: [...pair([32, 57, 83, 108]), [50, 70]] }

function suit(c, kind, x, y, size, inverted = false) {
  c.save(); c.translate(x, y); c.scale(size / 10, size / 10)
  if (inverted) c.rotate(Math.PI)
  c.beginPath()
  if (kind === 'diamond') { c.moveTo(0, -10); c.lineTo(8, 0); c.lineTo(0, 10); c.lineTo(-8, 0) }
  else if (kind === 'heart' || kind === 'spade') {
    if (kind === 'spade') c.rotate(Math.PI)
    c.moveTo(0, 9); c.bezierCurveTo(-4, 5, -12, -1, -8, -6)
    c.bezierCurveTo(-5, -10, -1, -8, 0, -5); c.bezierCurveTo(1, -8, 5, -10, 8, -6)
    c.bezierCurveTo(12, -1, 4, 5, 0, 9)
  } else {
    for (const [cx, cy] of [[0, -5], [-5, 2], [5, 2]]) { c.moveTo(cx + 5, cy); c.arc(cx, cy, 5, 0, Math.PI * 2) }
  }
  c.closePath(); c.fill()
  if (kind === 'spade') c.rotate(Math.PI)
  if (kind === 'spade' || kind === 'club') {
    c.beginPath(); c.moveTo(0, 1); c.lineTo(-3, 10); c.lineTo(3, 10); c.closePath(); c.fill()
  }
  c.restore()
}
function drawCard(c, rect, number, index, used = false) {
  const color = index % 2 ? '#ae433b' : '#30332f'
  c.save(); c.shadowColor = 'rgba(80,65,34,.16)'; c.shadowBlur = 5; c.shadowOffsetY = 3
  box(c, rect, used ? '#e8ebdf' : '#fffdf7', 8, used ? '#acb9a0' : '#c9bfa8'); c.shadowColor = 'transparent'
  c.translate(rect.x, rect.y); c.scale(rect.w / 100, rect.h / 140)
  if (used) c.globalAlpha = .35
  c.fillStyle = color
  POSITIONS[number].forEach(([x, y]) => suit(c, SUITS[index], x, y, number === 1 ? 19 : 10, y > 70))
  for (let corner = 0; corner < 2; corner++) {
    c.save()
    if (corner) { c.translate(100, 140); c.rotate(Math.PI) }
    text(c, number, 14, 18, 22, color, 'center', true)
    c.fillStyle = color; suit(c, SUITS[index], 14, 35, 6)
    c.restore()
  }
  c.globalAlpha = 1
  if (used) { c.fillStyle = '#315747'; c.beginPath(); c.arc(50, 128, 7, 0, Math.PI * 2); c.fill(); text(c, '✓', 50, 128, 9, '#fff', 'center') }
  c.restore()
}
function drawCover(c, rect) {
  const cardW = Math.min(rect.w / 3.3, rect.h / 1.4)
  const total = cardW * 3.25; const x = rect.x + (rect.w - total) / 2
  ;[3, 4, 6, 2].forEach((number, i) => drawCard(c, { x: x + cardW * .75 * i, y: rect.y + (rect.h - cardW * 1.4) / 2, w: cardW, h: cardW * 1.4 }, number, i))
}
module.exports = { drawCard, drawCover }
