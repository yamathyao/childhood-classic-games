const { text, box } = require('../../common/canvas.js')
const { BIN, ROOM, SOLIDS, ORIGIN, RADIUS, PEOPLE, PROPS, DEFAULT_AIM, armPoints, inBinPile, initialState } = require('./rules.js')
const { LINES } = require('./dialogue.js')
const INK = '#171717'
const MUTED = '#737373'

function shade(c, x0, y0, x1, y1, stops) {
  if (typeof c.createLinearGradient !== 'function') return stops[Math.floor(stops.length / 2)][1]
  const fill = c.createLinearGradient(x0, y0, x1, y1)
  stops.forEach(([position, color]) => fill.addColorStop(position, color))
  return fill
}

function poly(c, points, fill, stroke = INK, weight = 1.2, closed = true) {
  c.beginPath()
  points.forEach((point, index) => c[index ? 'lineTo' : 'moveTo'](point.x, point.y))
  if (closed) c.closePath()
  if (fill) { c.fillStyle = fill; c.fill() }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = weight; c.stroke() }
}

function circle(c, x, y, radius, fill, stroke = INK, weight = 1.3) {
  c.beginPath(); c.arc(x, y, radius, 0, Math.PI * 2)
  if (fill) { c.fillStyle = fill; c.fill() }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = weight; c.stroke() }
}

function paper(c, x, y, radius, seed = 1) {
  const points = Array.from({ length: 10 }, (_, index) => {
    const angle = index / 10 * Math.PI * 2
    const edge = radius * (.88 + ((seed * 17 + index * 7) % 11) / 90)
    return { x: x + Math.cos(angle) * edge, y: y + Math.sin(angle) * edge }
  })
  poly(c, points, shade(c, x - radius, y - radius, x + radius, y + radius,
    [[0, '#fff'], [.52, '#f6f6f6'], [1, '#bcbcbc']]), INK, radius > 12 ? 1.6 : 1.1)
  if (radius < 3) return
  const at = (dx, dy) => ({ x: x + dx * radius, y: y + dy * radius })
  poly(c, [points[3], at(-.2, .12), at(.12, .45), points[1]], '#d6d6d6', null)
  poly(c, [points[7], at(-.2, -.15), at(.32, -.38)], '#fff', null)
  poly(c, [points[7], at(-.2, -.15), at(.32, -.38), points[0]], null, INK, .8, false)
  poly(c, [points[3], at(-.2, .12), at(.12, .45), points[1]], null, INK, .8, false)
  poly(c, [at(-.2, -.15), at(-.2, .12), points[5]], null, INK, .8, false)
}

function camera(rect) {
  const focal = Math.min(rect.w * .94, rect.h * 1.1)
  const centerX = rect.x + rect.w / 2
  const centerY = rect.y + rect.h * .36
  const pitch = .10
  return point => {
    const y = point.y - 1.35; const z = point.z + .35
    const depth = Math.max(.08, z * Math.cos(pitch) - y * Math.sin(pitch))
    return { x: centerX + point.x * focal / depth,
      y: centerY - (y * Math.cos(pitch) + z * Math.sin(pitch)) * focal / depth,
      depth, scale: focal / depth }
  }
}

// Direction control stays monotonic even when gravity or obstacles move the landing point.
// Use the same screen scale for touch input, so one vertical pixel drags the guide one pixel.
function aimGuide(rect, state) {
  const project = camera(rect)
  const reference = project({ x: BIN.x, y: BIN.height + .08, z: BIN.z })
  const near = rect.y + 22; const far = rect.y + rect.h - 22
  const pitchScale = Math.min(rect.h * .55, (reference.y - near) / (1.12 - DEFAULT_AIM.pitch),
    (far - reference.y) / (DEFAULT_AIM.pitch - .12))
  const direction = project({ x: ORIGIN.x + Math.tan(state.yaw) * (BIN.z - ORIGIN.z),
    y: BIN.height + .08, z: BIN.z })
  return { x: Math.max(rect.x + 22, Math.min(rect.x + rect.w - 22, direction.x)),
    y: reference.y - (state.pitch - DEFAULT_AIM.pitch) * pitchScale, pitchScale }
}

