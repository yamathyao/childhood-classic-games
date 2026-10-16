const test = require('node:test')
const assert = require('node:assert/strict')
const rules = require('../games/roadtrip/rules.js')
const route = require('../games/roadtrip/route.js')

test('standalone preview uses identical native simulation and art modules', () => {
  const fs = require('node:fs'); const path = require('node:path')
  for (const name of ['rules.js', 'route.js', 'scenery.js', 'art.js']) assert.equal(
    fs.readFileSync(path.join(__dirname, '../tools/previews/roadtrip', name), 'utf8'),
    fs.readFileSync(path.join(__dirname, '../games/roadtrip', name), 'utf8'), name)
})

function mainRoad(options = {}) {
  const state = rules.create(options)
  Object.assign(state, { phase: 'driving', lane: 1, targetLane: 1, distance: 150 })
  return state
}

function drive(state, seconds, input = {}) {
  for (let i = 0; i < seconds * 120 && state.status === 'running'; i++) rules.step(state, input, 1 / 120)
}

test('cruise follows traffic safely over multiple seeded two-minute runs', () => {
  for (const density of ['easy', 'normal', 'busy']) {
    for (let seed = 1; seed <= 12; seed++) {
      const state = rules.create({ seed, density }); rules.start(state); drive(state, 120)
      assert.equal(state.status, 'running', `${density}, seed ${seed}: cruise should maintain a safe gap`)
      assert.ok(state.distance > 1200)
      assert.ok(state.traffic.length <= 25, 'Recycled traffic stays bounded')
    }
  }
})

test('lane changes respect boundaries and reject occupied adjacent lanes', () => {
  const state = mainRoad({ seed: 1 }); rules.start(state)
  state.traffic = [{ id: 99, lane: 2, z: 4, speed: 20, desired: 20 }]
  assert.equal(rules.changeLane(state, 1), false)
  assert.equal(state.targetLane, 1)
  assert.match(state.notice, /旁边有车/)
  assert.equal(rules.changeLane(state, -1), true)
  drive(state, 1)
  assert.ok(state.lane < .01)
  assert.equal(rules.changeLane(state, -1), false)
})

test('overtaking accepts shorter front and rear gaps in either adjacent lane', () => {
  for (const direction of [-1, 1]) {
    for (const z of [-8, 8]) {
      const state = mainRoad({ seed: 25 }); rules.start(state); state.speed = 20
      state.traffic = [{ id: 99, lane: 1 + direction, z, speed: 20, desired: 20 }]
      assert.equal(rules.changeLane(state, direction), true, `Allow a ${z} m gap when moving ${direction}`)
      drive(state, 1)
      assert.equal(state.status, 'running', 'Tighter maneuver should still clear the other car')
      assert.ok(Math.abs(state.lane - (1 + direction)) < .01)
    }
    for (const z of [-6, 0, 6]) {
      const state = mainRoad({ seed: 25 }); rules.start(state)
      state.traffic = [{ id: 99, lane: 1 + direction, z, speed: 20, desired: 20 }]
      assert.equal(rules.changeLane(state, direction), false, 'Overlapping or nearly alongside cars still block the maneuver')
    }
  }
})

test('cruise follows at the shorter gap without braking unnecessarily', () => {
  const state = mainRoad({ seed: 26 }); rules.start(state); state.speed = 20
  state.traffic = [{ id: 99, lane: 1, z: 16, speed: 20, desired: 20 }]
  drive(state, .1)
  assert.ok(state.speed >= 20, 'Cruise can hold its speed with a 16 m gap to an equally fast leader')
  assert.equal(state.status, 'running')
})

test('manual steering is continuous, clamped, and stops after release', () => {
  const state = mainRoad({ seed: 2, mode: 'manual' }); rules.start(state); state.traffic = []
  drive(state, .2, { right: true }); assert.ok(state.lane > 1.3 && state.lane < 1.5)
  const lane = state.lane; drive(state, .2); assert.equal(state.lane, lane)
  drive(state, 5, { left: true }); assert.equal(state.lane, 0)
})

test('gas and brake work in both modes and respect the selected car top speed', () => {
  for (const mode of ['cruise', 'manual']) {
    const state = mainRoad({ seed: 3, mode, model: 5 }); rules.start(state); state.traffic = []
    drive(state, 2, { accelerate: true }); assert.ok(state.speed * 3.6 > 125)
    assert.ok(state.speed * 3.6 <= rules.CARS[5].max)
    drive(state, 1, { brake: true }); assert.ok(state.speed * 3.6 < 75)
  }
})

