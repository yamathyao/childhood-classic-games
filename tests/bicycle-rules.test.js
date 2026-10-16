const { test } = require('node:test')
const assert = require('node:assert/strict')
const r = require('../games/bicycle/rules.js')

function advance(state, ms, until = () => false) {
  for (let elapsed = 0; elapsed < ms && r.isAnimating(state) && !until(state); elapsed += 8) r.tick(state, 8)
}
function running(x = 80) {
  const s = r.initialState(); r.begin(s); s.x = x; s.angle = Math.atan(r.slope(x)); s.y = r.supportY(x, s.angle)
  return s
}

test('ready state is still; a press jumps immediately and cannot double jump', () => {
  const s = r.initialState(); r.tick(s, 100)
  assert.equal(s.x, 80); assert.equal(r.press(s), false)
  r.begin(s); assert.equal(r.press(s), true)
  assert.equal(s.grounded, false); assert.equal(s.vy, -r.JUMP_SPEED + s.speed * r.slope(s.x))
  assert.equal(r.press(s), false)
  r.release(s); r.tick(s, 80); const vy = s.vy
  r.press(s); assert.equal(s.vy, vy, 'another airborne press only controls rotation')
})

test('a short tap adds no trick spin; a hold accelerates rotation and releasing brakes with inertia', () => {
  const s = running(); r.press(s); advance(s, 120)
  assert.equal(s.rotation, 0)
  advance(s, 160); const first = s.rotation
  advance(s, 160); assert.ok(s.rotation > first + .5)
  const angle = s.angle; const omega = s.omega; r.release(s)
  assert.equal(s.omega, omega, 'release does not instantly remove angular momentum')
  advance(s, 160)
  assert.ok(Math.abs(s.omega) < Math.abs(omega) * .3)
  assert.ok(s.angle < angle && angle - s.angle < .55, 'controlled residual rotation while braking')
  assert.equal(s.held, false)
})

test('wheel-first upright or banked landings survive; upside-down and body-first landings end the run', () => {
  for (const angle of [Math.atan(r.slope(100)), .65, -.55, r.TAU + .15]) {
    const s = running(100); s.grounded = false; s.angle = angle
    s.y = r.supportY(s.x, angle) + .01
    assert.equal(r.land(s), true, 'wheel first at ' + angle)
    assert.equal(s.status, 'running'); assert.equal(s.grounded, true)
  }
  for (const angle of [Math.PI, Math.PI * .75, -Math.PI * .75]) {
    const s = running(100); s.grounded = false; s.angle = angle
    s.y = r.terrain(s.x) + 1
    r.land(s); assert.equal(s.status, 'crashing', 'body first at ' + angle)
    assert.equal(s.crashReason, '人体先着地')
  }
})

test('a completed full rotation only scores after a safe landing', () => {
  const f = r.feature(0); const s = running(f.lip - 4)
  advance(s, 80, s => !s.grounded); r.press(s)
  advance(s, 1600, s => s.rotation >= r.TAU)
  assert.equal(s.score, 0); assert.equal(s.flips, 0); assert.equal(s.airFlips, 1)
  r.release(s); advance(s, 1600, s => s.grounded)
  assert.equal(s.status, 'running'); assert.equal(s.flips, 1); assert.equal(s.score, 150)
  const failed = running(); failed.grounded = false; failed.angle = Math.PI
  failed.y = r.terrain(failed.x); failed.airFlips = 1
  r.land(failed); assert.equal(failed.score, 0); assert.equal(failed.flips, 0)
})

test('wooden and natural ramps launch automatically without pressing the button', () => {
  for (const i of [0, 1, 4, 5]) {
    const f = r.feature(i); const s = running(f.lip - 4)
    advance(s, 80, s => !s.grounded)
    assert.equal(s.grounded, false); assert.equal(s.status, 'running')
    assert.ok(s.vy < -300); assert.equal(s.held, false)
    assert.ok(s.message.includes(f.kind === 'ramp' ? '木跳台' : '自然大跳台'))
  }
})

test('rock and log collisions end the run, while a well-timed jump clears and scores', () => {
  for (const i of [0, 1]) {
    const x = i * r.SECTION + r.OBSTACLE_OFFSET
    const collision = running(x - 80); advance(collision, 650)
    assert.equal(collision.status, 'crashing')
    assert.equal(collision.crashReason, i ? '撞上倒木' : '撞上山石')
    const jump = running(x - 115); r.press(jump); r.release(jump); advance(jump, 1300)
    assert.equal(jump.status, 'running'); assert.equal(jump.cleared, i); assert.equal(jump.score, 50)
  }
})

