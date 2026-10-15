// World coordinates are metres: x right, y up, z into the office.
const { LINES, lineFor, hitLineFor, propLineFor } = require('./dialogue.js')
const SAVE_KEY = 'office.paper-toss.v1'
const STEP = 1 / 120
const RADIUS = .065
const GRAVITY = 9.8
const MAX_CHARGE_MS = 1600
const ROOM = { left: -3, right: 2.55, near: .05, far: 6.05, ceiling: 4 }
const BIN = { x: 2.08, z: 5.55, bottom: .035, height: .58, baseRadius: .235, radius: .32, wall: .015 }
const ORIGIN = { x: .17, y: .86, z: .45 }
const DEFAULT_AIM = { yaw: Math.atan2(BIN.x - ORIGIN.x, BIN.z - ORIGIN.z), pitch: .48 }
const HIT_LIMIT = 8
const PROPS = [
  { id: 'cup', kind: 'cup', x: -.42, y: .76, z: 3.24, w: .12, h: .18, d: .12, speaker: 0 },
  { id: 'plant', kind: 'plant', x: 1.18, y: 0, z: 5.68, w: .24, h: .46, d: .24, speaker: 2 },
  { id: 'bell', kind: 'bell', x: .72, y: .76, z: 4.97, w: .16, h: .12, d: .16, speaker: 2 }
]
const DESKS = [{ id: 'player', x: -1.32, z: .75 }, { id: 'left', x: -1.75, z: 2.8 },
  { id: 'back-left', x: -2, z: 4.55 }, { id: 'back', x: -.3, z: 4.55 }]