function addBin(c, project, items) {
  const ringPoint = (angle, y, radius) => project({ x: BIN.x + Math.cos(angle) * radius,
    y, z: BIN.z + Math.sin(angle) * radius })
  const arc = (y, radius, start, end, count = 32) => Array.from({ length: count + 1 }, (_, index) =>
    ringPoint(start + (end - start) * index / count, y, radius))
  const opening = arc(BIN.height, BIN.radius, 0, Math.PI * 2, 64)
  const topFront = arc(BIN.height, BIN.radius, Math.PI, Math.PI * 2)
  const bottomFront = arc(BIN.bottom, BIN.baseRadius, Math.PI * 2, Math.PI)
  const body = topFront.concat(bottomFront)
  const left = ringPoint(Math.PI, BIN.height, BIN.radius)
  const right = ringPoint(0, BIN.height, BIN.radius)
  const bottom = project({ x: BIN.x, y: BIN.bottom, z: BIN.z })
  const top = project({ x: BIN.x, y: BIN.height, z: BIN.z })
  const openingFill = shade(c, top.x, top.y - 8, top.x, top.y + 9,
    [[0, '#353535'], [.55, '#777'], [1, '#b4b4b4']])
  const bodyFill = shade(c, left.x, top.y, right.x, bottom.y,
    [[0, '#aaa'], [.22, '#e0e0e0'], [.53, '#fcfcfc'], [.78, '#e6e6e6'], [1, '#969696']])
  const lip = arc(BIN.height - .035, BIN.radius - .006, Math.PI, Math.PI * 2)
  // The dark opening sits behind the retained contents; the solid front wall
  // then masks them below the rim, including balls nearest the viewer.
  items.push({ depth: project({ x: BIN.x, y: BIN.height, z: BIN.z + BIN.radius + .15 }).depth,
    paint: () => poly(c, opening, openingFill, INK, 1.6) })
  items.push({ depth: project({ x: BIN.x, y: (BIN.bottom + BIN.height) / 2, z: BIN.z - BIN.radius * .55 }).depth,
    paint: () => {
      poly(c, body, bodyFill, INK, 1.6)
      poly(c, topFront, null, INK, 2.2, false)
      poly(c, lip, null, '#aaa', 1, false)
    } })
}

function floorRing(project, x, z, y, radius, count = 32) {
  return Array.from({ length: count }, (_, index) => {
    const angle = index / count * Math.PI * 2
    return project({ x: x + Math.cos(angle) * radius, y, z: z + Math.sin(angle) * radius })
  })
}

function shadowHeight(ball) {
  let height = .004
  if (Math.hypot(ball.x - BIN.x, ball.z - BIN.z) < BIN.baseRadius && ball.y > BIN.bottom) height = BIN.bottom + .002
  for (const solid of SOLIDS) {
    if (ball.x >= solid.min[0] && ball.x <= solid.max[0] && ball.z >= solid.min[2] && ball.z <= solid.max[2] &&
        ball.y >= solid.max[1] && solid.max[1] > height) height = solid.max[1] + .002
  }
  return height
}

function addDeskDetail(c, project, items, solid) {
  const [x0, y0, z0] = solid.min; const [x1, y1, z1] = solid.max
  const patch = (points, fill, stroke = '#666', weight = .65, closed = true) => {
    const vertices = points.map(([x, y, z]) => project({ x, y, z }))
    items.push({ depth: vertices.reduce((sum, p) => sum + p.depth, 0) / vertices.length - .002,
      paint: () => poly(c, vertices, fill, stroke, weight, closed) })
  }
  const front = (left, bottom, right, top) => [[left, bottom, z0 - .004],
    [right, bottom, z0 - .004], [right, top, z0 - .004], [left, top, z0 - .004]]
  const surface = (left, near, right, far) => [[left, y1 + .004, near],
    [right, y1 + .004, near], [right, y1 + .004, far], [left, y1 + .004, far]]
  if (solid.kind === 'monitor') {
    const a = project({ x: x0, y: y1, z: z0 }); const b = project({ x: x1, y: y0, z: z0 })
    patch(front(x0 + .027, y0 + .032, x1 - .027, y1 - .025),
      shade(c, a.x, a.y, b.x, b.y, [[0, '#fafafa'], [1, '#c8c8c8']]), INK, .85)
    // A quiet document window and a diagonal highlight identify the screen.
    patch(front(x0 + .095, y0 + .09, x1 - .095, y1 - .075), '#f5f5f5', '#999', .55)
    patch(front(x0 + .095, y1 - .11, x1 - .095, y1 - .075), '#ddd', null)
    for (let row = 0; row < 3; row++) {
      const y = y1 - .11 - (row + 1) * (y1 - y0 - .2) / 4
      patch([[x0 + .15, y, z0 - .009], [x1 - .17 - row * .025, y, z0 - .009]], null, '#aaa', .6, false)
    }
    patch([[x0 + .03, y1 - .03, z0 - .012], [x0 + .25, y1 - .03, z0 - .012],
      [x1 - .2, y0 + .04, z0 - .012], [x1 - .35, y0 + .04, z0 - .012]], 'rgba(255,255,255,.22)', null)
  } else if (solid.kind === 'keyboard') {
    patch(surface(x0 + .018, z0 + .018, x1 - .018, z1 - .018), '#e5e5e5', '#888', .55)
    for (let row = 1; row < 4; row++) {
      const z = z0 + .015 + row * .038
      patch([[x0 + .02, y1 + .009, z], [x1 - .02, y1 + .009, z]], null, '#777', .55, false)
    }
    for (let key = 1; key < 11; key++) {
      const x = x0 + .02 + key * .051
      patch([[x, y1 + .009, z0 + .055], [x, y1 + .009, z1 - .02]], null, '#999', .45, false)
    }
    patch(surface(x0 + .15, z0 + .022, x1 - .15, z0 + .05), '#fafafa', '#999', .5)
  } else if (solid.kind === 'notebook') {
    patch(surface(x0 + .005, z0 + .005, x1 - .005, z1 - .005), '#fdfdfd', '#777', .65)
    patch([[x0 + .035, y1 + .01, z0 + .01], [x0 + .035, y1 + .01, z1 - .01]], null, '#888', .65, false)
    for (let row = 0; row < 4; row++) {
      const z = z0 + .07 + row * .045
      patch([[x0 + .065, y1 + .01, z], [x1 - .035, y1 + .01, z]], null, '#bbb', .5, false)
    }
  } else if (solid.kind === 'drawers') {
    for (const y of [.35, .52]) patch([[x0, y, z0 - .004], [x1, y, z0 - .004]], null, '#888', .65, false)
    for (const y of [.28, .45, .61]) {
      patch([[x0 + .09, y, z0 - .006], [x1 - .09, y, z0 - .006]], null, INK, 1, false)
    }
  } else if (solid.kind === 'mouse') {
    patch([[x0 + .05, y1 + .008, z0 + .02], [x0 + .05, y1 + .008, z0 + .07]], null, '#777', .65, false)
  }
}

