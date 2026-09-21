const glyphs = require('./lettering-data.js')

// Render actual brush lettering as baseline Canvas paths, consistent across devices.
function drawLetter(c, value, x, y, size) {
  const glyph = glyphs[value]
  if (!glyph) return
  const scale = size / Math.max(glyph.w, glyph.h)
  const left = x - glyph.w * scale / 2
  const top = y - glyph.h * scale / 2
  c.beginPath()
  for (const [type, ...points] of glyph.paths) {
    if (type === 'Z') { c.closePath(); continue }
    const coords = points.map((point, index) => point * scale + (index % 2 ? top : left))
    if (type === 'M') c.moveTo(...coords)
    else if (type === 'L') c.lineTo(...coords)
    else if (type === 'C') c.bezierCurveTo(...coords)
  }
  c.fill()
}

module.exports = { drawLetter }