test('entering an obstacle below its top crashes, and body contact precedes wheel landing', () => {
  const s = running(r.OBSTACLE_OFFSET); s.grounded = false; s.y = r.terrain(s.x) - 48; s.vy = 80
  advance(s, 200); assert.equal(s.status, 'crashing')
  assert.equal(s.crashReason, '撞上山石')
  const body = running(100); body.grounded = false; body.y = r.terrain(100) + 100
  r.land(body); assert.equal(body.status, 'crashing')
})

test('safe banked landings count actual one/two turns, while partial turns and failed landings score nothing', () => {
  for (const turns of [1, 2]) {
    for (const tilt of [-.4, 0, .35]) {
      const s = running(1100); s.grounded = false; s.tricking = true
      s.takeoffAngle = s.angle; s.angle = s.takeoffAngle - turns * r.TAU + tilt
      s.rotation = s.takeoffAngle - s.angle; s.airFlips = Math.floor(s.rotation / r.TAU)
      s.y = r.supportY(s.x, s.angle) + .01; s.vy = 200
      assert.equal(r.land(s), true)
      assert.equal(s.flips, turns, `turns ${turns}, bank ${tilt}`)
      assert.equal(s.score, turns * 150)
      r.land(s); assert.equal(s.flips, turns, 'landing cannot pay twice')
    }
  }
  const partial = running(1100); partial.grounded = false; partial.tricking = true
  partial.takeoffAngle = partial.angle; partial.angle -= .5; partial.rotation = .5
  partial.y = r.supportY(partial.x, partial.angle) + .01
  assert.equal(r.land(partial), true); assert.equal(partial.flips, 0)
  const failed = running(1100); failed.grounded = false; failed.tricking = true
  failed.takeoffAngle = failed.angle; failed.angle -= r.TAU + Math.PI
  failed.y = r.terrain(failed.x); r.land(failed)
  assert.equal(failed.status, 'crashing'); assert.equal(failed.flips, 0)
})

test('airborne counting follows signed net rotation including braking, without counting balance twice', () => {
  const s = running(1100); r.press(s); s.y -= 3000
  advance(s, 1600, state => state.airFlips === 1)
  assert.equal(s.airFlips, 1)
  assert.ok(Math.abs(s.rotation - (s.takeoffAngle - s.angle)) < 1e-10)
  r.release(s); const rotation = s.rotation; r.tick(s, 80)
  assert.ok(s.rotation > rotation, 'braking inertia is included')
  s.angle = s.takeoffAngle - r.TAU + .01; s.omega = 1
  r.tick(s, 8)
  assert.ok(s.rotation < r.TAU); assert.equal(s.airFlips, 0, 'reverse correction cannot accumulate phantom laps')
  advance(s, 250)
  assert.equal(s.airFlips, 0)
})

test('wheels can land on parked campers and obstacle tops, ride across, and drop back to the trail', () => {
  for (const index of [0, 1, 3, 4]) {
    for (const solid of r.surfaces(index * r.SECTION, (index + 1) * r.SECTION)) {
      for (const speed of [r.MIN_SPEED, r.MAX_SPEED]) {
        for (const frameMs of [8, 33, 100]) {
          const s = running(solid.x - 20); s.speed = speed; s.grounded = false; s.angle = 0
          s.y = solid.y - solid.h - 24; s.vy = 80
          let onTop = false; let leftTop = false; let backOnTrail = false
          for (let ms = 0; ms < 1500 && s.status === 'running'; ms += frameMs) {
            r.tick(s, frameMs)
            if (s.supportId === solid.key) onTop = true
            if (onTop && !s.grounded) leftTop = true
            if (leftTop && s.grounded && !s.supportId && s.x > solid.x + solid.w) { backOnTrail = true; break }
          }
          const label = `${index}:${solid.kind} ${speed} ${frameMs}`
          assert.ok(onTop, label + ': landed on top')
          assert.ok(leftTop, label + ': left edge under gravity')
          assert.equal(s.status, 'running', label + ': ' + s.crashReason)
          assert.ok(backOnTrail, label + ': back on trail')
          assert.ok(s.x > solid.x + solid.w)
        }
      }
    }
  }
})