function heldPaper(c, point, rect, held, power) {
  const radius = RADIUS * point.scale
  const x = point.x; const y = point.y
  const at = (dx, dy) => ({ x: x + dx * radius, y: y + dy * radius })
  // The near hand and cuff make the paper's relationship to the player's desk explicit.
  poly(c, [at(.9, 1.45), at(1.65, 1.05), { x: rect.x + rect.w + 5, y: y + radius * 2.7 },
    { x: rect.x + rect.w + 5, y: rect.y + rect.h + 5 }, at(.9, 2.65)],
  shade(c, x, y, rect.x + rect.w, rect.y + rect.h, [[0, '#fafafa'], [1, '#ddd']]), INK, 1.2)
  poly(c, [at(-.25, .65), at(.15, .28), at(.65, .2), at(1.15, .48),
    at(1.35, .9), at(1.5, 1.45), at(.95, 1.95), at(.35, 1.55), at(-.15, 1.05)],
  '#f9f9f9', INK, 1.4)
  poly(c, [at(.65, .65), at(.2, .92), at(.35, 1.2), at(.85, 1.35)], null, '#555', .9, false)
  poly(c, [at(.95, 1.95), at(1.5, 1.45)], null, '#777', .9, false)
  paper(c, x, y, radius, 0)
}

function addPeople(c, project, items, state) {
  const reaction = state.reaction && LINES.find(line => line.id === state.reaction.id)
  for (const person of PEOPLE) {
    const head = project({ x: person.x, y: 1.32, z: person.z - .035 })
    const responding = reaction && reaction.speaker === person.id
    const angry = responding && reaction.mood === 'angry'
    const hurt = responding && reaction.mood === 'hurt'
    const hit = responding && reaction.kind === 'hit'
    const at = (x, y, z = 0) => project({ x: person.x + x, y, z: person.z + z })
    items.push({ depth: project({ x: person.x, y: 1, z: person.z }).depth, paint: () => {
      poly(c, [at(-.09, 1.2), at(-.19, 1.1), at(-.17, .54), at(.17, .54), at(.19, 1.1), at(.09, 1.2)],
        shade(c, head.x - head.scale * .2, head.y, head.x + head.scale * .2, head.y + head.scale * .6,
          [[0, '#eee'], [1, ['#bcbcbc', '#d8d8d8', '#aaa'][person.id]]]), INK, 1)
      c.save(); c.lineCap = 'round'; c.lineJoin = 'round'
      const limb = (points, radius) => {
        const width = points.reduce((sum, point) => sum + point.scale, 0) / points.length * radius * 2
        poly(c, points, null, INK, width + 1.2, false)
        poly(c, points, null, '#ddd', width, false)
      }
      for (const solid of SOLIDS.filter(solid => solid.kind === 'person-leg' && solid.personId === person.id)) {
        limb([solid.a, solid.b].map(([x, y, z]) => project({ x, y, z })), solid.radius)
      }
      for (const points of armPoints(person, reaction)) limb(points.map(([x, y, z]) => at(x, y, z)), .04)
      c.restore()
      const radius = head.scale * .115
      circle(c, head.x, head.y, radius, responding ? '#fafafa' : '#444', INK, 1)
      if (person.id === 0) circle(c, head.x + radius * .75, head.y - radius * .65, radius * .4, '#555', INK, .8)
      if (person.id === 2) poly(c, [{ x: head.x + radius * .85, y: head.y - radius * .2 },
        { x: head.x + radius * 1.35, y: head.y + radius * 1.25 }, { x: head.x + radius * .8, y: head.y + radius * .6 }], '#555', INK, .8)
      if (responding) {
        poly(c, [{ x: head.x - radius * .85, y: head.y - radius * .25 },
          { x: head.x - radius * .6, y: head.y - radius * .85 }, { x: head.x + radius * .5, y: head.y - radius * .9 },
          { x: head.x + radius * .85, y: head.y - radius * .3 }], '#555', INK, .7)
        for (const sign of [-1, 1]) {
          if (hurt) poly(c, [{ x: head.x + sign * radius * .6, y: head.y },
            { x: head.x + sign * radius * .25, y: head.y + radius * .08 }], null, INK, 1, false)
          else circle(c, head.x + sign * radius * .35, head.y + radius * .05, Math.max(.55, radius * (hit ? .1 : .07)), INK, null)
          if (angry) poly(c, [{ x: head.x + sign * radius * .7, y: head.y - radius * .25 },
            { x: head.x + sign * radius * .15, y: head.y - radius * .07 }], null, INK, 1, false)
        }
        if (hit && !angry) circle(c, head.x, head.y + radius * .45, radius * .15, '#fff', INK, .8)
        else poly(c, [{ x: head.x - radius * .3, y: head.y + radius * .48 },
          { x: head.x + radius * .3, y: head.y + radius * (angry ? .35 : .48) }], null, INK, 1, false)
        if (hit) text(c, angry ? '!!' : '!', head.x + radius * 1.4, head.y - radius * .7,
          Math.max(10, radius * 1.25), INK)
      }
      if (angry && state.cleanupIn > 0 && state.cleanupIn < 1.8) {
        poly(c, [at(.3, .95, -.18), at(.48, .12, -.2)], null, INK, 1.6, false)
        poly(c, [at(.38, .15, -.2), at(.57, .15, -.2), at(.61, .015, -.2), at(.38, .015, -.2)], '#ddd', INK, .9)
      }
    } })
  }
}