test('overtakes count once and collisions end the run without tunneling', () => {
  const state = mainRoad({ seed: 4 }); rules.start(state)
  state.speed = 45; state.traffic = [{ id: 90, lane: 2, z: 7, speed: 20, desired: 20, passed: false }]
  drive(state, .7, { accelerate: true }); assert.equal(state.overtakes, 1); assert.equal(state.nearMisses, 1)
  assert.equal(state.skillPoints, 20)
  drive(state, .3, { accelerate: true }); assert.equal(state.overtakes, 1)
  assert.equal(state.skillPoints, 20, 'Each overtaken car earns a beautiful-driving reward only once')
  state.traffic = [{ id: 91, lane: 1, z: 6, speed: 0, desired: 0, passed: false }]
  rules.step(state, { accelerate: true }, .1)
  assert.equal(state.status, 'crashed'); assert.equal(state.collision.id, 91)
  assert.equal(state.score, 0)
  assert.equal(state.scoreEvent, null); assert.equal(state.scoreEventTime, 0)
  const distance = state.distance; drive(state, 1); assert.equal(state.distance, distance)
  assert.equal(state.score, 0)
})

test('accidents clear positive and negative totals, including rewards earned on the collision frame', () => {
  for (const score of [250, -100, 0]) {
    const state = mainRoad({ mode: 'manual' }); rules.start(state)
    Object.assign(state, { distance: 199.99, distanceBank: 99.99, speed: 20, score,
      distancePoints: 100, skillPoints: 20, penaltyPoints: 200,
      traffic: [{ id: 92, lane: 1, z: 0, speed: 20, desired: 20 }] })
    rules.step(state, {}, .1)
    assert.equal(state.status, 'crashed')
    assert.equal(state.distancePoints, 110, 'The same-frame mileage reward is processed before collision')
    assert.equal(state.score, 0)
    assert.equal(state.skillPoints, 20); assert.equal(state.penaltyPoints, 200)
    const frozen = JSON.stringify(state); rules.step(state, { accelerate: true }, .1)
    assert.equal(JSON.stringify(state), frozen)
  }
})

test('ready and paused states freeze, large frame gaps are bounded, and seeds replay', () => {
  const a = rules.create({ seed: 5 }); const b = rules.create({ seed: 5 })
  assert.deepEqual(a, b)
  rules.step(a, { accelerate: true }, 1); assert.deepEqual(a, b)
  rules.start(a); rules.start(b); rules.step(a, {}, 99); rules.step(b, {}, .1)
  assert.deepEqual(a, b)
  a.status = 'paused'; const frozen = JSON.stringify(a); rules.step(a, {}, .1); assert.equal(JSON.stringify(a), frozen)
})

test('traffic follows the nearest car ahead rather than a distant one', () => {
  const state = mainRoad({ seed: 6 }); rules.start(state); state.lane = 0; state.targetLane = 0
  state.traffic = [
    { id: 1, lane: 3, z: 100, speed: 28, desired: 28 },
    { id: 2, lane: 3, z: 22, speed: 10, desired: 10 },
    { id: 3, lane: 3, z: 9, speed: 24, desired: 28 }
  ]
  drive(state, .1)
  assert.ok(state.traffic.find(car => car.id === 3).speed < 23, 'Close follower should brake for the nearest car')
})


test('entry starts on a real right-side ramp and smoothly joins the rightmost lane', () => {
  for (const mode of ['cruise', 'manual']) {
    const state = rules.create({ seed: 8, mode }); rules.start(state)
    assert.equal(state.phase, 'entering')
    assert.ok(route.entryX(0) > route.sample(0).right + 80)
    assert.equal(rules.changeLane(state, -1), false, 'Ramp follows its own path')
    for (let i = 0; i < 1800 && state.phase === 'entering'; i++) rules.step(state, {}, 1 / 120)
    assert.equal(state.phase, 'driving')
    assert.ok(state.distance >= route.ENTRY_END)
    assert.ok(Math.abs(state.lane - 3) < .001)
    assert.ok(Math.abs(route.entryX(route.ENTRY_END) - route.laneX(route.ENTRY_END, 3)) < .001)
  }
})

