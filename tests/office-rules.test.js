const { test } = require('node:test')
const assert = require('node:assert/strict')
const rules = require('../games/office/rules.js')
const { BIN, RADIUS: R, STEP, ROOM, SOLIDS, ORIGIN } = rules

function run(state, seconds) {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) rules.tick(state, 1000 / 60)
}
function body(id, values = {}) {
  return { id, x: 1, y: 1, z: 3, vx: 0, vy: 0, vz: 0, quiet: 0, asleep: false, scored: false, ...values }
}
function fixture(balls) { return { ...rules.initialState(), balls, throws: balls.length, nextId: balls.length + 1 } }

test('boss freezes other simultaneous impacts exactly at the eighth person hit', () => {
  const state = rules.initialState(); const person = rules.PEOPLE[0]
  state.throws = 7; state.cleared = 7; state.nextId = 8; state.totalPersonHits = 7
  for (let index = 0; index < 2; index++) {
    Object.assign(rules.launch(state, 0), { x: person.x, y: 1.32,
      z: person.z - .035 - .115 - R - .01, vx: 0, vy: 0, vz: 4 })
  }
  rules.tick(state, STEP * 1000)
  assert.equal(state.gameOver, 'people'); assert.equal(state.totalPersonHits, 8)
  assert.equal(state.balls.filter(ball => ball.personHit).length, 1)
  const saved = rules.snapshot(state); run(state, 10)
  assert.deepEqual(rules.snapshot(state), saved)
})

test('tipping a prop preserves an angry cleanup reaction and its timer', () => {
  const state = rules.initialState(); const prop = rules.PROPS[0]
  const angry = require('../games/office/dialogue.js').LINES.find(line => line.mood === 'angry')
  state.reaction = { id: angry.id, remaining: 5 }; state.cleanupIn = 3
  Object.assign(rules.launch(state, 0), { x: prop.x + prop.w / 2, y: prop.y + prop.h / 2,
    z: prop.z - prop.d / 2 - R - .01, vx: 0, vy: 0, vz: 4 })
  rules.tick(state, STEP * 1000)
  assert.equal(state.propHits.cup, true)
  assert.equal(state.reaction.id, angry.id); assert.ok(state.cleanupIn > 2.9)
})

test('waking paper below the rim cannot score from an obsolete previous height', () => {
  const state = fixture([body(1, { x: BIN.x, z: BIN.z, y: .4, previousY: 1,
    asleep: true, vy: -.1, resolved: true })])
  rules.tick(state, STEP * 1000)
  assert.equal(state.scored, 0); assert.equal(state.balls[0].asleep, false)
})

test('swiping controls yaw and elevation; only held time determines power and is bounded', () => {
  const state = rules.initialState()
  rules.aim(state, 60, -40, 375)
  assert.ok(state.yaw > 0 && state.pitch > .48)
  rules.aim(state, -1e5, 1e5, 375)
  assert.equal(state.yaw, -.68); assert.equal(state.pitch, .12)
  const speeds = [-100, 0, 800, 1600, 9000].map(ms => {
    const ball = rules.launch(rules.initialState(), ms)
    return Math.hypot(ball.vx, ball.vy, ball.vz)
  })
  assert.equal(speeds[0], speeds[1]); assert.ok(speeds[2] > speeds[1])
  assert.equal(speeds[3], speeds[4]); assert.ok(Math.abs(speeds[3] - 10) < 1e-9)
})

