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
// Depth is a visual offset into the hillside, never a change to the ride model.
function hillsideHeight(x) {
  const feature = rules.feature(Math.max(0, Math.floor(x / rules.SECTION)))
  // Wooden and shaped jumps belong to the trail; the hillside beside them
  // follows the natural slope instead of forming a tall wall behind the ramp.
  return feature.kind !== 'drop' && x >= feature.start && x < feature.end ? rules.baseHeight(x) : rules.terrain(x)
}
function roadside(px, py, x, depth) {
  return [px(x + depth * .38), py(hillsideHeight(x) - depth)]
}
function verge(c, px, py, x, halfWidth, depth, scale) {
  const back = []; const front = []
  for (let i = 0; i <= 8; i++) {
    const at = x - halfWidth + halfWidth * 2 * i / 8
    const taper = Math.min(1, i / 2, (8 - i) / 2)
    back.push(roadside(px, py, at, -8 + (depth + 8) * taper))
    front.push(roadside(px, py, at, -8))
  }
  polygon(c, back.concat(front.slice().reverse()), '#9eae86')
  stroke(c, back, '#c0c9a2', 2 * scale)
  // Cross-depth tufts make the broad grassy shoulder read as a ground plane.
  for (let i = 1; i < 5; i++) {
    const at = x - halfWidth + halfWidth * 2 * i / 5
    const [sx, sy] = roadside(px, py, at, depth * .35)
    stroke(c, [[sx - 4 * scale, sy + 2 * scale], [sx, sy - 2 * scale], [sx + 7 * scale, sy - scale]], '#869875', scale)
  }
}
function backgroundProp(c, art, index, x, depth, width, px, py, scale) {
  const [sx, sy] = roadside(px, py, x, depth)
  const w = width * scale
  // A flattened, skewed contact shadow anchors each sprite on the back plane.
  polygon(c, [[sx - w * .48, sy], [sx - w * .26, sy - 4 * scale],
    [sx + w * .55, sy - 2 * scale], [sx + w * .34, sy + 3 * scale]], '#7e9074')
  prop(c, art, index, sx, sy, w)
}
function drawBackgroundScenery(c, art, from, to, px, py, scale, samples = []) {
  // Everything here is non-collidable and is painted behind the riding ground.
  if (samples.length) {
    // Reuse the actual trail samples, including both sides of every cliff.
    // A continuous back plane supports the trees and camps without floating pads.
    const xs = [samples[0] - 70].concat(samples, [samples[samples.length - 1] + 70])
    const back = xs.map(x => roadside(px, py, x, 96))
    const front = xs.map(x => [px(x), py(rules.terrain(x) + 8)])
    polygon(c, back.concat(front.reverse()), '#9eae86')
    stroke(c, back, '#c0c9a2', 2 * scale)
    for (let x = Math.floor(from / 85) * 85; x <= to; x += 85) {
      const [sx, sy] = roadside(px, py, x, 28)
      stroke(c, [[sx - 4 * scale, sy + 2 * scale], [sx, sy - 2 * scale],
        [sx + 7 * scale, sy - scale]], '#869875', scale)
    }
  }
  for (const item of rules.landmarks(from, to)) {
    if (item.kind !== 'camp') continue
    c.save(); c.globalAlpha = .84
    backgroundProp(c, art, 15, item.x - 45, 90, 96, px, py, scale)
    for (const [index, offset, width] of [[4, -80, 94], [5, 2, 36], [6, 68, 35], [7, -165, 28]]) {
      backgroundProp(c, art, index, item.x + offset, 66, width * .74, px, py, scale)
    }
    c.restore()
  }
  for (let x = Math.floor(from / 210) * 210; x <= to; x += 210) {
    if (rules.surfaceKind(x) !== 'dirt') continue
    const seed = Math.abs(Math.floor(x / 210) * 37 % 41)
    const height = (110 + seed * 2) * scale * .82
    const [sx, sy] = roadside(px, py, x + seed, 72)
    c.save(); c.globalAlpha = .78
    if (!drawProp(c, art, 0, sx, sy, height * .45, height)) {
      stroke(c, [[sx, sy], [sx, sy - height * .72]], '#75806a', 4 * scale)
      polygon(c, [[sx, sy - height], [sx - height * .25, sy - height * .18],
        [sx + height * .25, sy - height * .18]], '#81957d')
    }
    c.restore()
  }
}
function drawScenery(c, art, from, to, px, py, scale) {
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
    drawRoadsideSign(c, px, py, item.start - 45, scale, item.name, '#ded1ad', 74, 22, 11, 62)
  }
}
function drawRoadsideSign(c, px, py, x, scale, label, color, width, height, fontSize, depth = 48) {
  verge(c, px, py, x, Math.max(32, width * .6), depth + 14, scale)
  const [sx, sy] = roadside(px, py, x, depth)
  const size = scale * .82; const top = sy - 54 * size
  stroke(c, [[sx, sy], [sx, top]], '#827760', 3 * size)
  // The dark side face gives the signboard thickness and a clear oblique edge.
  polygon(c, [[sx + width / 2 * size, top - height / 2 * size],
    [sx + (width / 2 + 4) * size, top - (height / 2 + 3) * size],
    [sx + (width / 2 + 4) * size, top + (height / 2 - 3) * size],
    [sx + width / 2 * size, top + height / 2 * size]], '#887d61')
  box(c, { x: sx - width / 2 * size, y: top - height / 2 * size, w: width * size, h: height * size }, color, 2 * size)
  text(c, label, sx, top, fontSize * size, '#304749', 'center')
}
module.exports = { drawBackgroundScenery, drawScenery, drawRoute, drawLandmarkSigns, drawRoadsideSign }