function speechBubble(c, rect, project, state) {
  if (!state.reaction) return
  const line = LINES.find(item => item.id === state.reaction.id)
  if (!line) return
  const person = PEOPLE[line.speaker]
  const head = project({ x: person.x, y: 1.45, z: person.z })
  const width = Math.min(rect.w - 28, 236)
  const rows = Array.from(line.text.matchAll(/.{1,15}/gu), match => match[0])
  const compact = rect.h < 320
  const lineHeight = compact ? 17 : 19
  const height = (compact ? 25 : 29) + rows.length * lineHeight
  const left = Math.max(rect.x + 14, Math.min(rect.x + rect.w - width - 14, head.x - width / 2))
  const top = Math.max(rect.y + (compact ? 4 : 12), head.y - height - 17)
  const angry = line.mood === 'angry'
  const fill = angry ? INK : '#fff'; const color = angry ? '#fff' : INK
  const tailX = Math.max(left + 18, Math.min(left + width - 18, head.x))
  poly(c, [{ x: tailX - 7, y: top + height - 1 }, { x: tailX + 7, y: top + height - 1 },
    { x: head.x, y: Math.max(top + height + 8, head.y - 5) }], fill, INK, 1)
  // Rounded bubble using portable Canvas paths (no roundRect dependency).
  c.beginPath(); c.moveTo(left + 12, top); c.lineTo(left + width - 12, top)
  c.quadraticCurveTo(left + width, top, left + width, top + 12)
  c.lineTo(left + width, top + height - 12); c.quadraticCurveTo(left + width, top + height, left + width - 12, top + height)
  c.lineTo(left + 12, top + height); c.quadraticCurveTo(left, top + height, left, top + height - 12)
  c.lineTo(left, top + 12); c.quadraticCurveTo(left, top, left + 12, top); c.closePath()
  c.fillStyle = fill; c.fill(); c.strokeStyle = INK; c.lineWidth = angry ? 1.7 : 1; c.stroke()
  text(c, person.name + (angry ? ' · 生气了' : line.mood === 'warning' ? ' · 不耐烦了' : line.kind === 'hit' ? ' · 被砸到了' : ''),
    left + 12, top + (compact ? 12 : 14), 10, color)
  rows.forEach((row, index) => text(c, row, left + 12, top + (compact ? 31 : 34) + index * lineHeight, compact ? 12 : 13, color))
}