test('parked vehicle sides remain solid and roof jumps preserve the actual roof tangent', () => {
  const van = r.surfaces(0, r.SECTION).find(item => item.kind === 'van')
  const side = running(van.x - van.w / 2 - 70)
  advance(side, 400, s => s.status === 'crashing')
  assert.equal(side.crashReason, '撞上露营车侧面')
  const roof = running(van.x); roof.supportId = van.key; roof.angle = 0; roof.y = r.supportY(roof.x, 0, van.key)
  const expectedVy = -r.JUMP_SPEED + roof.speed * Math.tan(r.rideAngle(roof.x, van.key))
  r.press(roof); assert.equal(roof.vy, expectedVy); assert.equal(roof.supportId, null)
  const body = running(van.x); body.grounded = false; body.angle = Math.PI
  body.y = van.y - van.h; advance(body, 16)
  assert.equal(body.status, 'crashing'); assert.equal(body.flips, 0)
})

test('campers rest both tires on the downhill road and expose the shaped roof instead of a flat platform', () => {
  for (const index of [0, 3, 6, 9]) {
    const van = r.surfaces(index * r.SECTION, (index + 1) * r.SECTION).find(item => item.kind === 'van')
    const cos = Math.cos(van.angle); const sin = Math.sin(van.angle)
    assert.ok(Math.abs(van.angle - r.roadAngle(van.x)) < .01)
    for (const hubX of [-27.4, 29.8]) {
      const x = van.x + hubX * cos + 7.6 * sin
      const bottom = van.y + hubX * sin - 7.6 * cos + 7.6
      assert.ok(Math.abs(bottom - r.terrain(x)) < .25, 'both tires touch the terrain')
    }
    const left = van.roof[4]; const right = van.roof[9]
    assert.equal(r.rideHeight(left[0], van.key), left[1])
    assert.equal(r.rideHeight(right[0], van.key), right[1])
    assert.notEqual(left[1], right[1], 'roof follows the vehicle slope and silhouette')
    assert.ok(Math.abs(r.rideAngle(van.x, van.key)) > .05)
    van.roof[0][1] = -10000; van.hull[0][1] = -10000
    const again = r.surfaces(van.x - 100, van.x + 100).find(item => item.kind === 'van')
    assert.ok(again.roof[0][1] > 0 && again.hull[0][1] > 0, 'public query cannot mutate cached geometry')
  }
})

test('a collision tips forward once then rests before ending, freezing distance, score and flips', () => {
  for (const frameMs of [8, 33, 100]) {
    const s = running(r.OBSTACLE_OFFSET - 80)
    advance(s, 400, s => s.status === 'crashing')
    assert.equal(s.status, 'crashing'); assert.equal(r.press(s), false)
    const impact = { x: s.x, angle: s.angle, distance: s.distance, score: r.totalScore(s), flips: s.flips }
    let elapsed = 0; let settled
    while (s.status === 'crashing' && elapsed < 1400) {
      r.tick(s, frameMs); elapsed += frameMs
      if (s.crashMotion.settled) {
        const pose = { x: s.x, y: s.y, angle: s.angle }
        if (settled) assert.deepEqual(pose, settled, 'no bounce, further roll or slide after lying down')
        settled = pose
      }
    }
    assert.equal(s.status, 'over'); assert.ok(elapsed >= 1100)
    assert.ok(s.angle - impact.angle > .8 && s.angle - impact.angle < r.TAU, 'only one forward fall')
    assert.ok(settled, 'rests on the road before results')
    assert.ok(s.x > impact.x && s.x - impact.x < 110, 'roll slides forward and slows')
    assert.equal(s.distance, impact.distance); assert.equal(r.totalScore(s), impact.score); assert.equal(s.flips, impact.flips)
    const stopped = structuredClone(s); r.tick(s, 100); assert.deepEqual(s, stopped)
  }
  const stalled = running(r.OBSTACLE_OFFSET - 80)
  advance(stalled, 400, s => s.status === 'crashing'); r.tick(stalled, 10000)
  assert.equal(stalled.status, 'crashing'); assert.ok(stalled.crashMotion.elapsed < .12, 'stalls do not skip the roll')
})