const PEOPLE = DESKS.filter(desk => desk.id !== 'player').map((desk, index) => ({
  id: index, name: ['小林', '老周', '小陈'][index], x: desk.x + .74, z: desk.z - .32
}))
// Metre-scale furniture and desktop objects share their geometry with the renderer.
const WORKSTATION = [
  { kind: 'desk', min: [-2.15, .71, 3.5], max: [-.65, .76, 4.3] },
  { kind: 'desk-leg', min: [-2.07, 0, 3.58], max: [-2.01, .71, 3.64] },
  { kind: 'desk-leg', min: [-.79, 0, 3.58], max: [-.73, .71, 3.64] },
  { kind: 'desk-leg', min: [-2.07, 0, 4.16], max: [-2.01, .71, 4.22] },
  { kind: 'desk-leg', min: [-.79, 0, 4.16], max: [-.73, .71, 4.22] },
  { kind: 'drawers', min: [-2.01, .18, 3.65], max: [-1.72, .69, 4.18] },
  { min: [-1.61, .76, 3.97], max: [-1.25, .785, 4.17] },
  { min: [-1.46, .785, 4.06], max: [-1.4, .98, 4.11] },
  { kind: 'monitor', min: [-1.79, .94, 4.055], max: [-1.07, 1.24, 4.105] },
  { kind: 'keyboard', min: [-1.81, .76, 3.66], max: [-1.21, .785, 3.85] },
  { kind: 'mouse', min: [-1.12, .76, 3.7], max: [-1.02, .79, 3.84] },
  { kind: 'notebook', min: [-.96, .76, 3.63], max: [-.72, .782, 3.96] }
]
const SOLIDS = DESKS.flatMap(desk => {
  const dx = desk.x + 2.15; const dz = desk.z - 3.5
  const translated = WORKSTATION.map((solid, index) => {
    // Keep the player's screen toward the left edge so the co-workers are visible.
    const screenOffset = desk.id === 'player' && index >= 6 && index <= 8 ? -.5 : 0
    return { ...solid, deskId: desk.id,
      min: [solid.min[0] + dx + screenOffset, solid.min[1], solid.min[2] + dz],
      max: [solid.max[0] + dx + screenOffset, solid.max[1], solid.max[2] + dz] }
  })
  if (desk.id !== 'player') {
    const person = PEOPLE.find(person => person.x === desk.x + .74 && person.z === desk.z - .32)
    translated.push(
      { kind: 'chair-seat', min: [desk.x + .5, .43, desk.z - .57], max: [desk.x + .98, .49, desk.z - .12] },
      { kind: 'chair-back', min: [desk.x + .5, .49, desk.z - .62], max: [desk.x + .98, 1.04, desk.z - .55] },
      { min: [desk.x + .55, 0, desk.z - .55], max: [desk.x + .6, .43, desk.z - .5] },
      { min: [desk.x + .88, 0, desk.z - .55], max: [desk.x + .93, .43, desk.z - .5] },
      { min: [desk.x + .55, 0, desk.z - .19], max: [desk.x + .6, .43, desk.z - .14] },
      { min: [desk.x + .88, 0, desk.z - .19], max: [desk.x + .93, .43, desk.z - .14] })
    translated.push(
      { kind: 'person', personId: person.id, part: 'body',
        min: [desk.x + .54, .5, desk.z - .46], max: [desk.x + .94, 1.18, desk.z - .18] },
      capsule(person, 'head', [0, 1.32, -.035], [0, 1.32, -.035], .115))
    for (const sign of [-1, 1]) {
      translated.push(
        capsule(person, 'leg', [sign * .1, .56, 0], [sign * .11, .55, .25], .055),
        capsule(person, 'leg', [sign * .11, .55, .25], [sign * .11, .09, .23], .045))
    }
    for (const points of armPoints(person)) for (let index = 1; index < points.length; index++) {
      translated.push(capsule(person, 'arm', points[index - 1], points[index], .04))
    }
  }
  return translated
})
function capsule(person, part, from, to, radius) {
  const a = [person.x + from[0], from[1], person.z + from[2]]
  const b = [person.x + to[0], to[1], person.z + to[2]]
  return { kind: 'person-' + part, personId: person.id, part, shape: 'capsule', a, b, radius,
    min: a.map((value, axis) => Math.min(value, b[axis]) - radius),
    max: a.map((value, axis) => Math.max(value, b[axis]) + radius) }
}
function armPoints(person, line) {
  const responding = line && line.speaker === person.id
  const raised = responding && (line.mood === 'hurt' ? [.1, 1.38, -.11]
    : line.mood === 'angry' ? [.32, 1.45, -.04] : [.27, 1.25, -.04])
  return [
    [[-.17, 1.07, 0], [-.25, .83, .12], [-.12, .78, .4]],
    raised ? [[.17, 1.07, 0], [.27, 1.04, -.02], raised]
      : [[.17, 1.07, 0], [.25, .83, .12], [.12, .78, .4]]
  ]
}
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const binRadius = y => BIN.baseRadius + (BIN.radius - BIN.baseRadius) * clamp((y - BIN.bottom) / (BIN.height - BIN.bottom), 0, 1)

function initialState() {
  return { version: 6, ...DEFAULT_AIM, throws: 0, scored: 0, cleared: 0, clearedScored: 0,
    nextId: 1, balls: [], remainder: 0, missStreak: 0, reactionSerial: 0, reaction: null, cleanupIn: 0,
    personHits: PEOPLE.map(() => 0), totalPersonHits: 0, propHits: {}, gameOver: null }
}

function aim(state, dx, dy, width, pitchScale = width / 1.25) {
  state.yaw = clamp(state.yaw + dx / width * 1.5, -.68, .68)
  state.pitch = clamp(state.pitch - dy / pitchScale, .12, 1.12)
}

function projectile(state, heldMs, id = state.nextId) {
  const power = clamp(heldMs / MAX_CHARGE_MS, 0, 1)
  const speed = 3.2 + power * 6.8
  const horizontal = Math.cos(state.pitch) * speed
  return { id, ...ORIGIN, vx: Math.sin(state.yaw) * horizontal,
    vy: Math.sin(state.pitch) * speed, vz: Math.cos(state.yaw) * horizontal,
    asleep: false, quiet: 0, scored: false, resolved: false, personHit: null, propHit: null }
}
function launch(state, heldMs) {
  if (state.gameOver) return null
  const ball = projectile(state, heldMs, state.nextId++)
  state.balls.push(ball)
  state.throws++
  return ball
}

function callBoss(state, reason) {
  if (state.gameOver) return
  state.gameOver = reason; state.reaction = null; state.cleanupIn = 0
}