function addProps(c, project, items, state) {
  for (const prop of PROPS) {
    const tipped = state.propHits[prop.id] && prop.kind !== 'bell'
    const at = (u, v, depth = 0) => project({ x: prop.x + (tipped ? v : u),
      y: prop.y + (tipped ? prop.w - u : v), z: prop.z + depth })
    const { w, h, d } = prop
    items.push({ depth: at(w / 2, h / 2).depth, paint: () => {
      if (prop.kind === 'cup') {
        poly(c, [at(0, 0, -d / 2), at(w, 0, -d / 2), at(w, h, -d / 2), at(0, h, -d / 2)], '#fff', INK, 1)
        poly(c, [at(0, h, -d / 2), at(w, h, -d / 2), at(w, h, d / 2), at(0, h, d / 2)], '#ddd', INK, .8)
        poly(c, [at(w * .6, h * .75, -d / 2 - .015), at(w * .85, h * .75, -d / 2 - .015),
          at(w * .85, h * .3, -d / 2 - .015), at(w * .6, h * .3, -d / 2 - .015)], null, INK, .8, false)
        if (tipped) poly(c, floorRing(project, prop.x + h + .06, prop.z, prop.y + .004, .10, 16), '#ddd', '#888', .6)
      } else if (prop.kind === 'plant') {
        poly(c, [at(w * .2, 0), at(w * .8, 0), at(w, h * .38), at(0, h * .38)], '#eee', INK, 1)
        poly(c, [at(w / 2, h * .38), at(w / 2, h)], null, INK, 1, false)
        for (const [u, v, end] of [[0, .83, 1], [w, .73, .9], [0, .55, .72]]) {
          poly(c, [at(w / 2, h * (v - .1)), at(u, h * v), at(w / 2, h * end)], '#fff', INK, .8)
        }
        if (tipped) for (let i = 0; i < 5; i++) {
          const dot = project({ x: prop.x + .04 + i * .045, y: .003, z: prop.z - .12 + (i % 2) * .1 })
          circle(c, dot.x, dot.y, 1, '#777', null)
        }
      } else {
        poly(c, [at(0, 0), at(w, 0), at(w, h * .25), at(0, h * .25)], '#ddd', INK, 1)
        poly(c, [at(w * .05, h * .25), at(w * .25, h * .8), at(w * .75, h * .8), at(w * .95, h * .25)], '#fff', INK, .9)
        poly(c, [at(w * .5, h * .8), at(w * .5, h)], null, INK, 1, false)
      }
    } })
  }
}

function addBoss(c, project, items, state) {
  if (!state.gameOver) return
  const at = (x, y) => project({ x: .85 + x, y, z: 2.65 })
  items.push({ depth: at(0, 1).depth, paint: () => {
    poly(c, [at(-.22, 1.48), at(-.31, .79), at(.31, .79), at(.22, 1.48), at(0, 1.58)], '#333', INK, 1.3)
    poly(c, [at(-.08, 1.55), at(0, 1.1), at(.08, 1.55)], '#fff', INK, .8)
    poly(c, [at(0, 1.5), at(-.035, 1.22), at(0, 1.15), at(.035, 1.22)], INK, null)
    for (const sign of [-1, 1]) {
      poly(c, [at(sign * .25, 1.38), at(sign * .38, 1.03), at(sign * .12, 1.07)], null, INK, 5, false)
      poly(c, [at(sign * .13, .8), at(sign * .17, .09)], null, INK, 9, false)
    }
    const head = at(0, 1.75); const r = head.scale * .14
    circle(c, head.x, head.y, r, '#fff', INK, 1.2)
    poly(c, [{ x: head.x - r, y: head.y - r * .15 }, { x: head.x - r * .8, y: head.y - r * .85 },
      { x: head.x + r * .8, y: head.y - r * .85 }, { x: head.x + r, y: head.y - r * .15 }], INK, null)
    for (const sign of [-1, 1]) {
      poly(c, [{ x: head.x + sign * r * .7, y: head.y - r * .2 }, { x: head.x + sign * r * .2, y: head.y }], null, INK, 1.5, false)
      circle(c, head.x + sign * r * .38, head.y + r * .15, 1, INK, null)
    }
    poly(c, [{ x: head.x - r * .3, y: head.y + r * .55 }, { x: head.x + r * .3, y: head.y + r * .55 }], null, INK, 1.2, false)
  } })
}

// Cache fixed projections per canvas and scene size. Dynamic items still share
// the depth sort, so furniture and opaque bin walls keep their occlusion.
const fixedScenes = new WeakMap()
function fixedScene(c, rect) {
  const key = [rect.x, rect.y, rect.w, rect.h, c.canvas && c.canvas.width, c.canvas && c.canvas.height].join(',')
  const previous = fixedScenes.get(c)
  if (previous && previous.key === key) return previous
  const project = camera(rect)
  const bin = []; addBin(c, project, bin)
  const items = []
  for (const solid of SOLIDS) {
    if (solid.kind && solid.kind.startsWith('person')) continue
    const [x0, y0, z0] = solid.min; const [x1, y1, z1] = solid.max
    const vertices = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
      [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]].map(([x, y, z]) => project({ x, y, z }))
    const faces = [[4, 5, 6, 7], [0, 4, 7, 3], [1, 5, 6, 2], [3, 2, 6, 7], [0, 1, 2, 3]]
    const tones = solid.kind && solid.kind.startsWith('chair')
      ? ['#aaa', '#aaa', '#c1c1c1', '#e0e0e0', '#c8c8c8']
      : ['#d4d4d4', '#ccc', '#e6e6e6', '#fff', '#e1e1e1']
    for (const [face, indices] of faces.entries()) {
      // Cull box faces facing away from the fixed eye (0, 1.35, -.35).
      if (face === 0 || (face === 1 && x0 <= 0) || (face === 2 && x1 >= 0) ||
          (face === 3 && y1 >= 1.35)) continue
      const points = indices.map(index => vertices[index])
      const fill = shade(c, points[0].x, points[0].y, points[2].x, points[2].y,
        [[0, face === 3 ? '#fff' : '#f4f4f4'], [1, tones[face]]])
      items.push({ depth: points.reduce((sum, p) => sum + p.depth, 0) / points.length,
        paint: () => poly(c, points, fill, INK, 1.1) })
    }
    addDeskDetail(c, project, items, solid)
  }
  const fixed = { key, project, bin, furniture: items }
  fixedScenes.set(c, fixed)
  return fixed
}