test('flight preserves horizontal momentum and small balance corrections cannot rescue an inverted rider', () => {
  const s = running(1100); s.speed = 480; r.press(s); r.release(s)
  const speed = s.speed; const angle = s.angle; r.tick(s, 100)
  assert.ok(s.speed < speed && s.speed > speed * .998, 'only light air drag changes horizontal velocity')
  assert.ok(Math.abs(s.angle - angle) < .1, 'balance changes pitch gradually')
  assert.equal(s.rotation, 0, 'balance correction is not a trick')
  const inverted = running(1200); inverted.grounded = false; inverted.angle = Math.PI; inverted.y -= 250
  advance(inverted, 200)
  assert.ok(Math.abs(inverted.angle - Math.PI) < .001, 'no automatic upside-down recovery')
})

test('safe landings retain their pitch then settle; vertical or fast unbalanced landings crash', () => {
  const s = running(1100); s.grounded = false; s.angle += .35; s.omega = -.7; s.vy = 300
  s.y = r.supportY(s.x, s.angle) + .01; const angle = s.angle
  assert.equal(r.land(s), true); assert.ok(Math.abs(s.angle - angle) < 1e-8)
  assert.ok(s.landingImpact > 0); r.tick(s, 16)
  assert.ok(Math.abs(s.angle - angle) < .04, 'no snapping to the slope on contact')
  const firstError = Math.abs(s.angle - r.roadAngle(s.x)); advance(s, 280)
  assert.ok(Math.abs(s.angle - r.roadAngle(s.x)) < firstError * .4)
  for (const [angle, omega] of [[Math.PI / 2, 0], [.9, -5.8]]) {
    const unstable = running(100); unstable.grounded = false; unstable.angle = angle; unstable.omega = omega
    unstable.y = r.supportY(unstable.x, angle) + .01
    assert.equal(r.land(unstable), false); assert.equal(unstable.status, 'crashing'); assert.equal(unstable.crashReason, '落地失衡')
  }
})

test('section caching stays bounded and public geometry remains stable after eviction', () => {
  const fs = require('node:fs'); const vm = require('node:vm')
  const context = { module: { exports: {} } }
  vm.runInNewContext(fs.readFileSync(require.resolve('../games/bicycle/rules.js'), 'utf8') + '\nmodule.exports.cacheSize = () => SECTIONS.size', context)
  const cached = context.module.exports
  const samples = [0, 300, 489.9, 490, 1365, 2400 + 1419.9, 4800 + 1420, 1000000]
  const expected = samples.map(x => cached.terrain(x))
  for (let i = 0; i < 10000; i++) cached.terrain(i * r.SECTION + 1500)
  assert.ok(cached.cacheSize() <= 12)
  assert.deepEqual(samples.map(x => cached.terrain(x)), expected)
  const route = cached.route(1); route.deckY = -10000
  assert.equal(cached.terrain(r.SECTION + 1500), cached.route(1).deckY, 'caller mutations cannot corrupt cached terrain')
})

test('frame stalls are bounded; completed runs stop; input and records reject malformed values', () => {
  const s = running(); const x = s.x
  r.tick(s, 10000); assert.ok(s.x - x <= r.MAX_SPEED * .1)
  for (const duration of [NaN, Infinity, -10, 0]) r.tick(s, duration)
  s.status = 'over'; const frozen = structuredClone(s); r.tick(s, 100)
  assert.deepEqual(s, frozen)
  assert.deepEqual(r.records({ distance: Infinity, score: -1, flips: '9' }), { distance: 0, score: 0, flips: 0 })
  assert.deepEqual(r.updateRecords({ distance: 100, score: 400, flips: 2 }, { distance: 105.8, score: 350, flips: 1 }),
    { distance: 105, score: 455, flips: 2 })
})

test('endless terrain stays deterministic and obstacle queries retain only nearby objects', () => {
  for (const x of [0, 100, 469.9, 470, 1180, 1626, 1000000]) {
    assert.ok(Number.isFinite(r.terrain(x))); assert.ok(Number.isFinite(r.slope(x)))
    assert.equal(r.terrain(x), r.terrain(x))
    assert.ok(r.obstacles(x - 100, x + 600).length <= 2)
  }
})

test('camps, switchbacks and railways repeat near launch features with bounded visible queries', () => {
  for (let i = 0; i < 300; i++) {
    const item = r.landmark(i); const f = r.feature(i)
    assert.equal(item.kind, ['camp', 'highway', 'railway'][i % 3])
    assert.ok(item.x > f.lip && item.x < f.lip + 250)
    assert.ok(r.landmarks(item.start, item.end).some(p => p.id === i))
    assert.ok(r.landmarks(item.x - 250, item.x + 1000).length <= 2)
  }
  assert.deepEqual(r.landmarks(-1000, -500), [])
})