test('entry yields before the merge when main-road traffic occupies the gap', () => {
  const state = rules.create({ seed: 9 }); rules.start(state)
  Object.assign(state, { distance: 75, lane: route.entryLane(75), speed: 10 })
  state.traffic = [{ id: 999, lane: 3, z: 0, model: 0, speed: 9, desired: 9 }]
  rules.step(state, {}, .1)
  assert.equal(state.mergeWaiting, true)
  assert.ok(state.speed < 10)
  assert.equal(state.status, 'running')
})

test('lane geometry changes continuously and repeats with a smooth centerline', () => {
  for (const [distance, count] of [[200, 4], [420, 3], [800, 2], [1120, 3], [1360, 4]]) {
    assert.equal(route.sample(distance).lanes, count)
    assert.equal(route.sample(distance).maxLane, count - 1)
    assert.equal(route.sample(distance + route.PERIOD).width, route.sample(distance).width)
  }
  for (let d = 0; d < route.PERIOD * 2; d++) {
    assert.ok(Math.abs(route.sample(d + .01).right - route.sample(d).right) < .1, `No road-edge jumps at ${d}`)
    assert.ok(Math.abs(route.curve(d + .01) - route.curve(d)) < .05)
  }
  assert.ok(Math.abs(route.sample(230).slope) > .7)
  assert.ok(Math.abs(route.sample(460).slope) > .7)
  assert.ok(route.sample(230).slope * route.sample(460).slope < 0, 'Both left and right bends')
})

test('narrowing gives 180 meters of warning and cruise merges before the taper', () => {
  assert.equal(route.warning(119, 'driving'), null)
  assert.equal(route.warning(120, 'driving').kind, 'narrow')
  assert.equal(route.warning(120, 'driving').meters, 180)
  assert.match(route.warning(310, 'driving').title, /4 → 3/)
  assert.match(route.warning(700, 'driving').title, /3 → 2/)
  const state = mainRoad({ seed: 10 }); rules.start(state)
  Object.assign(state, { distance: 200, lane: 3, targetLane: 3 }); state.traffic = []
  drive(state, 4)
  assert.equal(state.status, 'running'); assert.ok(state.lane < 2.1)
  assert.ok(state.distance < 300, 'Merge is completed before narrowing starts')
})

test('cruise waits rather than merging through an occupied adjacent lane', () => {
  const state = mainRoad({ seed: 11 }); rules.start(state)
  Object.assign(state, { distance: 210, lane: 3, targetLane: 3 })
  state.traffic = [{ id: 99, lane: 2, z: 0, speed: 15, desired: 15 }]
  rules.step(state, {}, .1)
  assert.equal(state.mergeWaiting, true)
  assert.equal(state.targetLane, 3)
  assert.equal(state.status, 'running')
})

test('traffic merges into surviving lanes and lane controls respect the two-lane section', () => {
  const state = mainRoad({ seed: 12 }); rules.start(state)
  Object.assign(state, { distance: 670, lane: 0, targetLane: 0 })
  state.traffic = [{ id: 99, lane: 2, z: 15, speed: 20, desired: 20 }]
  drive(state, 4)
  assert.ok(state.traffic.find(car => car.id === 99).lane < 1.1)
  Object.assign(state, { distance: 820, lane: 1, targetLane: 1 })
  assert.equal(rules.changeLane(state, 1), false)
})

test('manual drivers retain control and are slowed on the closing shoulder', () => {
  const state = mainRoad({ seed: 13, mode: 'manual' }); rules.start(state)
  Object.assign(state, { distance: 755, lane: 2, targetLane: 2, speed: 20 }); state.traffic = []
  drive(state, 1)
  assert.ok(state.speed < 10)
  assert.equal(state.status, 'running')
  assert.ok(state.lane > 1.2, 'A shoulder slows the car instead of teleporting it into traffic')
  drive(state, .5, { left: true }); assert.ok(state.lane < 1)
})