function drawWorld(c, rect, state) {
  const fixed = fixedScene(c, rect)
  const project = fixed.project
  c.save()
  c.beginPath(); c.moveTo(rect.x, rect.y); c.lineTo(rect.x + rect.w, rect.y)
  c.lineTo(rect.x + rect.w, rect.y + rect.h); c.lineTo(rect.x, rect.y + rect.h); c.closePath(); c.clip()
  c.fillStyle = '#fff'; c.fillRect(rect.x, rect.y, rect.w, rect.h)
  const floor = [{ x: ROOM.left, y: 0, z: ROOM.near }, { x: ROOM.left, y: 0, z: ROOM.far },
    { x: ROOM.right, y: 0, z: ROOM.far }, { x: ROOM.right, y: 0, z: ROOM.near }].map(project)
  const floorTop = project({ x: 0, y: 0, z: ROOM.far }).y
  poly(c, floor, shade(c, rect.x, floorTop, rect.x, rect.y + rect.h,
    [[0, '#eee'], [.32, '#f8f8f8'], [1, '#fff']]), null)
  const rightWall = [{ x: ROOM.right, y: 0, z: ROOM.far }, { x: ROOM.right, y: ROOM.ceiling, z: ROOM.far },
    { x: ROOM.right, y: ROOM.ceiling, z: ROOM.near }, { x: ROOM.right, y: 0, z: ROOM.near }].map(project)
  poly(c, rightWall, shade(c, rect.x + rect.w * .75, rect.y, rect.x + rect.w, rect.y,
    [[0, '#fafafa'], [1, '#eee']]), null)
  // A restrained patch of window light gives the white office a single light source.
  const windowLight = [{ x: .5, y: .003, z: ROOM.far - .1 }, { x: 2.4, y: .003, z: ROOM.far - .1 },
    { x: 1.2, y: .003, z: 2.2 }, { x: -1.1, y: .003, z: 2.2 }].map(project)
  poly(c, windowLight, 'rgba(255,255,255,.6)', null)
  const line = (points, color = INK, width = 1) => poly(c, points.map(project), null, color, width, false)
  // Restrained architectural lines keep the paper and bin readable.
  line([{ x: ROOM.left, y: 0, z: ROOM.near }, { x: ROOM.left, y: 0, z: ROOM.far },
    { x: ROOM.right, y: 0, z: ROOM.far }, { x: ROOM.right, y: 0, z: ROOM.near }], '#999')
  for (const x of [ROOM.left, ROOM.right]) line([{ x, y: 0, z: ROOM.far }, { x, y: ROOM.ceiling, z: ROOM.far }], '#aaa')
  for (const z of [1.5, 3, 4.5, 6]) line([{ x: ROOM.left, y: 0, z }, { x: ROOM.right, y: 0, z }], '#e4e4e4')
  for (const x of [-1.5, 1.5]) line([{ x, y: 0, z: .4 }, { x, y: 0, z: ROOM.far }], '#e4e4e4')
  line([{ x: ROOM.left, y: .08, z: ROOM.far }, { x: ROOM.right, y: .08, z: ROOM.far }], '#ccc', .8)
  const wallZ = ROOM.far - .015
  const windowFrame = [{ x: .6, y: 1.25, z: wallZ }, { x: .6, y: 2.45, z: wallZ },
    { x: 2.2, y: 2.45, z: wallZ }, { x: 2.2, y: 1.25, z: wallZ }]
  poly(c, windowFrame.map(project), '#fafafa', INK, 1)
  line([{ x: 1.4, y: 1.25, z: wallZ }, { x: 1.4, y: 2.45, z: wallZ }], '#777')
  line([{ x: .6, y: 1.85, z: wallZ }, { x: 2.2, y: 1.85, z: wallZ }], '#777')
  const clock = project({ x: -.65, y: 2.05, z: wallZ })
  circle(c, clock.x, clock.y, clock.scale * .22, '#fff', '#555', 1)
  poly(c, [{ x: clock.x - clock.scale * .08, y: clock.y }, { x: clock.x, y: clock.y },
    { x: clock.x, y: clock.y - clock.scale * .13 }], null, '#555', 1, false)

  const items = fixed.bin.slice()
  // Cast shadows away from the window at the back right of the room.
  for (const desk of SOLIDS.filter(solid => solid.kind === 'desk')) {
    for (const [offset, opacity] of [[.48, .035], [.4, .065]]) {
      const deskShadow = [{ x: desk.min[0] - offset, y: .003, z: desk.min[2] - offset * .7 },
        { x: desk.max[0] - offset, y: .003, z: desk.min[2] - offset * .7 },
        { x: desk.max[0], y: .003, z: desk.max[2] },
        { x: desk.min[0], y: .003, z: desk.max[2] }].map(project)
      poly(c, deskShadow, `rgba(0,0,0,${opacity})`, null)
    }
  }
  for (const [spread, opacity] of [[1.35, .035], [1.15, .055], [1, .085]]) {
    const binShadow = floorRing(project, BIN.x - .12, BIN.z - .08, .003, BIN.baseRadius * spread)
    poly(c, binShadow, `rgba(0,0,0,${opacity})`, null)
  }
  addPeople(c, project, items, state)
  addProps(c, project, items, state)
  addBoss(c, project, items, state)
  items.push(...fixed.furniture)
  for (const ball of state.balls) {
    const p = project(ball)
    const inside = Math.hypot(ball.x - BIN.x, ball.z - BIN.z) < BIN.radius && ball.y < BIN.height + RADIUS
    const depth = inside ? Math.max(p.depth, project({ x: BIN.x, y: BIN.bottom, z: BIN.z + .08 }).depth) : p.depth
    items.push({ depth, paint: () => {
      c.save()
      if (state.cleanupIn > 0 && state.cleanupIn < 1.4 && ball.asleep && !inBinPile(ball)) c.globalAlpha = Math.max(.1, state.cleanupIn / 1.4)
      paper(c, p.x, p.y, Math.max(1.5, RADIUS * p.scale), ball.id)
      c.restore()
    } })
    const surfaceY = shadowHeight(ball)
    const altitude = Math.max(0, ball.y - surfaceY)
    const sx = ball.x - altitude * .2; const sz = ball.z - altitude * .13
    const shadow = project({ x: sx, y: surfaceY, z: sz })
    const shadowRadius = RADIUS + Math.min(.08, altitude * .025)
    const outline = floorRing(project, sx, sz, surfaceY, shadowRadius, 20)
    const softOutline = floorRing(project, sx, sz, surfaceY, shadowRadius * 1.45, 20)
    const opacity = Math.max(.055, .22 - altitude * .055)
    items.push({ depth: shadow.depth + .015,
      paint: () => {
        poly(c, softOutline, `rgba(0,0,0,${opacity * .22})`, null)
        poly(c, outline, `rgba(0,0,0,${opacity})`, null)
      } })
  }
  items.sort((a, b) => b.depth - a.depth).forEach(item => item.paint())
  c.restore()
}