test('camping gear and highway barriers use the same jumpable collision path', () => {
  for (const [i, kind, reason] of [[3, 'gear', '撞上营地杂物'], [4, 'barrier', '撞上路障']]) {
    const x = i * r.SECTION + r.OBSTACLE_OFFSET
    assert.equal(r.obstacles(x - 100, x + 100)[0].kind, kind)
    const collision = running(x - 80); advance(collision, 650)
    assert.equal(collision.crashReason, reason)
    const jump = running(x - 120); r.press(jump); r.release(jump); advance(jump, 1300)
    assert.equal(jump.status, 'running'); assert.equal(jump.cleared, i); assert.equal(jump.score, 50)
  }
})

test('ordinary taps clear hazards across a practical timing window at every riding speed', () => {
  for (const speed of [r.MIN_SPEED, 400, r.MAX_SPEED]) {
    for (let i = 0; i < 6; i++) {
      const start = i * r.SECTION
      const hazards = r.obstacles(start + 2200, start + 2350)
      for (const hazard of hazards) {
        // Cover early and late taps, not just one perfectly timed takeoff.
        for (let leadMs = 320; leadMs <= 500; leadMs += 20) {
          for (const frameMs of [8, 33]) {
            const x = hazard.x
            const s = running(x - speed * leadMs / 1000)
            s.speed = speed; s.distance = (s.x - 80) / 8
            const end = x + 160
            r.press(s); r.release(s)
            for (let ms = 0; ms < 2400 && s.status === 'running' && s.x < end; ms += frameMs) r.tick(s, frameMs)
            const label = `${i}:${hazard.kind}, speed ${speed}, lead ${leadMs}ms, frame ${frameMs}ms`
            assert.equal(s.status, 'running', label + ': ' + s.crashReason)
            assert.ok(s.x >= end, label + ': passed the hazard')
            assert.equal(s.cleared, i, label + ': received clearance reward')
          }
        }
      }
    }
  }
})

test('successive ramps leave room to land and jump the next obstacle even at maximum speed', () => {
  const s = running(); let jumped = -1
  // Exercise both ramp types through more than 20 km, including the speed cap.
  for (let elapsed = 0; elapsed < 660000 && s.status === 'running'; elapsed += 16) {
    const obstacle = r.surfaces(s.x, s.x + 350)[0]
    if (obstacle && obstacle.key !== jumped && obstacle.x - s.x <= s.speed * (obstacle.kind === 'van' ? .55 : .3) && s.grounded) {
      r.press(s); r.release(s); jumped = obstacle.key
    }
    r.tick(s, 16)
  }
  assert.equal(s.status, 'running', s.crashReason)
  assert.ok(s.speed > r.MAX_SPEED * .96 && s.speed <= r.MAX_SPEED, 'air drag slightly reduces speed below the cap'); assert.ok(s.distance > 40000)
  assert.ok(s.cleared > 130); assert.ok(s.score >= (s.cleared + 1) * 50)
})

test('road includes gentle grades, steep grades, small and large hills and a real cliff', () => {
  assert.ok(r.slope(2000) < .2)
  assert.ok(r.slope(4 * r.SECTION + 1100) > .6)
  assert.ok(r.feature(3).height < 50)
  assert.ok(r.feature(4).height > 100)
  const cliff = r.feature(2)
  assert.equal(cliff.kind, 'drop')
  assert.ok(r.terrain(cliff.lip + .01) - r.terrain(cliff.lip - .01) > 260)
  for (let i = 1; i <= 18; i++) {
    const x = i * r.SECTION
    assert.ok(Math.abs(r.terrain(x + .01) - r.terrain(x - .01)) < .01, 'continuous section seam ' + i)
    assert.ok(Math.abs(r.slope(x + .1) - r.slope(x - .1)) < .01, 'smooth tangent ' + i)
  }
})