// Both drawing and collision use the same rotated object and bounds.
function propSolid(prop, state) {
  const angle = state.propHits[prop.id] && prop.kind !== 'bell' ? -Math.PI / 2 : 0
  const width = angle ? prop.h : prop.w; const height = angle ? prop.w : prop.h
  return { ...prop, angle, kind: 'prop', min: [prop.x, prop.y, prop.z - prop.d / 2],
    max: [prop.x + width, prop.y + height, prop.z + prop.d / 2] }
}
const geometryCache = new WeakMap()
const SOLID_CELL = .5
function sceneSolids(state) {
  const signature = [state.reaction && state.reaction.id, ...PROPS.map(prop => !!state.propHits[prop.id])].join('|')
  const cached = geometryCache.get(state)
  if (cached && cached.signature === signature) return cached.grid
  const line = state.reaction && LINES.find(line => line.id === state.reaction.id)
  let solids = SOLIDS
  if (line) {
    const person = PEOPLE[line.speaker]
    solids = SOLIDS.filter(solid => solid.kind !== 'person-arm' || solid.personId !== person.id)
    for (const points of armPoints(person, line)) for (let index = 1; index < points.length; index++) {
      solids.push(capsule(person, 'arm', points[index - 1], points[index], .04))
    }
  }
  solids = solids.concat(PROPS.map(prop => propSolid(prop, state)))
  const grid = new Map()
  const margin = RADIUS + .002
  for (const solid of solids) {
    for (let x = Math.floor((solid.min[0] - margin) / SOLID_CELL); x <= Math.floor((solid.max[0] + margin) / SOLID_CELL); x++) {
      for (let z = Math.floor((solid.min[2] - margin) / SOLID_CELL); z <= Math.floor((solid.max[2] + margin) / SOLID_CELL); z++) {
        const key = x + z * 128
        if (!grid.has(key)) grid.set(key, [])
        grid.get(key).push(solid)
      }
    }
  }
  geometryCache.set(state, { signature, grid })
  return grid
}
function integrate(ball) {
  ball.vy -= GRAVITY * STEP
  ball.x += ball.vx * STEP; ball.y += ball.vy * STEP; ball.z += ball.vz * STEP
  ball.vx *= .999; ball.vy *= .999; ball.vz *= .999
}
function bounce(ball, nx, ny, nz, penetration, restitution = .32) {
  ball.x += nx * penetration; ball.y += ny * penetration; ball.z += nz * penetration
  const speed = ball.vx * nx + ball.vy * ny + ball.vz * nz
  if (speed < 0) {
    const impulse = -(1 + (speed < -.65 ? restitution : 0)) * speed
    ball.vx += impulse * nx; ball.vy += impulse * ny; ball.vz += impulse * nz
  }
  if (ny > .45) ball.supported = true
  return Math.max(0, -speed)
}

function boxCollision(ball, solid) {
  const axes = ['x', 'y', 'z']
  const nearest = axes.map((axis, index) => clamp(ball[axis], solid.min[index], solid.max[index]))
  let delta = axes.map((axis, index) => ball[axis] - nearest[index])
  let distance = Math.hypot(...delta)
  if (distance >= RADIUS + .002) return
  if (distance < .000001) {
    let face = null
    axes.forEach((axis, index) => {
      for (const sign of [-1, 1]) {
        const gap = sign < 0 ? ball[axis] - solid.min[index] : solid.max[index] - ball[axis]
        if (!face || gap < face.gap) face = { index, sign, gap }
      }
    })
    delta = [0, 0, 0]; delta[face.index] = face.sign
    return bounce(ball, ...delta, RADIUS + face.gap)
  } else return bounce(ball, ...delta.map(value => value / distance), Math.max(0, RADIUS - distance))
}