const worldCaches = new WeakMap()
function paintWorld(c, rect, state) {
  if (state.balls.some(ball => !ball.asleep) || typeof wx === 'undefined' ||
      typeof wx.createOffscreenCanvas !== 'function' || typeof c.drawImage !== 'function') {
    drawWorld(c, rect, state); return
  }
  const transform = typeof c.getTransform === 'function' ? c.getTransform() : null
  const dpr = transform ? Math.max(1, Math.min(3, Math.abs(transform.a))) :
    Math.max(1, Math.min(3, (c.canvas && c.canvas.width / rect.w) || 1))
  const size = [rect.x, rect.y, rect.w, rect.h, dpr].join(',')
  let cached = worldCaches.get(c)
  if (!cached || cached.size !== size) {
    try {
      const surface = wx.createOffscreenCanvas({ type: '2d', width: Math.ceil(rect.w * dpr), height: Math.ceil(rect.h * dpr) })
      const context = surface.getContext('2d')
      context.scale(dpr, dpr); context.translate(-rect.x, -rect.y)
      cached = { size, surface, context }; worldCaches.set(c, cached)
    } catch (error) { drawWorld(c, rect, state); return }
  }
  const fade = state.cleanupIn > 0 && state.cleanupIn < 1.4 ? state.cleanupIn : 0
  const signature = [state.reaction && state.reaction.id, state.gameOver, fade,
    ...PROPS.map(prop => !!state.propHits[prop.id]),
    ...state.balls.flatMap(ball => [ball.id, ball.x, ball.y, ball.z, ball.asleep])].join('|')
  if (cached.signature !== signature) {
    drawWorld(cached.context, rect, state)
    cached.signature = signature
  }
  c.drawImage(cached.surface, 0, 0, cached.surface.width, cached.surface.height, rect.x, rect.y, rect.w, rect.h)
}