test('exit is optional; a requested exit follows its right ramp to completion', () => {
  const exit = route.exitAt(0)
  const straight = mainRoad({ seed: 14 }); rules.start(straight)
  Object.assign(straight, { distance: exit.start - 10, lane: 3, targetLane: 3 }); straight.traffic = []
  drive(straight, 7)
  assert.equal(straight.phase, 'driving'); assert.equal(straight.status, 'running')
  const state = mainRoad({ seed: 14 }); rules.start(state)
  Object.assign(state, { distance: exit.start - 70, lane: 1, targetLane: 1 }); state.traffic = []
  assert.equal(rules.requestExit(state), true)
  drive(state, 18)
  assert.equal(state.status, 'finished'); assert.equal(state.phase, 'arrived')
  assert.ok(state.distance >= exit.end)
  assert.ok(route.exitX(exit.end, state.chosenExit) > route.sample(exit.end).right + 150)
  const frozen = JSON.stringify(state); rules.step(state, { accelerate: true }, .1); assert.equal(JSON.stringify(state), frozen)
})

test('exit selection can be canceled; missing an exit continues safely without teleportation', () => {
  const state = mainRoad({ seed: 15, mode: 'manual' }); rules.start(state)
  Object.assign(state, { distance: route.EXIT_INTERVAL - 30, lane: 0, targetLane: 0 }); state.traffic = []
  assert.equal(rules.requestExit(state), true); assert.equal(rules.requestExit(state), true)
  assert.equal(state.exitRequested, false)
  rules.requestExit(state); drive(state, 6)
  assert.equal(state.phase, 'driving'); assert.equal(state.exitRequested, false)
  assert.equal(state.lane, 0)
  Object.assign(state, { distance: 100 }); assert.equal(rules.requestExit(state), false)
})

test('manual exit needs the rightmost lane and works on later route cycles', () => {
  const state = mainRoad({ seed: 16, mode: 'manual' }); rules.start(state)
  Object.assign(state, { distance: route.EXIT_INTERVAL * 2 - 1, lane: 3, targetLane: 3 }); state.traffic = []
  assert.equal(rules.requestExit(state), true)
  drive(state, 16)
  assert.equal(state.status, 'finished')
  assert.equal(state.chosenExit.start, route.EXIT_INTERVAL * 2)
})

test('busy traffic can complete multiple route cycles and take a later exit', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const state = rules.create({ seed, density: 'busy' }); rules.start(state)
    for (let i = 0; i < 360 * 120 && state.status === 'running'; i++) {
      const exit = route.exitAt(state.distance)
      if (state.distance > route.PERIOD * 2 && state.phase === 'driving' && exit.remaining < 210 && exit.remaining > 180 && !state.exitRequested) rules.requestExit(state)
      rules.step(state, {}, 1 / 120)
    }
    assert.equal(state.status, 'finished', `Seed ${seed} should merge safely through traffic and exit`)
    assert.equal(state.chosenExit.start, route.EXIT_INTERVAL * 3)
    assert.equal(state.penaltyPoints, 0, 'Cruise obeys camera limits when the accelerator is released')
    assert.equal(state.score, state.distancePoints + state.skillPoints - state.penaltyPoints)
  }
})

test('distance points are awarded at each 100 meters, independent of frame size', () => {
  const states = [1 / 120, .1].map(delta => {
    const state = mainRoad({ seed: 20, mode: 'manual' }); rules.start(state)
    state.traffic = []; state.distanceBank = 99; state.speed = 20
    for (let t = 0; t < 1 - .00001; t += delta) rules.step(state, {}, delta)
    assert.equal(state.distancePoints, 10); assert.equal(state.score, 10)
    assert.ok(state.distanceBank > 17 && state.distanceBank < 20)
    state.status = 'paused'; const frozen = JSON.stringify(state); rules.step(state, {}, .1)
    assert.equal(JSON.stringify(state), frozen, 'Pause never earns points')
    return state
  })
  assert.ok(Math.abs(states[0].distanceBank - states[1].distanceBank) < .001)
})

test('camera locations and exits use fixed distances beyond road cycles', () => {
  for (let i = 1; i <= 5; i++) {
    const exit = route.exitAt(i * route.EXIT_INTERVAL - 200)
    assert.equal(exit.start, i * route.EXIT_INTERVAL)
    assert.equal(exit.remaining, 200)
    assert.equal(route.exitAt(exit.end + .01).start, exit.start + route.EXIT_INTERVAL)
  }
  assert.equal(route.cameraAt(280).remaining, route.CAMERA_WARNING)
  assert.equal(route.cameraAt(500).distance, 500)
  assert.equal(route.cameraAt(500.01).distance, 1300)
})