test('cliff takeoff keeps the upper road angle, falls under gravity, and lands safely without input', () => {
  const f = r.feature(2); const s = running(f.lip - 90)
  s.angle = r.roadAngle(s.x); s.y = r.supportY(s.x, s.angle); s.cameraY = r.terrain(s.x)
  advance(s, 400, s => !s.grounded)
  assert.equal(s.grounded, false); assert.ok(s.x < f.lip)
  assert.ok(Math.abs(s.angle) < .4, 'the vertical cliff must not tip the rider before takeoff')
  const y = s.y; const vy = s.vy; const cam = s.cameraY
  r.tick(s, 16)
  assert.ok(s.y > y && s.y - y < 5, 'fall begins continuously, without snapping to the lower road')
  assert.ok(s.vy > vy); assert.ok(Math.abs(s.cameraY - cam) < 20)
  advance(s, 1400, s => s.grounded)
  assert.equal(s.grounded, true); assert.equal(s.status, 'running')
  assert.equal(s.dropLip, null)
})

test('steep grades accelerate faster than gentle grades, and a new run immediately travels faster', () => {
  const gentle = running(1750); const steep = running(4 * r.SECTION + 1100)
  advance(gentle, 400); advance(steep, 400)
  assert.ok(steep.speed > gentle.speed + 30)
  assert.ok(gentle.speed >= r.MIN_SPEED && steep.speed <= r.MAX_SPEED)
  const fast = running(); const start = fast.x; advance(fast, 1000)
  assert.ok(fast.x - start > 300, 'old initial speed was 172 units per second')
})

test('ordinary hops clear low hazards but ramps still provide the height for full flips', () => {
  const s = running(1100); const initial = s.y; r.press(s)
  let apex = initial; let rotation = 0
  for (let i = 0; i < 160 && !s.grounded && s.status === 'running'; i++) {
    r.tick(s, 8); apex = Math.min(apex, s.y); rotation = Math.max(rotation, s.rotation)
  }
  assert.ok(initial - apex < 65, 'manual vertical rise stays modest on downhill ground')
  assert.ok(rotation < r.TAU)
  const height = r.JUMP_SPEED ** 2 / (2 * 620)
  assert.ok(height > 60 && height < 70, 'reserve clearance above the 30-unit roadside hazards')
  assert.ok(height < r.feature(0).power ** 2 / (2 * 620) * .5, 'main ramp has over twice the theoretical lift')
})

test('crossings have real small drops and flat decks with smooth trail connections', () => {
  for (const i of [1, 2, 4, 5]) {
    const item = r.route(i)
    assert.equal(r.surfaceKind(item.lip - 1), 'dirt')
    assert.equal(r.surfaceKind(item.lip + 1), item.kind)
    assert.equal(r.surfaceKind(item.deckEnd + 1), 'dirt')
    for (const x of [item.start, item.approachEnd, item.deckEnd, item.end]) {
      assert.ok(Math.abs(r.rideHeight(x + .01) - r.rideHeight(x - .01)) < .02)
      assert.ok(Math.abs(r.slope(x + .1) - r.slope(x - .1)) < .01)
    }
    assert.ok(Math.abs(r.terrain(item.lip + .01) - r.terrain(item.lip - .01) - item.drop) < .01)
    for (let x = item.lip + 1; x < item.deckEnd; x += 13) {
      assert.equal(r.terrain(x), item.deckY)
      assert.equal(r.rideHeight(x), item.deckY, 'vehicles below the path never change wheel support')
    }
    const s = running(item.lip + 80); advance(s, 100)
    assert.equal(s.grounded, true); assert.equal(s.status, 'running')
    assert.ok(Math.abs(s.y - r.supportY(s.x, s.angle)) < .01)
  }
})

test('road and tunnel crossings drop naturally and remain safe without a jump at all speeds', () => {
  for (const i of [1, 2, 4, 5, 32]) {
    const item = r.route(i)
    for (const speed of [r.MIN_SPEED, 400, r.MAX_SPEED]) {
      const s = running(item.lip - 90); s.speed = speed; s.distance = (s.x - 80) / 8
      advance(s, 400, s => !s.grounded)
      assert.equal(s.grounded, false); assert.ok(s.x < item.lip)
      assert.ok(Math.abs(s.angle) < .2, 'ledge does not tilt the rider down its vertical face')
      const before = s.y; r.tick(s, 8)
      assert.ok(Math.abs(s.y - before) < 2, 'small drop starts without a teleport')
      advance(s, 1000, s => s.grounded)
      assert.equal(s.status, 'running'); assert.equal(s.grounded, true)
      assert.ok(s.x > item.lip && s.x < item.deckEnd, 'lands on the flat crossing surface')
      assert.equal(s.dropLip, null)
      assert.ok(Math.abs(s.y - r.supportY(s.x, s.angle)) < .01)
      advance(s, 2000, s => s.x > item.end + 80)
      assert.equal(s.status, 'running'); assert.equal(s.routeCleared, i); assert.equal(s.score, 50)
      const score = s.score; advance(s, 40)
      assert.equal(s.score, score, 'crossing reward is paid once')
    }
  }
})