function drawOffice(c, rect, state, held = false, power = 0) {
  paintWorld(c, rect, state)
  const project = fixedScene(c, rect).project
  c.save()
  c.beginPath(); c.moveTo(rect.x, rect.y); c.lineTo(rect.x + rect.w, rect.y)
  c.lineTo(rect.x + rect.w, rect.y + rect.h); c.lineTo(rect.x, rect.y + rect.h); c.closePath(); c.clip()
  if (!state.gameOver) {
    const guide = aimGuide(rect, state)
    const aimX = guide.x; const aimY = guide.y
    circle(c, aimX, aimY, 10, null, '#fff', 5)
    circle(c, aimX, aimY, 10, null, INK, 2.3)
    circle(c, aimX, aimY, 2, INK, '#fff', 1)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const points = [{ x: aimX + dx * 13, y: aimY + dy * 13 }, { x: aimX + dx * 19, y: aimY + dy * 19 }]
      poly(c, points, null, '#fff', 5, false); poly(c, points, null, INK, 2.3, false)
    }
    heldPaper(c, project(ORIGIN), rect, held, power)
  }
  speechBubble(c, rect, project, state)
  if (state.gameOver) {
    const rows = state.gameOver === 'bell'
      ? ['谁在按我的铃？', '办公室不是游乐场！', '今天就到这里，', '回去认真工作！']
      : ['已经收到好几次投诉了。', '还在扔？！', '今天就到这里，', '回去认真工作！']
    const bubble = { x: rect.x + 14, y: rect.y + 8, w: Math.min(240, rect.w * .64), h: 29 + rows.length * 17 }
    box(c, bubble, '#fff', 1.5, INK)
    const head = project({ x: .70, y: 1.65, z: 2.65 })
    poly(c, [{ x: bubble.x + bubble.w, y: bubble.y + 32 }, { x: bubble.x + bubble.w, y: bubble.y + 46 },
      { x: head.x, y: head.y }], '#fff', INK, 1)
    text(c, '老板', bubble.x + 12, bubble.y + 14, 11, MUTED)
    rows.forEach((row, index) => text(c, row, bubble.x + 12, bubble.y + 36 + index * 17, 11, INK))
  }
  c.restore()
}

function draw({ context: c, view, state, power = 0, charging = false, paused = false, warning = '' }) {
  const { width, height, top } = view
  c.clearRect(0, 0, width, height); c.fillStyle = '#fff'; c.fillRect(0, 0, width, height)
  text(c, '‹  游戏合集', view.back.x + 5, view.back.y + 18, 13, INK)
  if (!state.gameOver) {
    text(c, paused ? '继续' : '暂停', view.pause.x + view.pause.w / 2, view.pause.y + 18, 13, INK, 'center')
    text(c, '清理纸团', view.clean.x + view.clean.w / 2, view.clean.y + 18, 12, INK, 'center')
  }
  text(c, '办公室投篮', 22, top + 61, 25, INK)
  text(c, `墙角纸篓 · ${Math.hypot(BIN.x - ORIGIN.x, BIN.z - ORIGIN.z).toFixed(1)} 米`, 23, top + 90, 12, MUTED)
  text(c, `${state.scored} / ${state.throws}`, width - 23, top + 64, 23, INK, 'right')
  text(c, '入篓 / 已投', width - 23, top + 90, 10, MUTED, 'right')
  drawOffice(c, view.scene, state, charging, power)
  poly(c, [{ x: 22, y: view.controlsTop + 1 }, { x: width - 22, y: view.controlsTop + 1 }], null, '#ddd', 1, false)
  text(c, warning || (state.gameOver ? 'GAME OVER · 老板来了' : paused ? '已暂停 · 点击继续'
    : charging ? `${Math.round(power * 100)}% 力度 · 松手投出` : '滑动准心调整方向 · 按住圆点蓄力'), width / 2, view.controlsTop + 21, 12, MUTED, 'center')
  if (state.gameOver) {
    box(c, view.restart, INK, 1, INK)
    text(c, '重新开始', width / 2, view.restart.y + view.restart.h / 2, 17, '#fff', 'center')
    text(c, '重新开始将清空本局', width / 2, view.restart.y + view.restart.h + 24, 11, MUTED, 'center')
    return
  }
  const { x, y, radius } = view.charge
  circle(c, x, y, radius + 6, '#fff', paused ? '#aaa' : INK, 1)
  circle(c, x, y, radius - 2, charging ? INK : '#fff', paused ? '#aaa' : INK, 1.7)
  if (charging) {
    c.beginPath(); c.arc(x, y, radius + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * power)
    c.strokeStyle = INK; c.lineWidth = 4; c.stroke()
    text(c, `${Math.round(power * 100)}`, x, y, 19, '#fff', 'center')
  } else circle(c, x, y, 7, paused ? '#aaa' : INK, null)
  text(c, charging ? '松手投出' : '按住蓄力', x, y + radius + 23, 12, INK, 'center')
  if (paused) {
    const rect = { x: 30, y: view.scene.y + view.scene.h / 2 - 40, w: width - 60, h: 80 }
    box(c, rect, '#fff', 2, INK)
    text(c, '休息一下', width / 2, rect.y + 28, 20, INK, 'center')
    text(c, '纸团和方向都会保留', width / 2, rect.y + 56, 12, MUTED, 'center')
  }
}

function drawCover(c, rect) {
  c.save()
  box(c, rect, '#fff', 2, '#222')
  const state = { ...initialState(), balls: [
    { x: -.75, y: RADIUS, z: 3.2, id: 1 }, { x: .22, y: RADIUS, z: 3.8, id: 2 },
    { x: BIN.x - .03, y: BIN.bottom + RADIUS, z: BIN.z, id: 3 }
  ] }
  drawOffice(c, { x: rect.x + 2, y: rect.y + 2, w: rect.w - 4, h: rect.h - 4 }, state)
  c.restore()
}

module.exports = { draw, drawCover, paper, circle, aimGuide }