function capsuleCollision(ball, solid) {
  const position = [ball.x, ball.y, ball.z]
  const segment = solid.b.map((value, axis) => value - solid.a[axis])
  const length2 = segment.reduce((sum, value) => sum + value * value, 0)
  const t = length2 ? clamp(segment.reduce((sum, value, axis) => sum + value * (position[axis] - solid.a[axis]), 0) / length2, 0, 1) : 0
  const delta = position.map((value, axis) => value - solid.a[axis] - segment[axis] * t)
  const distance = Math.hypot(...delta)
  const contact = RADIUS + solid.radius
  if (distance >= contact + .002) return
  const normal = distance > .000001 ? delta.map(value => value / distance) : [1, 0, 0]
  return bounce(ball, ...normal, Math.max(0, contact - distance), .22)
}

function personImpact(state, ball, solid, impact) {
  if (state.gameOver || solid.personId === undefined || impact < .9 || ball.resolved !== false || ball.personHit) return
  ball.personHit = { speaker: solid.personId, part: solid.part }
  state.personHits[solid.personId] = Math.min(3, state.personHits[solid.personId] + 1)
  state.totalPersonHits++
  if (state.totalPersonHits >= HIT_LIMIT) { callBoss(state, 'people'); return }
  if (state.gameOver) return
  if (state.cleanupIn > 0) return
  const line = hitLineFor(solid.personId, solid.part, state.personHits[solid.personId], ++state.reactionSerial, impact)
  state.reaction = { id: line.id, remaining: line.mood === 'angry' ? 5.6 : 4.2 }
  if (line.mood === 'angry') state.cleanupIn = 4.4
}

function staticCollisions(ball, state, grid) {
  const r = RADIUS
  if (ball.y <= r + .006) bounce(ball, 0, 1, 0, Math.max(0, r - ball.y))
  if (ball.y > ROOM.ceiling - r) bounce(ball, 0, -1, 0, ball.y - (ROOM.ceiling - r))
  if (ball.x < ROOM.left + r) bounce(ball, 1, 0, 0, ROOM.left + r - ball.x)
  if (ball.x > ROOM.right - r) bounce(ball, -1, 0, 0, ball.x - ROOM.right + r)
  if (ball.z < ROOM.near + r) bounce(ball, 0, 0, 1, ROOM.near + r - ball.z)
  if (ball.z > ROOM.far - r) bounce(ball, 0, 0, -1, ball.z - ROOM.far + r)
  const dx = ball.x - BIN.x; const dz = ball.z - BIN.z
  const rho = Math.hypot(dx, dz)
  if (rho < BIN.radius + r + BIN.wall && ball.y < BIN.height + r + BIN.wall) {
    // Closest point on the tapered, open shell; its top endpoint is the rim.
    const dr = BIN.radius - BIN.baseRadius; const dh = BIN.height - BIN.bottom
    const t = clamp(((rho - BIN.baseRadius) * dr + (ball.y - BIN.bottom) * dh) / (dr * dr + dh * dh), 0, 1)
    const radialDelta = rho - (BIN.baseRadius + dr * t)
    const verticalDelta = ball.y - (BIN.bottom + dh * t)
    const distance = Math.hypot(radialDelta, verticalDelta)
    const contact = r + BIN.wall
    if (distance < contact + .002) {
      const radialNormal = distance > .000001 ? radialDelta / distance : (rho < binRadius(ball.y) ? -1 : 1)
      const ny = distance > .000001 ? verticalDelta / distance : 0
      bounce(ball, radialNormal * (rho ? dx / rho : 1), ny,
        radialNormal * (rho ? dz / rho : 0), Math.max(0, contact - distance), .4)
    }
    if (rho < BIN.baseRadius - BIN.wall && ball.y <= BIN.bottom + r + .006) {
      bounce(ball, 0, 1, 0, Math.max(0, BIN.bottom + r - ball.y), .24)
    }
  }
  const solids = grid.get(Math.floor(ball.x / SOLID_CELL) + Math.floor(ball.z / SOLID_CELL) * 128) || []
  for (const solid of solids) {
    const margin = r + .002
    if (ball.x < solid.min[0] - margin || ball.x > solid.max[0] + margin || ball.y < solid.min[1] - margin ||
        ball.y > solid.max[1] + margin || ball.z < solid.min[2] - margin || ball.z > solid.max[2] + margin) continue
    const impact = solid.shape === 'capsule' ? capsuleCollision(ball, solid) : boxCollision(ball, solid)
    if (impact !== undefined) {
      personImpact(state, ball, solid, impact)
      if (solid.kind === 'prop' && impact >= .9 && ball.resolved === false && !ball.propHit &&
          !state.propHits[solid.id] && !state.gameOver) {
        ball.propHit = solid.id; state.propHits[solid.id] = true
        if (solid.id === 'bell') callBoss(state, 'bell')
        else if (state.cleanupIn === 0) {
          const line = propLineFor(solid.id, ++state.reactionSerial)
          state.reaction = { id: line.id, remaining: 4.2 }
        }
      }
    }
  }
}