test('short throw lands, bounces and stays; centred throw enters open bin once and settles inside', () => {
  const miss = rules.initialState(); rules.launch(miss, 200); run(miss, 6)
  assert.equal(miss.scored, 0); assert.equal(miss.balls.length, 1)
  assert.equal(miss.balls[0].asleep, true); assert.ok(Math.abs(miss.balls[0].y - R) < .006)
  assert.ok(BIN.z - ORIGIN.z > 4, 'bin must be more than four metres from the throw origin')
  const hit = rules.initialState(); rules.launch(hit, 1120); run(hit, 6)
  assert.equal(hit.scored, 1); assert.equal(hit.balls.length, 1)
  const ball = hit.balls[0]
  assert.ok(Math.abs(ball.y - (BIN.bottom + R)) < .006)
  assert.ok(Math.hypot(ball.x - BIN.x, ball.z - BIN.z) < BIN.baseRadius)
  assert.equal(ball.asleep, true)
  run(hit, 10); assert.equal(hit.scored, 1)
})

test('bin outside, inside, bottom and rim resolve physical contacts without treating the opening as a lid', () => {
  const height = BIN.height * .6
  const shell = rules.binRadius(height)
  const outside = fixture([body(1, { x: BIN.x - shell - R - BIN.wall - .02, y: height, z: BIN.z, vx: 3 })])
  run(outside, .08); assert.ok(outside.balls[0].vx < 0)
  const inside = fixture([body(1, { x: BIN.x + shell - R - BIN.wall - .02, y: height, z: BIN.z, vx: 3 })])
  run(inside, .05); assert.ok(inside.balls[0].vx < 0)
  const rim = fixture([body(1, { x: BIN.x + BIN.radius, y: BIN.height + R + .012, z: BIN.z, vy: -2 })])
  rules.tick(rim, 1000 * STEP * 2); assert.ok(rim.balls[0].vy > 0)
  assert.equal(rim.scored, 0)
  const open = fixture([body(1, { x: BIN.x + .02, y: BIN.height + .15, z: BIN.z, vy: -1 })])
  run(open, .25); assert.ok(open.balls[0].y < BIN.height - .1); assert.equal(open.scored, 1)
  run(open, 3); assert.ok(open.balls[0].y >= BIN.bottom + R - .005)
})

test('walls, floor, ceiling and rendered office desk all collide', () => {
  const cases = [
    { x: ROOM.right - R - .01, y: 1, z: 1, vx: 4, axis: 'vx', sign: -1 },
    { x: ROOM.left + R + .01, y: 1, z: 1, vx: -4, axis: 'vx', sign: 1 },
    { z: ROOM.far - R - .01, y: 1, vz: 4, axis: 'vz', sign: -1 },
    { z: ROOM.near + R + .01, y: 1, vz: -4, axis: 'vz', sign: 1 },
    { y: ROOM.ceiling - R - .01, vy: 4, axis: 'vy', sign: -1 },
    { y: R + .01, vy: -4, axis: 'vy', sign: 1 }
  ]
  for (const values of cases) {
    const state = fixture([body(1, values)])
    rules.tick(state, 1000 * STEP * 2)
    assert.ok(state.balls[0][values.axis] * values.sign > 0, JSON.stringify(values))
  }
  for (const solid of SOLIDS.filter(item => ['monitor', 'keyboard', 'notebook', 'mouse', 'person-head'].includes(item.kind))) {
    const state = fixture([body(1, { x: (solid.min[0] + solid.max[0]) / 2,
      y: solid.max[1] + R + .01, z: (solid.min[2] + solid.max[2]) / 2, vy: -4 })])
    rules.tick(state, 1000 * STEP * 2)
    assert.ok(state.balls[0].vy > 0, `${solid.kind} must match its rendered collision geometry`)
  }
  for (const desk of SOLIDS.filter(item => item.kind === 'desk')) {
    const state = fixture([body(1, { x: desk.max[0] - .04, y: desk.max[1] + R + .01,
      z: desk.max[2] - .06, vy: -4 })])
    rules.tick(state, 1000 * STEP * 2)
    assert.ok(state.balls[0].vy > 0, `${desk.deskId} desktop must collide`)
  }
})