test('speeding is captured once per camera and can make the total negative', () => {
  const state = mainRoad({ seed: 21, mode: 'manual' }); rules.start(state)
  Object.assign(state, { distance: 499.9, speed: 40 }); state.traffic = []
  rules.step(state, { accelerate: true }, .1)
  assert.equal(state.speedingTickets, 1); assert.equal(state.penaltyPoints, 200)
  assert.equal(state.score, -200); assert.equal(state.scoreEvent.kind, 'penalty')
  assert.ok(state.cameraFlash > 0)
  drive(state, .3, { accelerate: true }); assert.equal(state.speedingTickets, 1)
  state.distance = 1299.9
  rules.step(state, { accelerate: true }, .1)
  assert.equal(state.speedingTickets, 2); assert.equal(state.penaltyPoints, 400)
})

test('camera penalties use exclusive 10% and 20% thresholds without stacking', () => {
  for (const [speed, penalty] of [[80, 0], [87.9, 0], [88, 0], [88.01, 100], [92, 100], [96, 100], [96.01, 200], [120, 200]]) {
    const state = mainRoad({ seed: 27 }); rules.start(state)
    Object.assign(state, { distance: 500, speed: speed / 3.6 }); state.traffic = []
    rules.step(state, {}, .01)
    assert.equal(state.penaltyPoints, penalty, `Correct penalty at ${speed} km/h`)
    assert.equal(state.score, penalty > 0 ? -penalty : 0)
    assert.equal(state.speedingTickets, penalty > 0 ? 1 : 0)
    if (penalty === 0) {
      assert.equal(state.scoreEvent, null, 'An unpenalized passage remains silent')
      assert.equal(state.cameraFlash, 0)
    } else assert.equal(state.scoreEvent.points, -penalty)
    rules.step(state, {}, .1)
    assert.equal(state.penaltyPoints, penalty, 'Each camera deducts only once')
  }
  assert.equal(rules.speedingPenalty(110, 100), 0)
  assert.equal(rules.speedingPenalty(120, 100), 100)
  assert.equal(rules.speedingPenalty(121, 100), 200)
})

test('exactly the posted limit and braking before the capture line avoid a ticket', () => {
  const legal = mainRoad({ seed: 22 }); rules.start(legal)
  Object.assign(legal, { distance: 499.99, speed: 80 / 3.6 }); legal.traffic = []
  rules.step(legal, {}, .1)
  assert.equal(legal.lastCamera, 0); assert.equal(legal.speedingTickets, 0)
  assert.equal(legal.scoreEvent, null, 'Passing at the speed limit does not create a notification')
  assert.equal(legal.scoreEventTime, 0)
  assert.equal(legal.cameraFlash, 0)
  const braking = mainRoad({ seed: 22, mode: 'manual' }); rules.start(braking)
  Object.assign(braking, { distance: 455, speed: 140 / 3.6 }); braking.traffic = []
  drive(braking, 6, { brake: true })
  assert.ok(braking.distance > 500)
  assert.equal(braking.speedingTickets, 0)
})

test('capture result depends on crossing speed, not how the frame is divided', () => {
  for (const delta of [1 / 120, .1]) {
    const state = mainRoad({ seed: 23, mode: 'manual' }); rules.start(state)
    Object.assign(state, { distance: 498, speed: 30 }); state.traffic = []
    for (let t = 0; t < .2 - .00001; t += delta) rules.step(state, { brake: true }, delta)
    assert.equal(state.speedingTickets, 1)
    assert.equal(state.penaltyPoints, 200)
  }
})

test('exit scoring is frozen at completion and a new run resets all score data', () => {
  const state = mainRoad({ seed: 24 }); rules.start(state)
  const exit = route.exitAt(0)
  Object.assign(state, { phase: 'exiting', chosenExit: exit, distance: exit.end - .05,
    distanceBank: 99.99, score: -170, distancePoints: 10, skillPoints: 20, penaltyPoints: 200, speedingTickets: 1 })
  state.traffic = []; rules.step(state, {}, .1)
  assert.equal(state.status, 'finished'); assert.equal(state.score, -160)
  const frozen = JSON.stringify(state); rules.step(state, { accelerate: true }, .1)
  assert.equal(JSON.stringify(state), frozen)
  const next = rules.create({ seed: 24 })
  for (const key of ['score', 'distancePoints', 'skillPoints', 'penaltyPoints', 'speedingTickets', 'distanceBank']) assert.equal(next[key], 0)
})