function ballPairs(balls) {
  const cell = RADIUS * 2 + .008
  const grid = new Map()
  const pairs = []
  for (let index = 0; index < balls.length; index++) {
    const ball = balls[index]
    const key = pairKey(Math.floor(ball.x / cell), Math.floor(ball.y / cell), Math.floor(ball.z / cell))
    if (!grid.has(key)) grid.set(key, [])
    grid.get(key).push(index)
  }
  for (let index = 0; index < balls.length; index++) {
    const ball = balls[index]
    // Supported sleepers need no neighborhood search. Moving paper still
    // queries them and can wake them; unsupported sleepers still check stacks.
    if (ball.asleep && ball.supported) continue
    const ix = Math.floor(ball.x / cell); const iy = Math.floor(ball.y / cell); const iz = Math.floor(ball.z / cell)
    for (let x = ix - 1; x <= ix + 1; x++) for (let y = iy - 1; y <= iy + 1; y++) for (let z = iz - 1; z <= iz + 1; z++) {
      const bucket = grid.get(pairKey(x, y, z))
      if (bucket) for (const other of bucket) {
        if (other === index || (other > index && (!balls[other].asleep || !balls[other].supported))) continue
        pairs.push([ball, balls[other]])
      }
    }
  }
  return pairs
}

// Room coordinates fit comfortably in signed 10-bit cells. Keep arbitrary
// out-of-room inputs distinct too, without aliasing numeric room keys.
function pairKey(x, y, z) {
  return x >= -512 && x < 512 && y >= -512 && y < 512 && z >= -512 && z < 512
    ? (x + 512) + (y + 512) * 1024 + (z + 512) * 1048576 : `${x},${y},${z}`
}

function collidePair(a, b) {
  const dx = a.x - b.x; const dy = a.y - b.y; const dz = a.z - b.z
  const distance = Math.hypot(dx, dy, dz)
  const diameter = RADIUS * 2
  if (distance > diameter + .006) return
  const nx = distance > .000001 ? dx / distance : 1
  const ny = distance > .000001 ? dy / distance : 0
  const nz = distance > .000001 ? dz / distance : 0
  if (ny > .4) a.supported = true
  if (ny < -.4) b.supported = true
  if (a.asleep && b.asleep) return
  const relative = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny + (a.vz - b.vz) * nz
  if (relative < -.7 || distance < diameter - .03) {
    a.asleep = false; b.asleep = false; a.quiet = 0; b.quiet = 0
  }
  if (distance >= diameter) return
  const weightA = a.asleep ? 0 : 1; const weightB = b.asleep ? 0 : 1
  const total = weightA + weightB
  const correction = (diameter - distance) / total
  a.x += nx * correction * weightA; a.y += ny * correction * weightA; a.z += nz * correction * weightA
  b.x -= nx * correction * weightB; b.y -= ny * correction * weightB; b.z -= nz * correction * weightB
  if (relative < 0) {
    const impulse = -(1 + (relative < -.65 ? .25 : 0)) * relative / total
    a.vx += nx * impulse * weightA; a.vy += ny * impulse * weightA; a.vz += nz * impulse * weightA
    b.vx -= nx * impulse * weightB; b.vy -= ny * impulse * weightB; b.vz -= nz * impulse * weightB
  }
}