test('new paper collides with settled paper and wakes it; stable stacks stop simulating', () => {
  const resting = body(1, { x: 0, y: R, z: 2, asleep: true })
  const arriving = body(2, { x: -.3, y: R, z: 2, vx: 4 })
  const state = fixture([resting, arriving]); run(state, .07)
  assert.equal(resting.asleep, false); assert.ok(resting.vx > .3)
  assert.ok(arriving.vx < 3)
  run(state, 6); assert.equal(state.balls.length, 2); assert.equal(rules.moving(state), false)
  const pile = rules.initialState()
  for (let shot = 0; shot < 18; shot++) { rules.launch(pile, 1120); run(pile, 3) }
  run(pile, 8)
  assert.equal(pile.balls.length, 18); assert.ok(pile.scored >= 10)
  assert.ok(pile.balls.some(ball => ball.y > BIN.bottom + R * 2.5))
  assert.equal(rules.moving(pile), false, 'settled pile must release the animation loop')
  for (const ball of pile.balls) assert.ok(ball.y >= R - .012)
})

test('desk undersides, front edges and all sixteen legs bounce full-speed paper without triggering a person reaction', () => {
  for (const desk of SOLIDS.filter(solid => solid.kind === 'desk')) {
    for (const [position, axis] of [
      [{ x: desk.max[0] - .06, y: desk.min[1] - R - .01, z: desk.min[2] + .04, vy: 10 }, 'vy'],
      [{ x: desk.max[0] - .06, y: (desk.min[1] + desk.max[1]) / 2, z: desk.min[2] - R - .01, vz: 10 }, 'vz']
    ]) {
      const state = fixture([body(1, { ...position, resolved: false })])
      rules.tick(state, STEP * 1000 * 2)
      assert.ok(state.balls[0][axis] < 0, `${desk.deskId} ${axis}`)
      assert.equal(state.reaction, null)
    }
  }
  const legs = SOLIDS.filter(solid => solid.kind === 'desk-leg')
  assert.equal(legs.length, 16)
  for (const leg of legs) {
    const state = fixture([body(1, { x: leg.max[0] + R + .01, y: .12,
      z: (leg.min[2] + leg.max[2]) / 2, vx: -10, resolved: false })])
    rules.tick(state, STEP * 1000 * 2)
    assert.ok(state.balls[0].vx > 0, `${leg.deskId} leg`)
    assert.equal(state.reaction, null)
  }
})

function aimedAt(personId, held, pitch = .48) {
  const state = rules.initialState(); const person = rules.PEOPLE[personId]
  state.yaw = Math.atan2(person.x - ORIGIN.x, person.z - ORIGIN.z); state.pitch = pitch
  const ball = rules.launch(state, held)
  let before
  for (let step = 0; step < 240 && !ball.personHit; step++) { before = { ...ball }; rules.tick(state, STEP * 1000) }
  return { state, ball, before }
}

test('real throws hit each co-worker, rebound and show immediate head/body reactions before settling', () => {
  const { LINES } = require('../games/office/dialogue.js')
  for (const person of rules.PEOPLE) {
    const results = [aimedAt(person.id, person.id === 0 ? 600 : 1000),
      aimedAt(person.id, person.id === 0 ? 800 : 1200)]
    for (const [index, { state, ball, before }] of results.entries()) {
      assert.deepEqual(ball.personHit, { speaker: person.id, part: index === 0 ? 'body' : 'head' })
      assert.equal(ball.asleep, false); assert.equal(ball.resolved, false)
      assert.ok(Math.hypot(ball.vx - before.vx, ball.vy - before.vy, ball.vz - before.vz) > .9,
        'impact must physically change velocity, including glancing head hits')
      const line = LINES.find(line => line.id === state.reaction.id)
      assert.equal(line.kind, 'hit'); assert.equal(line.speaker, person.id)
      assert.equal(state.personHits[person.id], 1)
      const serial = state.reactionSerial
      const restored = rules.restore(rules.snapshot(state))
      assert.deepEqual(restored.balls[0].personHit, ball.personHit)
      run(restored, 7)
      assert.equal(restored.reactionSerial, serial, 'landing/reload must not replace or replay the hit reaction')
      assert.equal(restored.personHits[person.id], 1); assert.equal(restored.missStreak, 1)
      assert.equal(restored.balls.length, 1)
    }
    assert.notEqual(results[0].state.reaction.id, results[1].state.reaction.id)
  }
})

