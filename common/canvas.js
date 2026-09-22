const palette = {
  paper: '#efe6d4', ink: '#292e2c', muted: '#7f7668', gold: '#c3a36a',
  wine: '#843d32', wood: '#342920', light: '#faf4e6'
}

// Use baseline Canvas paths: roundRect is inconsistent across WeChat versions.
function path(c, x, y, w, h, radius = 8) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2))
  c.beginPath()
  c.moveTo(x + r, y)
  c.lineTo(x + w - r, y)
  c.quadraticCurveTo(x + w, y, x + w, y + r)
  c.lineTo(x + w, y + h - r)
  c.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  c.lineTo(x + r, y + h)
  c.quadraticCurveTo(x, y + h, x, y + h - r)
  c.lineTo(x, y + r)
  c.quadraticCurveTo(x, y, x + r, y)
  c.closePath()
}

function box(c, rect, fill, radius = 8, stroke) {
  path(c, rect.x, rect.y, rect.w, rect.h, radius)
  if (fill) { c.fillStyle = fill; c.fill() }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1; c.stroke() }
}

function text(c, value, x, y, size = 14, color = palette.ink, align = 'left', serif = false) {
  c.fillStyle = color
  c.font = `${serif ? '600' : '400'} ${size}px ${serif ? '"STKaiti", "KaiTi", "Songti SC", "SimSun", serif' : 'sans-serif'}`
  c.textAlign = align
  c.textBaseline = 'middle'
  c.fillText(String(value), x, y)
}

function gradient(c, x, y, w, h, colors) {
  const value = c.createLinearGradient(x, y, x + w, y + h)
  colors.forEach((color, i) => value.addColorStop(i / (colors.length - 1), color))
  return value
}

function background(c, width, height) {
  c.clearRect(0, 0, width, height)
  c.fillStyle = gradient(c, 0, 0, width, height, ['#f5efdf', '#e5d7bd'])
  c.fillRect(0, 0, width, height)
  // Deterministic fine paper flecks, with no random shimmer on repaint.
  c.fillStyle = 'rgba(81,57,26,.035)'
  for (let y = 3; y < height; y += 7) {
    for (let x = (y * 19) % 17; x < width; x += 17) c.fillRect(x, y, 1, 1)
  }
}

function contains(rect, touch) {
  return rect && touch && touch.clientX >= rect.x && touch.clientX < rect.x + rect.w &&
    touch.clientY >= rect.y && touch.clientY < rect.y + rect.h
}

function button(c, rect, label, primary = false, enabled = true) {
  c.save()
  if (!enabled) c.globalAlpha = .4
  box(c, rect, primary ? palette.ink : 'rgba(255,251,240,.62)', 9, primary ? '#454b43' : '#c6b594')
  text(c, label, rect.x + rect.w / 2, rect.y + rect.h / 2, 14,
    primary ? palette.light : palette.ink, 'center')
  c.restore()
}

function selectionButton(c, rect, label = '选择对局') {
  c.save()
  c.shadowColor = 'rgba(86, 54, 25, .18)'
  c.shadowBlur = 8
  c.shadowOffsetY = 3
  box(c, rect, gradient(c, rect.x, rect.y, rect.w, rect.h, ['#fff8e9', '#ead5ad']), 11, '#b59158')
  c.shadowColor = 'transparent'
  box(c, { x: rect.x + 1.5, y: rect.y + 1.5, w: rect.w - 3, h: rect.h - 3 }, null, 9, 'rgba(255,255,255,.72)')
  c.fillStyle = 'rgba(126, 86, 37, .14)'
  c.beginPath()
  c.arc(rect.x + 18, rect.y + rect.h / 2, 7, 0, Math.PI * 2)
  c.fill()
  c.strokeStyle = '#9b7742'
  c.lineWidth = 1
  c.beginPath()
  c.arc(rect.x + 18, rect.y + rect.h / 2, 4, 0, Math.PI * 2)
  c.stroke()
  text(c, label, rect.x + 31, rect.y + rect.h / 2, 13, palette.ink, 'left', true)
  c.strokeStyle = '#8d6c3c'
  c.lineWidth = 1.4
  c.beginPath()
  c.moveTo(rect.x + rect.w - 19, rect.y + rect.h / 2 - 4)
  c.lineTo(rect.x + rect.w - 15, rect.y + rect.h / 2)
  c.lineTo(rect.x + rect.w - 19, rect.y + rect.h / 2 + 4)
  c.stroke()
  c.restore()
}

module.exports = { palette, path, box, text, gradient, background, contains, button, selectionButton }
