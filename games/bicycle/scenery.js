const { text, box } = require('../../common/canvas.js')
const { drawProp } = require('./art.js')
const atlas = require('./atlas.js')
const rules = require('./rules.js')

function stroke(c, points, color, width) {
  c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y))
  c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke()
}
function prop(c, art, index, x, y, width) {
  const bounds = atlas[index]
  return drawProp(c, art, index, x, y, width, width * bounds[3] / bounds[2])
}
function drawScenery(c, art, from, to, px, py, scale) {
  // Camps stay sparse and behind the riding line.
  for (const item of rules.landmarks(from, to)) {
    if (item.kind !== 'camp') continue
    c.save(); c.globalAlpha = .76
    for (const [index, offset, width] of [[4, -80, 94], [5, 2, 36], [6, 68, 35], [7, -165, 28]]) {
      const x = item.x + offset
      prop(c, art, index, px(x), py(rules.terrain(x) - 4), width * scale)
    }
    prop(c, art, 15, px(item.x - 45), py(rules.terrain(item.x - 45) - 68), 120 * scale)
    c.restore()
  }
  for (const solid of rules.surfaces(from, to)) {
    if (solid.kind !== 'van') continue
    const x = px(solid.x); const y = py(solid.y); const w = solid.w * scale; const h = solid.h * scale
    c.save(); c.translate(x, y); c.rotate(solid.angle)
    if (!drawProp(c, art, 8, 0, 0, w, h)) {
      // Use the same silhouette when the atlas cannot be loaded.
      const cos = Math.cos(solid.angle); const sin = Math.sin(solid.angle)
      const local = point => [(point[0] - solid.x) * cos * scale + (point[1] - solid.y) * sin * scale,
        (-(point[0] - solid.x) * sin + (point[1] - solid.y) * cos) * scale]
      polygon(c, solid.hull.map(local), '#708780')
      box(c, { x: -w * .4, y: -h * .72, w: w * .7, h: 15 * scale }, '#42575e', 3 * scale)
      for (const hubX of [-27.4, 29.8]) {
        c.beginPath(); c.arc(hubX * scale, -7.6 * scale, 7.6 * scale, 0, Math.PI * 2); c.fillStyle = '#303b3d'; c.fill()
      }
    }
    c.restore()
  }
}
function polygon(c, points, color) {
  c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath()
  c.fillStyle = color; c.fill()
}
function carFront(c, x, y, size, color) {
  c.save(); c.translate(x, y); c.scale(size / 60, size / 60)
  box(c, { x: -29, y: -12, w: 9, h: 16 }, '#303b3d', 2)
  box(c, { x: 20, y: -12, w: 9, h: 16 }, '#303b3d', 2)
  polygon(c, [[-27, -4], [-26, -23], [-19, -43], [19, -43], [26, -23], [27, -4]], color)
  polygon(c, [[-18, -39], [18, -39], [22, -25], [-22, -25]], '#435b64')
  stroke(c, [[-15, -36], [8, -36]], '#9baeb0', 2)
  box(c, { x: -11, y: -14, w: 22, h: 7 }, '#354247', 1)
  for (const side of [-1, 1]) box(c, { x: side * 19 - 5, y: -18, w: 10, h: 5 }, '#eee2b2', 2)
  stroke(c, [[-23, -4], [23, -4]], '#a8afa5', 3)
  c.restore()
}
function highway(c, item, px, py, scale, time) {
  const left = item.lip; const right = item.deckEnd; const mid = (left + right) / 2; const y = item.deckY
  // A road seen across its width, receding below the actual riding plane.
  polygon(c, [[px(left), py(y)], [px(right), py(y)], [px(right + 26), py(y + 146)],
    [px(left - 26), py(y + 146)]], '#535b59')
  stroke(c, [[px(left), py(y)], [px(left - 26), py(y + 146)]], '#c9c7ae', 3 * scale)
  stroke(c, [[px(right), py(y)], [px(right + 26), py(y + 146)]], '#c9c7ae', 3 * scale)
  for (let depth = 17; depth < 140; depth += 32) stroke(c,
    [[px(mid), py(y + depth)], [px(mid), py(y + depth + 15)]], '#cbb889', 3 * scale)
  stroke(c, [[px(left), py(y + 3)], [px(right), py(y + 3)]], '#e0d2b0', 3 * scale)
  for (const [lane, phase, color] of [[-1, 0, '#b07d57'], [1, 72, '#74898a']]) {
    const depth = (time * 23 + phase) % 118
    carFront(c, px(mid + lane * (63 + depth * .12)), py(y + 42 + depth * .73), (30 + depth * .24) * scale, color)
  }
  // Short broken bollards leave the bicycle's traversal line unobstructed.
  for (const x of [left - 16, right + 16]) {
    stroke(c, [[px(x), py(y + 4)], [px(x), py(y - 18)]], '#d5cbb2', 4 * scale)
    stroke(c, [[px(x), py(y - 5)], [px(x), py(y - 11)]], '#464e4a', 4 * scale)
  }
}
function tunnel(c, item, px, py, scale) {
  const mid = (item.lip + item.deckEnd) / 2; const y = item.deckY
  // Compress the foreground depth so the whole portal fits short screens.
  c.save(); c.translate(0, py(y)); c.scale(1, .82); c.translate(0, -py(y))
  const arch = (half, top, bottom, color) => {
    c.beginPath(); c.moveTo(px(mid - half), py(y + bottom)); c.lineTo(px(mid - half), py(y + top + 55))
    c.quadraticCurveTo(px(mid - half), py(y + top), px(mid), py(y + top))
    c.quadraticCurveTo(px(mid + half), py(y + top), px(mid + half), py(y + top + 55))
    c.lineTo(px(mid + half), py(y + bottom)); c.closePath(); c.fillStyle = color; c.fill()
  }
  arch(100, 18, 156, '#a39d86'); arch(85, 32, 156, '#343e40'); arch(69, 44, 156, '#273439')
  // Masonry follows the opening; the deck above is the real bicycle surface.
  for (let i = 0; i < 9; i++) {
    const angle = Math.PI + i / 8 * Math.PI
    stroke(c, [[px(mid + Math.cos(angle) * 87), py(y + 89 + Math.sin(angle) * 57)],
      [px(mid + Math.cos(angle) * 100), py(y + 89 + Math.sin(angle) * 71)]], '#746f60', 2 * scale)
  }
  for (const side of [-1, 1]) stroke(c, [[px(mid + side * 18), py(y + 105)],
    [px(mid + side * 65), py(y + 190)]], '#aaa99a', 3 * scale)
  for (let depth = 120; depth < 190; depth += 17) {
    const half = 20 + (depth - 105) * .55
    stroke(c, [[px(mid - half), py(y + depth)], [px(mid + half), py(y + depth)]], '#77705d', 4 * scale)
  }
  // Frontal train section within the tunnel, never a rideable carriage roof.
  box(c, { x: px(mid - 33), y: py(y + 66), w: 66 * scale, h: 73 * scale }, '#ae8c5f', 12 * scale)
  box(c, { x: px(mid - 27), y: py(y + 75), w: 54 * scale, h: 27 * scale }, '#536b71', 5 * scale)
  stroke(c, [[px(mid), py(y + 76)], [px(mid), py(y + 101)]], '#9b9d86', 3 * scale)
  stroke(c, [[px(mid - 28), py(y + 110)], [px(mid + 28), py(y + 110)]], '#d7c097', 3 * scale)
  for (const side of [-1, 1]) box(c, { x: px(mid + side * 22 - 5), y: py(y + 116), w: 10 * scale, h: 7 * scale }, '#f1db9f', 3 * scale)
  box(c, { x: px(mid - 23), y: py(y + 132), w: 46 * scale, h: 10 * scale }, '#3b4747', 2 * scale)
  stroke(c, [[px(item.lip), py(y + 6)], [px(item.deckEnd), py(y + 6)]], '#a9a18a', 10 * scale)
  stroke(c, [[px(item.lip), py(y)], [px(item.deckEnd), py(y)]], '#d9c8a3', 3 * scale)
  c.restore()
}
function drawRoute(c, art, from, to, px, py, scale, time = 0) {
  for (const route of rules.routes(from, to)) {
    if (route.kind === 'camp') continue
    if (route.deckEnd + 100 < from || route.lip - 100 > to) continue
    if (route.kind === 'highway') highway(c, route, px, py, scale, time)
    else tunnel(c, route, px, py, scale)
  }
}
function drawLandmarkSigns(c, from, to, px, py, scale) {
  for (const item of rules.routes(from, to)) {
    const x = item.start - 45; const y = rules.terrain(x)
    stroke(c, [[px(x), py(y)], [px(x), py(y - 50)]], '#765f46', 3 * scale)
    box(c, { x: px(x) - 37 * scale, y: py(y - 62), w: 74 * scale, h: 22 * scale }, '#ded1ad', 3 * scale)
    text(c, item.name, px(x), py(y - 51), 11 * scale, '#304749', 'center')
  }
}
module.exports = { drawScenery, drawRoute, drawLandmarkSigns }