test('arms and legs use physical capsules; brushing a person slowly does not spam dialogue', () => {
  const arm = aimedAt(1, 1460, .16)
  assert.deepEqual(arm.ball.personHit, { speaker: 1, part: 'arm' })
  const leg = aimedAt(2, 480, .12)
  assert.deepEqual(leg.ball.personHit, { speaker: 2, part: 'leg' })
  const person = rules.PEOPLE[0]
  const state = fixture([body(1, { x: person.x, y: 1.32, z: person.z - .035 - .115 - R + .002,
    vz: .1, resolved: false })])
  rules.tick(state, STEP * 1000)
  assert.equal(state.reaction, null); assert.equal(state.personHits[0], 0)
  const raised = fixture([body(1, { x: person.x + .27 + .04 + R + .01,
    y: 1.04, z: person.z - .02, vx: -4, resolved: false })])
  raised.reaction = { id: 'lin-hit-head-1', remaining: 4 }
  rules.tick(raised, STEP * 1000 * 2)
  assert.deepEqual(raised.balls[0].personHit, { speaker: 0, part: 'arm' }, 'raised arms must collide in their displayed pose')
  assert.ok(raised.balls[0].vx > 0)
})

test('three hits on the same person escalate once per paper, preserve cleanup across reload and reset after cleaning', () => {
  let state = rules.initialState(); const person = rules.PEOPLE[0]
  state.yaw = Math.atan2(person.x - ORIGIN.x, person.z - ORIGIN.z)
  const moods = []
  for (let hit = 0; hit < 3; hit++) {
    const ball = rules.launch(state, 800)
    for (let step = 0; step < 240 && !ball.personHit; step++) rules.tick(state, STEP * 1000)
    assert.equal(state.personHits[0], hit + 1); assert.equal(state.reactionSerial, hit + 1)
    moods.push(require('../games/office/dialogue.js').LINES.find(line => line.id === state.reaction.id).mood)
    if (hit < 2) run(state, 5)
  }
  assert.deepEqual(moods, ['hurt', 'warning', 'angry'])
  assert.ok(state.cleanupIn > 4)
  state = rules.restore(rules.snapshot(state)); assert.equal(state.personHits[0], 3)
  run(state, 8)
  assert.equal(state.balls.length, 0); assert.equal(state.cleared, 3); assert.equal(state.throws, 3)
  assert.deepEqual(state.personHits, [0, 0, 0]); assert.equal(rules.active(state), false)
  const legacy = { ...rules.snapshot(state), version: 4 }
  delete legacy.personHits
  const migrated = rules.restore(legacy)
  assert.equal(migrated.throws, 3); assert.equal(migrated.cleared, 3)
  assert.deepEqual(migrated.personHits, [0, 0, 0])
  const invalid = rules.snapshot(state); invalid.personHits[0] = 100
  assert.equal(rules.restore(invalid).throws, 0)
  invalid.personHits[0] = 0; invalid.balls = [body(1, { personHit: { speaker: 3, part: 'head' } })]
  invalid.throws = 1; invalid.cleared = 0
  assert.equal(rules.restore(invalid).balls.length, 0)
})

