const { text, box, path } = require('../../common/canvas.js')
const rules = require('./rules.js')
const { drawRider, drawProp, drawPanorama, drawEarth } = require('./art.js')
const { drawBackgroundScenery, drawScenery, drawRoute, drawLandmarkSigns, drawRoadsideSign } = require('./scenery.js')
const C = { sky: '#edf0e8', ink: '#304749', muted: '#758585', forest: '#667c62', lime: '#d7bd80', orange: '#b36d47' }

function polygon(c, points, fill, stroke, width = 1) {
  c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath()
  if (fill) { c.fillStyle = fill; c.fill() }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke() }
}
function line(c, points, color, width) {
  c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y))
  c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke()
}
function circle(c, x, y, r, fill, stroke, width = 1) {
  c.beginPath(); c.arc(x, y, r, 0, rules.TAU)
  if (fill) { c.fillStyle = fill; c.fill() }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke() }
}
function rider(c, x, y, scale, angle, travel = 0, crashed = false, art) {
  if (drawRider(c, art, x, y, scale, angle)) return
  c.save(); c.translate(x, y); c.scale(scale * rules.RIDER_SCALE, scale * rules.RIDER_SCALE); c.rotate(angle)
  for (const wheel of [{ x: -30, y: 8, r: 18 }, { x: 30, y: 8, r: 18 }]) {
    circle(c, wheel.x, wheel.y, wheel.r, '#eaf0d7', C.ink, 3)
    circle(c, wheel.x, wheel.y, wheel.r - 4, null, '#9daf8b', .8)
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + travel / 11
      line(c, [[wheel.x, wheel.y], [wheel.x + Math.cos(a) * 14, wheel.y + Math.sin(a) * 14]], '#91a283', .8)
    }
  }
  line(c, [[-30, 8], [-11, -14], [0, 8], [-30, 8], [16, -14], [0, 8]], C.orange, 3)
  line(c, [[16, -14], [30, 8]], C.ink, 2.5)
  line(c, [[16, -14], [14, -23], [22, -23]], C.ink, 2.5)
  line(c, [[-11, -14], [-14, -21]], C.ink, 2.5)
  line(c, [[-20, -21], [-9, -21]], C.ink, 3)
  circle(c, 0, 7, 3, C.ink)
  const pedal = Math.sin(travel / 22) * 3
  line(c, [[-19, -19], [-7, -7 + pedal], [-2, 5]], '#263e39', 5)
  line(c, [[-19, -19], [-8, -28], [-2, -34]], crashed ? '#ae5b41' : '#cf7046', 10)
  line(c, [[-5, -31], [8, -25], [18, -23]], '#755243', 4)
  line(c, [[-3, 5], [4, 5]], '#263e39', 3)
  line(c, [[-2, -34], [6, -38], [12, -40]], C.orange, 7)
  circle(c, 12, -44, 9, '#343f40', C.orange, 2)
  polygon(c, [[13, -51], [24, -49], [22, -39], [16, -36], [8, -38]], '#343f40', C.orange, 2)
  line(c, [[14, -47], [21, -46]], '#111e24', 5)
  c.restore()
}
function fallenRider(c, x, y, scale, angle) {
  c.save(); c.translate(x, y); c.scale(scale * rules.RIDER_SCALE, scale * rules.RIDER_SCALE); c.rotate(angle)
  // The bicycle rests on its side; the rider lies beside it in a full helmet.
  c.save(); c.scale(1, .32)
  for (const wheelX of [-27, 27]) {
    circle(c, wheelX, -18, 18, null, '#304749', 3)
    line(c, [[wheelX - 13, -18], [wheelX + 13, -18]], '#8d9b92', 1)
  }
  line(c, [[-27, -18], [-10, -42], [2, -18], [-27, -18], [14, -42], [27, -18], [2, -18], [14, -42]], C.orange, 3)
  c.restore()
  line(c, [[-31, -4], [-15, -8], [-2, -4]], '#293c3e', 7)
  line(c, [[-29, 0], [-14, -1], [1, -4]], '#293c3e', 6)
  line(c, [[-3, -5], [11, -7], [18, -6]], '#b36d47', 11)
  line(c, [[7, -6], [13, 0], [26, 0]], '#755243', 4)
  circle(c, 27, -8, 9, '#343f40', C.orange, 2)
  line(c, [[30, -12], [35, -10]], '#111e24', 4)
  c.restore()
}
function backdrop(c, rect, travel, art, vertical = 0) {
  if (drawPanorama(c, art, rect, travel, vertical)) return
  c.fillStyle = C.sky; c.fillRect(rect.x, rect.y, rect.w, rect.h)
  circle(c, rect.x + rect.w * .78, rect.y + rect.h * .2, Math.min(25, rect.h * .08), '#e7bb73')
  for (const [layer, color] of [[0, '#cdd8bb'], [1, '#a7bea1'], [2, '#7c9e87']]) {
    const bottom = rect.y + rect.h * (.52 + layer * .11)
    const points = [[rect.x, rect.y + rect.h]]
    for (let x = 0; x <= rect.w + 12; x += 12) {
      const t = x + travel * (.07 + layer * .06)
      points.push([rect.x + x, bottom - Math.abs(Math.sin(t / (120 - layer * 22) + layer)) * rect.h * (.28 - layer * .04)])
    }
    points.push([rect.x + rect.w, rect.y + rect.h]); polygon(c, points, color)
  }
  const offset = ((travel * .35) % 100 + 100) % 100
  for (let x = -offset; x < rect.w + 60; x += 100) {
    const y = rect.y + rect.h * .72 + Math.sin((x + offset) * .018) * 8
    polygon(c, [[rect.x + x, y - 70], [rect.x + x - 20, y - 28], [rect.x + x - 13, y - 28],
      [rect.x + x - 27, y], [rect.x + x + 27, y], [rect.x + x + 13, y - 28], [rect.x + x + 20, y - 28]], '#62866d')
  }
}
function paintGround(c, road, rect, from, to, projectX, projectY, cameraY, scale, art) {
  const shape = road.concat([[rect.x + rect.w + 20, rect.y + rect.h + 30], [rect.x - 20, rect.y + rect.h + 30]])
  polygon(c, shape, '#776349')
  c.save(); polygon(c, shape); c.clip()
  let groundTop = rect.y + rect.h
  for (const point of road) groundTop = Math.min(groundTop, point[1])
  const textured = drawEarth(c, art, rect, projectX, projectY, from, to, cameraY, scale, groundTop)
  if (textured) {
    line(c, road.map(([x, y]) => [x, y + 12]), '#8f7855', 24)
    line(c, road.map(([x, y]) => [x, y + 6]), '#c9b085', 12)
  } else {
    line(c, road.map(([x, y]) => [x, y + 21]), '#897963', 38)
    line(c, road.map(([x, y]) => [x, y + 6]), '#baaa82', 10)
    line(c, road.map(([x, y]) => [x, y + 43]), '#6a6555', 12)
    // Bounded world-aligned rock strata remain available if textures fail.
    for (let x = Math.floor(from / 52) * 52; x <= to; x += 52) {
      const seed = Math.abs(Math.floor(x / 52) * 31 % 97)
      const px = projectX(x); const py = projectY(rules.terrain(x)) + 50
      for (let layer = 0; layer < 5; layer++) {
        const y = py + layer * 47; const offset = (seed + layer * 17) % 26
        polygon(c, [[px - 28, y + offset], [px + 15, y - 4], [px + 35, y + 19], [px + 18, y + 37], [px - 24, y + 39]],
          ['#5e6358', '#65685d', '#585e53', '#737364'][(seed + layer) % 4], '#454c43', .5)
        line(c, [[px - 21, y + offset + 3], [px + 15, y]], '#8a8772', .6)
      }
      for (let i = 0; i < 3; i++) {
        const stoneX = x + i * 13; const stoneY = projectY(rules.terrain(stoneX)) + 3 + (seed + i) % 6
        line(c, [[projectX(stoneX), stoneY], [projectX(stoneX) + 3, stoneY - 1]], '#d4c39a', 1.5)
      }
    }
  }
  c.restore()
  line(c, road, '#7f895e', 3)
  line(c, road.map(([x, y]) => [x, y + 3]), '#dbc59b', 2)
}
function landscape(c, view, state, art) {
  const rect = view.scene; const scale = view.scale * state.cameraZoom
  const cameraY = state.cameraY
  const projectX = x => view.riderX + (x - state.x) * scale
  const projectY = y => view.groundY + (y - cameraY) * scale
  c.save(); path(c, rect.x, rect.y, rect.w, rect.h, 0); c.clip()
  backdrop(c, rect, state.x, art, Math.sin(state.x / 1100) * 9)
  const from = state.x - view.riderX / scale - 20
  const to = state.x + (rect.w - view.riderX) / scale + 20
  // Sample each side of actual discontinuities explicitly: both wooden lips
  // and canyon cliffs must retain their real vertical drop in the drawing.
  const xs = []
  for (let x = from; x < to; x += 7) xs.push(x)
  for (let i = Math.max(0, Math.floor(from / rules.SECTION)); i <= Math.floor(to / rules.SECTION); i++) {
    const f = rules.feature(i)
    if (f.kind !== 'natural' && f.lip >= from && f.lip <= to) xs.push(f.lip - .01, f.lip)
    const item = rules.route(i)
    if (item.kind !== 'camp' && item.lip >= from && item.lip <= to) xs.push(item.lip - .01, item.lip)
  }
  xs.push(to); xs.sort((a, b) => a - b)
  const road = xs.map(x => [projectX(x), projectY(rules.terrain(x))])
  drawBackgroundScenery(c, art, from, to, projectX, projectY, scale, xs)
  drawLandmarkSigns(c, from, to, projectX, projectY, scale)
  for (let i = Math.max(0, Math.floor(from / rules.SECTION)); i <= Math.floor(to / rules.SECTION); i++) {
    const f = rules.feature(i)
    if (f.end < from || f.start > to) continue
    drawRoadsideSign(c, projectX, projectY, f.start - 26, scale, f.kind === 'drop' ? '↘' : '↗', C.lime, 35, 22, 20)
    if (f.kind === 'drop') drawRoadsideSign(c, projectX, projectY, f.lip - 15, scale, '!', '#d8844e', 34, 20, 15, 40)
  }
  paintGround(c, road, rect, from, to, projectX, projectY, cameraY, scale, art)
  drawScenery(c, art, from, to, projectX, projectY, scale, state.time)
  drawRoute(c, art, from, to, projectX, projectY, scale, state.time)
  for (let x = Math.floor(from / 110) * 110; x <= to; x += 110) {
    if (rules.surfaceKind(x) === 'highway' || rules.surfaceKind(x) === 'railway') continue
    const seed = Math.abs(Math.floor(x / 110) * 19 % 29)
    drawProp(c, art, 3, projectX(x + seed), projectY(rules.terrain(x + seed)) + 5, (26 + seed / 2) * scale, (18 + seed / 3) * scale)
  }
  for (let i = Math.max(0, Math.floor(from / rules.SECTION)); i <= Math.floor(to / rules.SECTION); i++) {
    const f = rules.feature(i)
    if (f.end < from || f.start > to) continue
    if (f.kind === 'ramp') {
      polygon(c, [[projectX(f.start), projectY(rules.terrain(f.start))], [projectX(f.lip), projectY(rules.terrain(f.lip - .01))],
        [projectX(f.lip), projectY(rules.terrain(f.lip))]], '#aa794d', '#72593f', 1)
      for (let x = f.start + 18; x < f.lip; x += 22) line(c, [[projectX(x), projectY(rules.terrain(x))],
        [projectX(x), projectY(rules.terrain(f.lip))]], '#76563c', 2)
      line(c, [[projectX(f.start), projectY(rules.terrain(f.start))], [projectX(f.lip), projectY(rules.terrain(f.lip - .01))]], '#e4bc7e', 5)
    }
  }
  for (const obstacle of rules.obstacles(from, to)) {
    const x = projectX(obstacle.x); const y = projectY(obstacle.y); const w = obstacle.w * scale; const h = obstacle.h * scale
    c.save(); c.globalAlpha = .17; box(c, { x: x - w / 2 - 4, y: y - h - 4, w: w + 8, h: h + 8 }, '#f1edcf', 5); c.restore()
    if (drawProp(c, art, { rock: 1, log: 2, gear: 5, barrier: 12 }[obstacle.kind], x, y, w, h)) continue
    if (obstacle.kind === 'rock') {
      polygon(c, [[x - w / 2, y], [x - w * .35, y - h * .7], [x + w * .05, y - h], [x + w * .4, y - h * .6], [x + w / 2, y]], '#b3b7a5', '#6a7969', 2)
      line(c, [[x + w * .05, y - h], [x - w * .05, y - h * .4], [x + w * .35, y - h * .25]], '#dde0cd', 2)
    } else if (obstacle.kind === 'gear' || obstacle.kind === 'barrier') {
      box(c, { x: x - w / 2, y: y - h, w, h }, obstacle.kind === 'gear' ? '#55a39d' : C.orange, 5, C.ink)
      line(c, [[x - w / 3, y - h * .7], [x + w / 3, y - h * .7]], C.lime, 4)
    } else {
      box(c, { x: x - w / 2, y: y - h, w, h }, '#a9764b', h / 2, '#5c4937')
      circle(c, x + w / 2 - h / 2, y - h / 2, h * .38, '#d6b884', '#8b653f', 1.5)
      circle(c, x + w / 2 - h / 2, y - h / 2, h * .18, null, '#8b653f')
    }
  }
  const ground = projectY(rules.rideHeight(state.x))
  c.save(); c.globalAlpha = Math.max(.08, .24 - Math.max(0, ground - projectY(state.y)) / 500)
  line(c, [[view.riderX - 24 * scale, ground + 2], [view.riderX + 24 * scale, ground + 2]], '#192f28', 6)
  c.restore()
  if (state.grounded && state.status === 'running') {
    for (let i = 0; i < 4; i++) {
      const offset = (state.time * 80 + i * 11) % 45
      circle(c, view.riderX - (24 + offset) * scale, ground - 3 - offset * .1, (2 - offset / 35) * scale, '#b5b685')
    }
  }
  if (state.status === 'crashing' || state.landingTime > 0 && state.landingImpact > .2) {
    const progress = state.status === 'crashing' ? state.crashMotion.elapsed / rules.CRASH_DURATION : 1 - state.landingTime / .32
    c.save(); c.globalAlpha = Math.max(0, (1 - progress) * .5)
    for (let i = 0; i < 6; i++) {
      const spread = (10 + progress * 55) * scale
      circle(c, view.riderX + Math.sin(i * 2.4) * spread - progress * 25 * scale,
        ground - (3 + Math.abs(Math.cos(i)) * progress * 18) * scale, (2 + progress * 4) * scale, '#c3b091')
    }
    c.restore()
  }
  const resting = state.crashMotion ? Math.max(0, Math.min(1, (state.crashMotion.elapsed - .5) / .25)) : 0
  if (resting < 1) {
    c.save(); c.globalAlpha = 1 - resting
    rider(c, view.riderX, projectY(state.y), scale, state.angle, state.x, state.status === 'crashing' || state.status === 'over', art)
    c.restore()
  }
  if (resting > 0) {
    c.save(); c.globalAlpha = resting
    fallenRider(c, view.riderX, projectY(rules.terrain(state.x) - 3), scale, state.crashMotion.restAngle)
    c.restore()
  }
  if (state.status === 'running' && state.speed > 360) {
    c.save(); c.globalAlpha = Math.min(.4, (state.speed - 300) / 600)
    for (let i = 0; i < 5; i++) {
      const phase = (state.time * state.speed * .9 + i * 97) % (rect.w + 90)
      const y = rect.y + 65 + i * Math.max(18, (rect.h - 100) / 5)
      line(c, [[rect.x + rect.w - phase, y], [rect.x + rect.w - phase + 18 + state.speed / 24, y]], '#fff4d6', 1)
    }
    c.restore()
  }
  c.restore()
}
function drawCover(c, rect, art) {
  c.save(); path(c, rect.x, rect.y, rect.w, rect.h, 12); c.clip(); backdrop(c, rect, 330, art)
  polygon(c, [[rect.x, rect.y + rect.h * .67], [rect.x + rect.w * .3, rect.y + rect.h * .63],
    [rect.x + rect.w * .54, rect.y + rect.h * .84], [rect.x + rect.w, rect.y + rect.h * .88],
    [rect.x + rect.w, rect.y + rect.h], [rect.x, rect.y + rect.h]], C.forest)
  const s = Math.min(rect.w / 155, rect.h / 110, 1.65)
  const x = rect.x + rect.w * .39; const y = rect.y + rect.h * .58
  polygon(c, [[x - s * 40, y + s * 20], [x + s * 6, y + s * 3], [x + s * 6, y + s * 36]], '#ae7c4f')
  line(c, [[x - s * 40, y + s * 20], [x + s * 6, y + s * 3]], '#dfc18e', 4)
  rider(c, x + 17 * s, y - 12 * s, s, -.3, 400, false, art)
  c.restore()
}
function overlay(c, view, state, paused, best) {
  c.fillStyle = 'rgba(28,49,41,.36)'; c.fillRect(view.scene.x, view.scene.y, view.scene.w, view.scene.h)
  const p = view.panel
  box(c, p, '#f5f3e2', 16, '#c4d0b0')
  const title = state.status === 'over' ? '这趟冒险，先到这里' : paused ? '山风等你回来' : '沿着山路，向下出发'
  text(c, title, p.x + p.w / 2, p.y + 28, Math.min(20, p.w / 13), C.ink, 'center')
  const rows = state.status === 'over'
    ? [state.crashReason, `${Math.floor(state.distance)} 米  /  ${state.flips} 圈空翻`, `本次 ${rules.totalScore(state)} 分 · 最高 ${best.score} 分`]
    : paused ? ['已暂停 · 进度留在当前会话', '松开手指后，点击下方按钮继续', '返回游戏不会补算后台时间']
      : ['轻点一下起跳，躲开山石与倒木', '长按加速后空翻，提前松手稳车', '车轮稳落继续，撞击翻滚后结束']
  rows.forEach((row, i) => text(c, row, p.x + p.w / 2, p.y + 64 + i * 27, Math.min(12, p.w / 23), i ? C.muted : C.ink, 'center'))
}
function draw({ context: c, view, state, paused, best, warning, art }) {
  const { width, height, top, action } = view
  c.clearRect(0, 0, width, height); c.fillStyle = C.sky; c.fillRect(0, 0, width, height)
  text(c, '‹  游戏合集', 20, top + 18, 12, C.ink)
  if (rules.isAnimating(state)) text(c, paused ? '继续' : '暂停', width - 43, top + 18, 12, C.ink, 'center')
  text(c, '自行车大冒险', 21, top + 52, 23, C.ink)
  const section = Math.floor(state.x / rules.SECTION)
  text(c, `${rules.landmark(section).name} / ${rules.profile(section).name}`, 22, top + 77, 10, C.muted)
  text(c, `${Math.floor(state.distance)} m`, width - 22, top + 52, 24, C.ink, 'right')
  text(c, `${rules.totalScore(state)} 分 · ${Math.round(state.speed / 8 * 3.6)} km/h`, width - 22, top + 78, 10, C.muted, 'right')
  landscape(c, view, state, art)
  const badge = state.status === 'crashing' && !paused ? '撞击翻滚中…'
    : state.status === 'running' && !paused
    ? !state.grounded ? state.tricking ? `空翻 ${state.airFlips} 圈 · ${Math.floor(Math.max(0, state.rotation) / rules.TAU * 360) % 360}° · ${state.held ? '松手制动' : '稳住落地'}` : '腾空中 · 长按做动作'
      : state.messageTime > 0 ? state.message : '看准前方 · 轻点起跳'
    : `最长 ${best.distance} 米 · 最高 ${best.score} 分`
  box(c, { x: width / 2 - 115, y: view.scene.y + 8, w: 230, h: 28 }, 'rgba(248,246,235,.87)', 14)
  text(c, badge, width / 2, view.scene.y + 22, 11, C.ink, 'center')
  if (state.messageTime > 0 && state.grounded && state.status === 'running' && !paused) {
    box(c, { x: width / 2 - 91, y: view.scene.y + 41, w: 182, h: 29 }, 'rgba(245,243,226,.9)', 14)
    text(c, state.message, width / 2, view.scene.y + 55, 12, C.ink, 'center')
  }
  if (state.status === 'ready' || state.status === 'over' || paused) overlay(c, view, state, paused, best)
  const label = state.status === 'ready' ? '出发  →' : state.status === 'over' ? '再骑一次  ↗' : paused ? '继续速降  →'
    : state.status === 'crashing' ? '翻滚中…' : state.held ? '松手制动 · 准备落地' : '跳跃 / 长按空翻'
  box(c, action, state.status === 'crashing' && !paused ? '#6b7b75' : state.held && !paused ? C.lime : C.ink, 18)
  text(c, label, width / 2, action.y + 25, 18, state.held && !paused ? C.ink : '#f4f2db', 'center')
  text(c, state.status === 'running' && !paused ? '轻点起跳 · 长按旋转 · 提前松手稳车' : state.status === 'crashing' && !paused ? '稍后查看本次成绩' : '只有一个按钮，山路由你来挑战', width / 2, action.y + 47, 10,
    state.held && !paused ? C.forest : '#bfceb5', 'center')
  if (warning) text(c, warning, width / 2, height - view.bottom - 12, 10, '#a65739', 'center')
}

module.exports = { draw, drawCover, rider }