function step(state) {
  if (state.reaction) {
    state.reaction.remaining -= STEP
    if (state.reaction.remaining <= 0) state.reaction = null
  }
  if (state.cleanupIn > 0) {
    state.cleanupIn = Math.max(0, state.cleanupIn - STEP)
    if (state.cleanupIn === 0) { clearPaper(state, false); state.missStreak = 0 }
  }
  for (const ball of state.balls) {
    ball.supported = false
    ball.previousY = ball.y
    if (ball.asleep) continue
    integrate(ball)
  }
  // Iterative contacts allow stacks, including previously settled paper balls.
  const solids = sceneSolids(state)
  for (let iteration = 0; iteration < 4; iteration++) {
    for (const ball of state.balls) {
      staticCollisions(ball, state, solids)
      if (state.gameOver) return
    }
    for (const [a, b] of ballPairs(state.balls)) collidePair(a, b)
  }
  if (state.gameOver) return
  for (const ball of state.balls) {
    if (!ball.scored && ball.previousY >= BIN.height && ball.y < BIN.height && ball.vy < 0 &&
        Math.hypot(ball.x - BIN.x, ball.z - BIN.z) < binRadius(ball.y) - RADIUS - BIN.wall) {
      ball.scored = true; state.scored++
    }
    if (ball.supported) {
      ball.vx *= .96; ball.vz *= .96
      if (Math.abs(ball.vy) < .25) ball.vy *= .7
    }
    if (ball.asleep && !ball.supported) { ball.asleep = false; ball.quiet = 0 }
    if (!ball.asleep) {
      ball.quiet = ball.supported && Math.hypot(ball.vx, ball.vy, ball.vz) < .16 ? ball.quiet + STEP : 0
      if (ball.quiet > .65) { ball.asleep = true; ball.vx = 0; ball.vy = 0; ball.vz = 0 }
    }
  }
  // Resolve in launch order, once. A paper resting on a full bin counts as a miss
  // unless it crossed the mouth; later collisions never replay an old complaint.
  for (const ball of state.balls) {
    if (ball.resolved !== false) continue
    if (!ball.scored && !ball.asleep) break
    ball.resolved = true
    if (ball.scored) state.missStreak = 0
    else {
      state.missStreak = Math.min(4, state.missStreak + 1)
      if (state.cleanupIn > 0) continue
      if (ball.propHit && state.reaction) continue
      if (ball.personHit) {
        if (state.missStreak >= 4) {
          const line = hitLineFor(ball.personHit.speaker, ball.personHit.part, 3, ++state.reactionSerial)
          state.reaction = { id: line.id, remaining: 5.6 }; state.cleanupIn = 4.4
        }
        continue
      }
      // Give an immediate hit reaction time to finish before an older missed shot complains.
      if (state.missStreak < 4 && state.reaction && LINES.find(line => line.id === state.reaction.id)?.kind === 'hit') continue
      const line = lineFor(++state.reactionSerial, state.missStreak)
      state.reaction = { id: line.id, remaining: line.mood === 'angry' ? 5.6 : 3.6 }
      if (line.mood === 'angry') state.cleanupIn = 4.4
    }
  }
}

function moving(state) { return state.balls.some(ball => !ball.asleep) }
function active(state) { return !state.gameOver && (moving(state) || !!state.reaction || state.cleanupIn > 0) }
function inBinPile(ball) {
  return ball.y >= BIN.bottom + RADIUS - .012 &&
    Math.hypot(ball.x - BIN.x, ball.z - BIN.z) <= binRadius(ball.y) - BIN.wall + RADIUS * .35
}
function clearPaper(state, all = true) {
  const removed = state.balls.filter(ball => all || (ball.asleep && !inBinPile(ball)))
  const ids = new Set(removed.map(ball => ball.id))
  state.balls = state.balls.filter(ball => !ids.has(ball.id))
  state.cleared += removed.length
  state.clearedScored += removed.filter(ball => ball.scored).length
  state.personHits = PEOPLE.map(() => 0)
  if (all) {
    const { yaw, pitch, gameOver } = state
    Object.assign(state, initialState(), { yaw, pitch, gameOver })
  }
  return removed.length
}

function tick(state, milliseconds) {
  if (state.gameOver) return
  state.remainder += clamp(milliseconds / 1000, 0, .1)
  while (state.remainder >= STEP && !state.gameOver) { step(state); state.remainder -= STEP }
}