test('legacy bin contents move with the distant bin; all old paper and scores survive the migration once', () => {
  const legacy = { version: 1, yaw: .15, pitch: .52, throws: 4, scored: 2, nextId: 5, balls: [
    body(1, { x: .1, y: .15, z: 4.6, asleep: true, scored: true }),
    body(2, { x: -.1, y: .34, z: 4.65, asleep: true, scored: true }),
    body(3, { x: 1, y: .095, z: 2, asleep: true }),
    body(4, { x: -1.5, y: 1.135, z: 3.5, asleep: true })
  ] }
  const restored = rules.restore(legacy)
  assert.equal(restored.version, 6); assert.equal(restored.throws, 4); assert.equal(restored.scored, 2)
  assert.equal(restored.yaw, legacy.yaw + rules.DEFAULT_AIM.yaw); assert.equal(restored.pitch, legacy.pitch)
  for (const ball of restored.balls.slice(0, 2)) {
    assert.ok(Math.hypot(ball.x - BIN.x, ball.z - BIN.z) < rules.binRadius(ball.y) - R - BIN.wall)
    assert.ok(ball.y >= BIN.bottom + R - .001)
  }
  assert.equal(restored.balls[2].z, 2); assert.equal(restored.balls[3].z, 3.5)
  assert.ok(restored.balls.every(ball => !ball.asleep))
  run(restored, 8)
  assert.equal(restored.balls.length, 4); assert.equal(restored.scored, 2)
  assert.equal(rules.moving(restored), false)
  const saved = rules.snapshot(restored)
  saved.balls.forEach(ball => { ball.quiet = 0 })
  assert.deepEqual(rules.snapshot(rules.restore(saved)), saved, 'current coordinates must not migrate again')
})

test('misses complain once, escalate on four consecutive misses, clean loose paper and keep bin contents and totals', () => {
  const state = rules.initialState()
  rules.launch(state, 1120); run(state, 4)
  assert.equal(state.scored, 1)
  const ids = []
  for (let shot = 0; shot < 4; shot++) {
    rules.launch(state, 200)
    for (let frame = 0; frame < 360 && state.reactionSerial <= shot; frame++) rules.tick(state, 1000 / 60)
    assert.equal(state.reactionSerial, shot + 1)
    ids.push(state.reaction.id)
  }
  assert.equal(new Set(ids).size, 4)
  assert.equal(state.missStreak, 4); assert.ok(state.cleanupIn > 4)
  assert.equal(require('../games/office/dialogue.js').LINES.find(line => line.id === ids[3]).mood, 'angry')
  const restored = rules.restore(rules.snapshot(state))
  assert.equal(restored.missStreak, 4); assert.equal(restored.reaction.id, state.reaction.id)
  run(restored, 7)
  assert.equal(restored.balls.length, 1); assert.equal(restored.cleared, 4)
  assert.equal(restored.scored, 1); assert.equal(restored.throws, 5)
  assert.ok(rules.inBinPile(restored.balls[0])); assert.equal(restored.missStreak, 0)
  assert.equal(rules.active(restored), false)
  rules.launch(restored, 1120); run(restored, 4)
  assert.equal(restored.scored, 2); assert.equal(restored.missStreak, 0)
  rules.clearPaper(restored)
  assert.equal(restored.balls.length, 0); assert.equal(restored.scored, 0); assert.equal(restored.throws, 0)
  const clean = rules.restore(rules.snapshot(restored))
  assert.equal(clean.balls.length, 0); assert.equal(clean.cleared, 0); assert.equal(clean.clearedScored, 0)
  const ball = rules.launch(clean, 1120)
  assert.equal(ball.id, 1, 'manual cleanup starts a fresh count')
})

test('hit breaks the miss streak; overlapping shots resolve once in launch order', () => {
  const state = rules.initialState()
  rules.launch(state, 200); rules.launch(state, 1120)
  run(state, 6)
  assert.equal(state.scored, 1); assert.equal(state.reactionSerial, 1); assert.equal(state.missStreak, 0)
  run(state, 10); assert.equal(state.reactionSerial, 1)
  const flying = rules.launch(state, 1120)
  const loose = { ...flying, id: state.nextId++, x: 1.4, y: R, z: 3, asleep: true, resolved: true }
  state.balls.push(loose); state.throws++
  rules.clearPaper(state, false)
  assert.ok(state.balls.includes(flying), 'automatic cleanup must leave in-flight paper intact')
  assert.ok(!state.balls.includes(loose))
})