test('manual takeoff can cross the lower road or tunnel and inverted landings still fail', () => {
  for (const i of [1, 2, 4, 5]) {
    const item = r.route(i); const s = running(item.lip - 150)
    s.speed = r.MAX_SPEED; s.distance = (s.x - 80) / 8
    r.press(s); r.release(s); advance(s, 2300, s => s.x > item.end + 80)
    assert.equal(s.status, 'running'); assert.equal(s.routeCleared, i)
    const inverted = running(item.lip + 160); inverted.grounded = false; inverted.angle = Math.PI
    inverted.y = item.deckY; r.land(inverted)
    assert.equal(inverted.status, 'crashing'); assert.equal(inverted.crashReason, '人体先着地')
  }
})

test('seeded routes vary by run while queries remain stable, smooth and bounded after cache eviction', () => {
  const signature = () => Array.from({ length: 24 }, (_, i) => ({ profile: r.profile(i).name,
    feature: r.feature(i), route: r.route(i), hazards: r.obstacles(i * r.SECTION, (i + 1) * r.SECTION) }))
  try {
    r.initialState(90123); const first = signature()
    r.initialState(77191); assert.notDeepEqual(signature(), first)
    r.initialState(90123); assert.deepEqual(signature(), first, 'same seed reproduces the whole route')
    for (let i = 10000; i < 10100; i++) r.terrain(i * r.SECTION)
    assert.deepEqual(signature(), first, 'query order and cache eviction never change the map')
    assert.notDeepEqual(first.slice(0, 6).map(s => s.profile), first.slice(6, 12).map(s => s.profile), 'not a repeated six-section loop')
    for (let seed = 1; seed <= 24; seed++) {
      r.initialState(seed)
      for (let i = 0; i < 48; i++) {
        const x = (i + 1) * r.SECTION
        assert.ok(Math.abs(r.terrain(x + .01) - r.terrain(x - .01)) < .01, `${seed}:${i} seam`)
        assert.ok(Math.abs(r.slope(x + .1) - r.slope(x - .1)) < .01, `${seed}:${i} tangent`)
        const hazard = r.obstacles(i * r.SECTION, x)[0]
        assert.ok(hazard.x - i * r.SECTION >= 2220 && hazard.x - i * r.SECTION <= 2300)
        if (i % 3 === 0) assert.equal(new Set([0, 1, 2].map(n => r.route(i + n).kind)).size, 3, 'scene variety per group')
        if (i % 6 === 0) assert.equal(new Set(Array.from({ length: 6 }, (_, n) => r.profile(i + n).name)).size, 6, 'hill variety per group')
      }
    }
    const fs = require('node:fs'); const vm = require('node:vm'); const context = { module: { exports: {} } }
    vm.runInNewContext(fs.readFileSync(require.resolve('../games/bicycle/rules.js'), 'utf8') +
      '\nmodule.exports.sizes = () => [SECTIONS.size, BLOCKS.size]', context)
    const cached = context.module.exports; cached.initialState(77191)
    for (let i = 0; i < 10000; i++) cached.terrain(i * r.SECTION + 1500)
    assert.ok(cached.sizes().every(size => size <= 12), 'both caches are bounded')
  } finally { r.setWorldSeed(0) }
})

test('random routes preserve launch, landing and obstacle gaps across many seeds and high speeds', () => {
  try {
    for (let seed = 1; seed <= 24; seed++) {
      const s = r.initialState(seed); r.begin(s); let jumped = null
      for (let frame = 0; frame < 14000 && s.status === 'running'; frame++) {
        const obstacle = r.surfaces(s.x, s.x + 350)[0]
        if (obstacle && s.grounded && obstacle.key !== jumped && obstacle.x - s.x <= s.speed * (obstacle.kind === 'van' ? .55 : .35)) {
          r.press(s); r.release(s); jumped = obstacle.key
        }
        r.tick(s, 16)
      }
      assert.equal(s.status, 'running', `seed ${seed}, ${s.crashReason}, at ${s.x}`)
      assert.ok(s.distance > 12000 && s.cleared > 40)
    }
  } finally { r.setWorldSeed(0) }
})