function snapshot(state) {
  return { version: 6, yaw: state.yaw, pitch: state.pitch, throws: state.throws, scored: state.scored,
    totalPersonHits: state.totalPersonHits, propHits: { ...state.propHits }, gameOver: state.gameOver,
    cleared: state.cleared, clearedScored: state.clearedScored, missStreak: state.missStreak,
    reactionSerial: state.reactionSerial, reaction: state.reaction && { ...state.reaction }, cleanupIn: state.cleanupIn,
    personHits: [...state.personHits], nextId: state.nextId,
    balls: state.balls.map(({ id, x, y, z, vx, vy, vz, asleep, quiet, scored, resolved, personHit, propHit }) =>
      ({ id, x, y, z, vx, vy, vz, asleep, quiet, scored, resolved: resolved !== false,
        personHit: personHit ? { ...personHit } : null, propHit: propHit || null })) }
}

function restore(value) {
  const fallback = initialState()
  if (!value || ![1, 2, 3, 4, 5, 6].includes(value.version) || !Array.isArray(value.balls) ||
      !Number.isSafeInteger(value.throws) || value.throws < 0 || !Number.isSafeInteger(value.scored) ||
      value.scored < 0 || value.scored > value.throws ||
      !Number.isFinite(value.yaw) || !Number.isFinite(value.pitch)) return fallback
  const cleared = value.version < 4 ? 0 : value.cleared
  const clearedScored = value.version < 4 ? 0 : value.clearedScored
  if (!Number.isSafeInteger(cleared) || cleared < 0 || value.balls.length + cleared !== value.throws ||
      !Number.isSafeInteger(clearedScored) || clearedScored < 0 || clearedScored > cleared) return fallback
  if (value.version >= 4 && (!Number.isSafeInteger(value.nextId) || value.nextId < 1 ||
      !Number.isInteger(value.missStreak) || value.missStreak < 0 || value.missStreak > 4 ||
      !Number.isSafeInteger(value.reactionSerial) || value.reactionSerial < 0 ||
      !Number.isFinite(value.cleanupIn) || value.cleanupIn < 0 || value.cleanupIn > 4.4 ||
      (value.reaction && (!LINES.some(line => line.id === value.reaction.id) ||
        !Number.isFinite(value.reaction.remaining) || value.reaction.remaining <= 0 || value.reaction.remaining > 5.6)))) return fallback
  if (value.version >= 5 && (!Array.isArray(value.personHits) || value.personHits.length !== PEOPLE.length ||
      value.personHits.some(count => !Number.isInteger(count) || count < 0 || count > 3))) return fallback
  if (value.version >= 6 && (!Number.isSafeInteger(value.totalPersonHits) || value.totalPersonHits < 0 ||
      value.totalPersonHits > value.throws || !value.propHits || typeof value.propHits !== 'object' ||
      Object.keys(value.propHits).some(id => !PROPS.some(prop => prop.id === id) || value.propHits[id] !== true) ||
      ![null, 'people', 'bell'].includes(value.gameOver) ||
      (value.totalPersonHits >= HIT_LIMIT && value.gameOver !== 'people' && value.gameOver !== 'bell'))) return fallback
  const ids = new Set()
  const balls = []
  let maxId = 0
  for (const ball of value.balls) {
    if (!ball || !['x', 'y', 'z', 'vx', 'vy', 'vz'].every(key => Number.isFinite(ball[key])) ||
        !Number.isSafeInteger(ball.id) || ball.id < 1 || ids.has(ball.id) ||
        ball.x < ROOM.left - .3 || ball.x > (value.version < 3 ? 3 : ROOM.right) + .3 || ball.y < -.3 || ball.y > ROOM.ceiling + .3 ||
        ball.z < ROOM.near - .3 || ball.z > (value.version < 3 ? 8 : ROOM.far) + .3 || Math.hypot(ball.vx, ball.vy, ball.vz) > 30) return fallback
    if (value.version >= 5 && ball.personHit && (!Number.isInteger(ball.personHit.speaker) ||
        ball.personHit.speaker < 0 || ball.personHit.speaker >= PEOPLE.length ||
        !['head', 'body', 'arm', 'leg'].includes(ball.personHit.part))) return fallback
    if (value.version >= 6 && ball.propHit && !PROPS.some(prop => prop.id === ball.propHit)) return fallback
    ids.add(ball.id)
    maxId = Math.max(maxId, ball.id)
    balls.push({ id: ball.id, x: ball.x, y: ball.y, z: ball.z, vx: ball.asleep ? 0 : ball.vx,
      vy: ball.asleep ? 0 : ball.vy, vz: ball.asleep ? 0 : ball.vz,
      asleep: ball.asleep === true, quiet: 0, scored: ball.scored === true,
      resolved: value.version < 4 ? !!(ball.asleep || ball.scored) : ball.resolved !== false,
      personHit: value.version >= 5 && ball.personHit ? { ...ball.personHit } : null,
      propHit: value.version >= 6 ? ball.propHit || null : null })
  }
  if (balls.filter(ball => ball.scored).length + clearedScored !== value.scored) return fallback
  if (value.version < 3) {
    // Move existing contents with the old bin, preserving every paper and score.
    // Wake legacy paper so its new radius and furniture supports can settle naturally.
    const oldBin = value.version === 1
      ? { z: 4.6, bottom: .055, height: .82, baseRadius: .34, radius: .48, wall: .018 }
      : { z: 5.45, bottom: .035, height: .58, baseRadius: .235, radius: .32, wall: .015 }
    const oldRadius = value.version === 1 ? .095 : RADIUS
    for (const ball of balls) {
      const rho = Math.hypot(ball.x, ball.z - oldBin.z)
      const oldT = clamp((ball.y - oldBin.bottom) / (oldBin.height - oldBin.bottom), 0, 1)
      const shellRadius = oldBin.baseRadius + (oldBin.radius - oldBin.baseRadius) * oldT
      if (rho < shellRadius - oldBin.wall && ball.y >= oldBin.bottom &&
          (ball.y <= oldBin.height + oldRadius || (ball.scored && ball.asleep))) {
        const heightRatio = (ball.y - oldBin.bottom - oldRadius) / (oldBin.height - oldBin.bottom - oldRadius)
        const y = BIN.bottom + RADIUS + heightRatio * (BIN.height - BIN.bottom - RADIUS)
        const radialScale = (binRadius(y) - RADIUS - BIN.wall) / (shellRadius - oldRadius - oldBin.wall)
        ball.x = BIN.x + ball.x * radialScale
        ball.z = BIN.z + (ball.z - oldBin.z) * radialScale
        ball.y = y
      }
      ball.x = clamp(ball.x, ROOM.left + RADIUS, ROOM.right - RADIUS)
      ball.z = clamp(ball.z, ROOM.near + RADIUS, ROOM.far - RADIUS)
      ball.asleep = false
    }
  }
  return { ...fallback, yaw: clamp(value.yaw + (value.version < 3 ? DEFAULT_AIM.yaw : 0), -.68, .68), pitch: clamp(value.pitch, .12, 1.12),
    throws: value.throws, scored: value.scored, cleared, clearedScored,
    nextId: Math.max(maxId + 1, value.throws + 1, value.nextId || 1), balls,
    ...(value.version >= 4 ? { missStreak: value.missStreak, reactionSerial: value.reactionSerial,
      reaction: value.reaction && { ...value.reaction }, cleanupIn: value.cleanupIn } : {}),
    personHits: value.version >= 5 ? [...value.personHits] : fallback.personHits,
    ...(value.version >= 6 ? { totalPersonHits: value.totalPersonHits, propHits: { ...value.propHits }, gameOver: value.gameOver } : {}) }
}

module.exports = { SAVE_KEY, STEP, RADIUS, MAX_CHARGE_MS, ROOM, BIN, ORIGIN, DEFAULT_AIM, DESKS, PEOPLE, SOLIDS, PROPS, HIT_LIMIT,
  propSolid,
  armPoints, binRadius, initialState, aim, launch, tick, moving, active, inBinPile, clearPaper, snapshot, restore }