test('gravity-filled bin piles above the rim and spills; paper never disappears or compresses into the bin', () => {
  const state = require('../tools/office-pile.cjs').fullBin()
  assert.equal(state.balls.length, 110)
  assert.ok(state.balls.some(ball => rules.inBinPile(ball) && ball.y > BIN.height + R * .3))
  assert.ok(state.balls.some(ball => !rules.inBinPile(ball) && ball.y < BIN.height), 'overflow must fall outside')
  for (const ball of state.balls) assert.ok(Number.isFinite(ball.y) && ball.y >= R - .012)
  for (let a = 0; a < state.balls.length; a++) for (let b = a + 1; b < state.balls.length; b++) {
    const one = state.balls[a]; const two = state.balls[b]
    assert.ok(Math.hypot(one.x - two.x, one.y - two.y, one.z - two.z) >= R * 2 - .025)
  }
  const saved = rules.restore(rules.snapshot(state))
  assert.equal(saved.balls.length, 110)
})

test('workstations leave a clear aisle to the corner bin; hand starts ahead of the player desktop without intersecting furniture', () => {
  assert.equal(rules.DESKS.length, 4)
  assert.ok(ROOM.right - BIN.x > BIN.radius && ROOM.right - BIN.x < .6)
  assert.ok(ROOM.far - BIN.z > BIN.radius && ROOM.far - BIN.z < .6)
  const player = SOLIDS.find(solid => solid.kind === 'desk' && solid.deskId === 'player')
  assert.ok(ORIGIN.z < player.min[2] && ORIGIN.y - R > player.max[1])
  const state = rules.initialState(); const shot = rules.launch(state, 1120)
  const original = { ...shot }; rules.tick(state, STEP * 1000)
  assert.ok(shot.vx > 0 && shot.vy > 0 && shot.vz > 0)
  assert.ok(Math.abs(shot.x - original.x - original.vx * STEP) < .001)
  const ground = fixture([body(1, { x: 1.2, y: R, z: 4, asleep: true })])
  const legacy = { ...rules.snapshot(ground), version: 2, yaw: 0, throws: 3, scored: 1, balls: [
    body(1, { x: .1, y: .1, z: 5.45, asleep: true, scored: true }),
    body(2, { x: 1.2, y: R, z: 4, asleep: true }),
    body(3, { x: 2.8, y: R, z: 7.9, asleep: true })
  ] }
  const moved = rules.restore(legacy)
  assert.equal(moved.throws, 3); assert.equal(moved.scored, 1)
  assert.ok(Math.abs(moved.balls[0].x - BIN.x - .1) < .001)
  assert.ok(Math.abs(moved.balls[0].z - BIN.z) < .001)
  assert.equal(moved.balls[1].z, 4)
  assert.ok(moved.balls[2].z <= ROOM.far - R && moved.balls[2].x <= ROOM.right - R)
  run(moved, 6); assert.equal(moved.balls.length, 3); assert.equal(moved.scored, 1)
})

test('no old paper is culled; restore keeps all paper, aim, scores and in-flight velocities', () => {
  const state = fixture(Array.from({ length: 160 }, (_, index) => body(index + 1, {
    x: -2.7 + index % 28 * .195, y: R, z: .8 + Math.floor(index / 28) * .2, asleep: true
  })))
  state.yaw = .2; state.pitch = .7
  const flying = rules.launch(state, 1000)
  const saved = rules.snapshot(state)
  const restored = rules.restore(JSON.parse(JSON.stringify(saved)))
  assert.equal(restored.balls.length, 161); assert.equal(restored.throws, 161)
  assert.equal(restored.yaw, .2); assert.equal(restored.pitch, .7)
  assert.equal(restored.balls.at(-1).vz, flying.vz)
  run(restored, .3); assert.equal(restored.balls.length, 161)
  saved.balls[0].x = NaN; assert.equal(rules.restore(saved).balls.length, 0)
  const duplicate = rules.snapshot(state); duplicate.balls[1].id = duplicate.balls[0].id
  assert.equal(rules.restore(duplicate).throws, 0)
})

test('fixed steps reproduce the trajectory at different frame rates and do not catch up background time', () => {
  const a = rules.initialState(); const b = rules.initialState()
  rules.launch(a, 800); rules.launch(b, 800)
  for (let i = 0; i < 60; i++) rules.tick(a, 1000 / 60)
  for (let i = 0; i < 30; i++) rules.tick(b, 1000 / 30)
  for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(a.balls[0][axis] - b.balls[0][axis]) < .02)
  const c = rules.initialState(); rules.launch(c, 800); rules.tick(c, 60000)
  assert.ok(c.balls[0].z < 2)
})

test('subtle props are reachable by real throws, tip once, retain state and the bell calls the boss', () => {
  for (const [id, pitch, held] of [['cup', .12, 1400], ['plant', .28, 1520], ['bell', .36, 1280]]) {
    const state = rules.initialState(); const prop = rules.PROPS.find(prop => prop.id === id)
    state.yaw = Math.atan2(prop.x + prop.w / 2 - ORIGIN.x, prop.z - ORIGIN.z); state.pitch = pitch
    const ball = rules.launch(state, held)
    for (let step = 0; step < 240 && !ball.propHit; step++) rules.tick(state, STEP * 1000)
    assert.equal(ball.propHit, id); assert.equal(state.propHits[id], true)
    assert.equal(rules.restore(rules.snapshot(state)).propHits[id], true)
    if (id === 'bell') {
      assert.equal(state.gameOver, 'bell'); assert.equal(rules.active(state), false)
      assert.equal(rules.launch(state, 1120), null)
    } else {
      assert.equal(require('../games/office/dialogue.js').LINES.find(line => line.id === state.reaction.id).kind, 'prop')
      const solid = rules.propSolid(prop, state)
      assert.equal(solid.max[1] - solid.min[1], prop.w)
      let serial = state.reactionSerial
      for (let step = 0; step < 120; step++) {
        rules.tick(state, STEP * 1000)
        if (state.reactionSerial !== serial) {
          assert.notEqual(require('../games/office/dialogue.js').LINES.find(line => line.id === state.reaction.id).kind, 'prop')
          serial = state.reactionSerial
        }
      }
    }
  }
})

test('eight cumulative person hits call the boss across automatic cleanups; restart counters manually', () => {
  let state = rules.initialState(); const person = rules.PEOPLE[0]
  state.yaw = Math.atan2(person.x - ORIGIN.x, person.z - ORIGIN.z)
  for (let hit = 1; hit <= rules.HIT_LIMIT; hit++) {
    const ball = rules.launch(state, 800)
    for (let step = 0; step < 240 && !ball.personHit; step++) rules.tick(state, STEP * 1000)
    assert.ok(ball.personHit); assert.equal(state.totalPersonHits, hit)
    assert.equal(!!state.gameOver, hit === rules.HIT_LIMIT)
    if (!state.gameOver) {
      run(state, 6); rules.clearPaper(state, false)
      assert.equal(state.totalPersonHits, hit)
      state = rules.restore(rules.snapshot(state))
    }
  }
  const saved = rules.snapshot(state)
  run(state, 60); assert.deepEqual(rules.snapshot(state), saved)
  assert.equal(rules.restore(saved).gameOver, 'people')
  assert.equal(rules.launch(state, 800), null)
  const newGame = rules.initialState()
  newGame.yaw = -.2; newGame.totalPersonHits = 2; newGame.propHits.cup = true
  rules.clearPaper(newGame)
  assert.equal(newGame.totalPersonHits, 0); assert.deepEqual(newGame.propHits, {})
  assert.equal(newGame.yaw, -.2)
})
