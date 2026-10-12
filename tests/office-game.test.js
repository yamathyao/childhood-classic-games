const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const rules = require('../games/office/rules.js')
const { layout } = require('../games/office/layout.js')
const renderer = require('../games/office/renderer.js')

function boot(options = {}) {
  let now = 1000; let frameId = 0; let homes = 0
  const storage = options.storage || new Map()
  const frames = new Map(); const texts = []; const arcs = []
  const listeners = Object.fromEntries(['Start', 'Move', 'End', 'Cancel'].map(name => [name, new Set()]))
  const context = Object.fromEntries(['fillRect', 'beginPath', 'moveTo', 'lineTo', 'quadraticCurveTo',
    'closePath', 'arc', 'fill', 'stroke', 'save', 'restore', 'clip'].map(name => [name, (...args) =>
      assert.ok(args.every(value => typeof value !== 'number' || Number.isFinite(value)), name)]))
  const drawArc = context.arc
  context.arc = (...args) => { drawArc(...args); arcs.push(args) }
  context.clearRect = () => { texts.length = 0; arcs.length = 0 }
  context.fillText = (value, x, y) => texts.push({ value: String(value), x, y })
  const wx = {
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => {
      if (options.storageFailure) throw new Error('Full')
      storage.set(key, structuredClone(value))
    }
  }
  for (const name of Object.keys(listeners)) {
    wx['onTouch' + name] = callback => listeners[name].add(callback)
    wx['offTouch' + name] = callback => listeners[name].delete(callback)
  }
  const file = path.resolve(__dirname, '../games/office/game.js')
  const module = { exports: {} }
  vm.runInNewContext('(function(require,module){' + fs.readFileSync(file, 'utf8') + '\n})', {
    wx, Date: { now: () => now }, requestAnimationFrame: callback => { frames.set(++frameId, callback); return frameId },
    cancelAnimationFrame: id => frames.delete(id)
  })(request => require(path.resolve(path.dirname(file), request)), module)
  const screen = options.screen || { width: 375, height: 667, top: 24, bottom: 16 }
  const scene = module.exports.start({ context, screen, goHome: () => { homes++; scene.dispose() } })
  const emit = (type, x, y, identifier = 1) => {
    const touch = { clientX: x, clientY: y, identifier }
    for (const callback of [...listeners[type]]) callback({ changedTouches: [touch], touches: type === 'End' ? [] : [touch] })
  }
  const flush = ms => {
    for (let elapsed = 0; elapsed < ms; elapsed += 16) {
      now += Math.min(16, ms - elapsed)
      const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(now))
    }
  }
  const tap = rect => { const x = rect.x + rect.w / 2; const y = rect.y + rect.h / 2; emit('Start', x, y); emit('End', x, y) }
  const charge = ms => {
    const point = layout(screen).charge
    emit('Start', point.x, point.y); flush(ms); emit('End', point.x, point.y)
  }
  return { scene, screen, frames, texts, arcs, listeners, storage, emit, flush, tap, charge,
    state: () => rules.restore(storage.get(rules.SAVE_KEY)), homes: () => homes }
}

test('charge button owns its gesture, unrelated fingers cannot release it, and aimed swipes do not throw', () => {
  const game = boot(); const view = layout(game.screen)
  assert.equal(game.frames.size, 0)
  game.emit('Start', 170, view.scene.y + 100)
  game.emit('Move', 220, view.scene.y + 60)
  game.emit('End', 220, view.scene.y + 60)
  assert.ok(game.state().yaw > 0 && game.state().pitch > .48)
  assert.equal(game.state().throws, 0)
  game.emit('Start', view.charge.x, view.charge.y)
  game.flush(800)
  game.emit('End', view.charge.x, view.charge.y, 2)
  assert.equal(game.state().throws, 0); assert.equal(game.frames.size, 1)
  game.emit('Move', 50, view.scene.y)
  game.emit('End', 50, view.scene.y)
  assert.equal(game.state().throws, 1)
  assert.ok(game.state().balls[0].vx > 0)
  game.scene.dispose(); assert.equal(game.frames.size, 0)
})

test('released paper lands and remains across home, reload, hide/show and resize; idle releases the scheduler', () => {
  const game = boot(); game.charge(1120); game.flush(5000)
  assert.equal(game.state().scored, 1); assert.equal(game.state().balls.length, 1)
  assert.equal(game.frames.size, 0)
  const saved = rules.snapshot(game.state())
  game.scene.hide(); game.flush(60000); game.scene.show()
  assert.deepEqual(rules.snapshot(game.state()), saved)
  game.scene.resize({ ...game.screen, width: 390, height: 844 })
  assert.equal(game.state().balls.length, 1)
  game.tap(layout({ ...game.screen, width: 390, height: 844 }).back)
  assert.equal(game.homes(), 1)
  for (const set of Object.values(game.listeners)) assert.equal(set.size, 0)
  const resumed = boot({ storage: game.storage })
  assert.deepEqual(rules.snapshot(resumed.state()), saved)
  resumed.charge(200); resumed.flush(6000)
  assert.equal(resumed.state().balls.length, 2)
  assert.equal(resumed.state().scored, 1)
  assert.equal(resumed.frames.size, 0)
  resumed.scene.dispose()
})

test('cancel, hide, resize and dispose cancel pending charge without an accidental throw', () => {
  for (const action of ['cancel', 'hide', 'resize', 'dispose']) {
    const game = boot(); const point = layout(game.screen).charge
    game.emit('Start', point.x, point.y); game.flush(1000)
    if (action === 'cancel') game.emit('Cancel', point.x, point.y)
    else if (action === 'resize') game.scene.resize({ ...game.screen, width: 390 })
    else game.scene[action]()
    game.emit('End', point.x, point.y); game.flush(2000)
    assert.equal(game.state().throws, 0, action); assert.equal(game.frames.size, 0, action)
    game.scene.dispose()
  }
})

test('pause freezes in-flight physics, resume continues, and storage failure leaves controls usable', () => {
  const game = boot(); game.charge(1120); game.flush(120)
  game.tap(layout(game.screen).pause)
  const paused = rules.snapshot(game.state())
  game.flush(30000); game.charge(1000)
  assert.deepEqual(rules.snapshot(game.state()), paused); assert.equal(game.frames.size, 0)
  game.tap(layout(game.screen).pause); game.flush(5000)
  assert.equal(game.state().scored, 1); game.scene.dispose()
  const failed = boot({ storageFailure: true }); failed.charge(1120); failed.flush(5000)
  assert.ok(failed.texts.some(item => item.value === '1 / 1'))
  assert.ok(failed.texts.some(item => item.value.includes('保存失败')))
  failed.scene.dispose(); assert.equal(failed.frames.size, 0)
})

test('miss bubbles and angry cleanup survive pause, background and reload; automatic cleanup preserves bin contents', () => {
  const game = boot(); const view = layout(game.screen)
  game.charge(1120); game.flush(5000)
  for (let shot = 0; shot < 4; shot++) {
    game.charge(200)
    for (let frame = 0; frame < 360 && game.state().reactionSerial <= shot; frame++) game.flush(16)
    assert.equal(game.state().reactionSerial, shot + 1)
    const line = require('../games/office/dialogue.js').LINES.find(item => item.id === game.state().reaction.id)
    assert.ok(game.texts.some(item => item.value.startsWith(rules.PEOPLE[line.speaker].name)))
  }
  game.tap(view.pause)
  const paused = rules.snapshot(game.state())
  assert.equal(paused.missStreak, 4); assert.ok(paused.cleanupIn > 0)
  assert.ok(game.texts.some(item => item.value.includes('生气了')))
  game.flush(30000); assert.deepEqual(rules.snapshot(game.state()), paused)
  game.tap(view.pause)
  game.scene.hide()
  const hidden = rules.snapshot(game.state())
  game.flush(60000); game.scene.show(); game.scene.hide()
  assert.deepEqual(rules.snapshot(game.state()), hidden)
  game.scene.dispose()
  const resumed = boot({ storage: game.storage })
  assert.ok(resumed.texts.some(item => item.value.includes('生气了')))
  resumed.flush(7000)
  const cleaned = resumed.state()
  assert.equal(cleaned.balls.length, 1); assert.ok(rules.inBinPile(cleaned.balls[0]))
  assert.equal(cleaned.cleared, 4); assert.equal(cleaned.scored, 1); assert.equal(cleaned.throws, 5)
  assert.equal(cleaned.reaction, null); assert.equal(resumed.frames.size, 0)
  resumed.scene.dispose()
})

test('manual cleanup clears flying and settled paper and all counters, persists and works while paused', () => {
  for (const paused of [false, true]) {
    const game = boot(); const view = layout(game.screen)
    game.charge(1120); game.flush(5000)
    game.charge(200); game.flush(6000)
    game.charge(1120); game.flush(100)
    if (paused) game.tap(view.pause)
    const clean = view.clean
    game.emit('Start', clean.x + clean.w / 2, clean.y + clean.h / 2)
    game.emit('End', clean.x - 30, clean.y + clean.h / 2)
    assert.equal(game.state().balls.length, 3, 'sliding off cleanup must cancel it')
    game.tap(clean)
    const state = game.state()
    assert.equal(state.balls.length, 0); assert.equal(state.cleared, 0)
    assert.equal(state.scored, 0); assert.equal(state.throws, 0); assert.equal(state.clearedScored, 0)
    assert.equal(state.reaction, null); assert.equal(state.missStreak, 0); assert.equal(game.frames.size, 0)
    game.flush(10000); assert.equal(game.state().balls.length, 0)
    game.scene.dispose()
    const resumed = boot({ storage: game.storage })
    assert.equal(resumed.state().balls.length, 0); assert.equal(resumed.state().throws, 0)
    resumed.charge(1120)
    assert.equal(resumed.state().balls[0].id, 1)
    resumed.scene.dispose()
  }
})

test('swipe and charge can hit a head; hit bubble freezes on pause and survives reload without replay', () => {
  const game = boot(); const view = layout(game.screen)
  const person = rules.PEOPLE[0]
  const yaw = Math.atan2(person.x - rules.ORIGIN.x, person.z - rules.ORIGIN.z)
  const dx = (yaw - rules.DEFAULT_AIM.yaw) * game.screen.width / 1.5
  const x = game.screen.width - 24; const y = view.scene.y + view.scene.h / 2
  game.emit('Start', x, y); game.emit('Move', x + dx, y); game.emit('End', x + dx, y)
  game.charge(800); game.flush(500); game.tap(view.pause)
  const hit = rules.snapshot(game.state())
  assert.deepEqual(hit.balls[0].personHit, { speaker: 0, part: 'head' })
  assert.equal(hit.personHits[0], 1); assert.equal(hit.reactionSerial, 1)
  assert.ok(game.texts.some(item => item.value.includes('被砸到了')))
  assert.ok(game.texts.some(item => item.value.includes('砸到我头')))
  game.flush(30000); assert.deepEqual(rules.snapshot(game.state()), hit)
  game.scene.dispose()
  const resumed = boot({ storage: game.storage })
  assert.ok(resumed.texts.some(item => item.value.includes('被砸到了')))
  resumed.flush(7000)
  assert.equal(resumed.state().personHits[0], 1); assert.equal(resumed.state().reactionSerial, 1)
  assert.equal(resumed.frames.size, 0)
  resumed.tap(layout(resumed.screen).clean)
  assert.deepEqual(resumed.state().personHits, [0, 0, 0]); assert.equal(resumed.state().balls.length, 0)
  resumed.scene.dispose()
})

test('phone safe areas fit the scene, round control and text at small and tall sizes', () => {
  for (const [width, height, top, bottom] of [[320, 568, 44, 34], [375, 667, 24, 16], [390, 844, 47, 34]]) {
    const screen = { width, height, top, bottom }; const view = layout(screen)
    assert.ok(view.scene.y + view.scene.h <= view.controlsTop)
    assert.ok(view.charge.y + view.charge.radius + 29 <= height - bottom)
    const game = boot({ screen })
    assert.ok(game.texts.every(item => item.x >= 0 && item.x <= width && item.y >= top && item.y <= height - bottom))
    game.scene.dispose()
  }
})

test('vertical aiming remains monotonic across the full pitch range and phone sizes', () => {
  for (const [width, height, top, bottom] of [[320, 568, 44, 34], [375, 667, 24, 16], [390, 844, 47, 34]]) {
    const rect = layout({ width, height, top, bottom }).scene
    const state = rules.initialState(); let previous = Infinity
    for (let pitch = .12; pitch < 1.12001; pitch += .02) {
      state.pitch = pitch
      const guide = renderer.aimGuide(rect, state)
      assert.ok(guide.y < previous, `pitch ${pitch} must move up at ${width}x${height}`)
      assert.ok(guide.y >= rect.y + 22 - 1e-8 && guide.y <= rect.y + rect.h - 22 + 1e-8)
      previous = guide.y
    }
  }
})

test('up/down gestures move the visible guide with the finger, including high pitches; charging never moves it', () => {
  for (const [width, height, top, bottom] of [[320, 568, 44, 34], [375, 667, 24, 16], [390, 844, 47, 34]]) {
    const game = boot({ screen: { width, height, top, bottom } }); const view = layout(game.screen)
    const marker = () => game.arcs.find(arc => arc[2] === 10).slice(0, 2)
    const drag = dy => {
      const x = width / 2; const y = view.scene.y + view.scene.h / 2
      game.emit('Start', x, y); game.emit('Move', x, y + dy); game.emit('End', x, y + dy)
    }
    const start = marker(); const scale = renderer.aimGuide(view.scene, rules.initialState()).pitchScale
    drag(-(.96 - rules.DEFAULT_AIM.pitch) * scale)
    const high = marker(); assert.ok(Math.abs(game.state().pitch - .96) < 1e-9)
    assert.ok(high[1] < start[1])
    drag(-8); assert.ok(Math.abs(marker()[1] - high[1] + 8) < 1e-9)
    const raised = marker()
    drag(35); assert.ok(Math.abs(marker()[1] - raised[1] - 35) < 1e-9)
    const aimed = marker()
    const sceneArcs = () => game.arcs.filter(([, y]) => y >= view.scene.y && y <= view.scene.y + view.scene.h)
    const idleArcs = sceneArcs()
    game.emit('Start', view.charge.x, view.charge.y)
    for (const held of [200, 600, 800]) {
      game.flush(held); assert.deepEqual(marker(), aimed)
      assert.deepEqual(sceneArcs(), idleArcs, 'charging cannot add landing or trajectory markers')
      assert.ok(game.texts.every(item => !/落点|轨迹|碰撞点/.test(item.value)), 'charging cannot show predictive hints')
    }
    assert.ok(game.arcs.every(arc => arc[2] !== 2.1), 'no trajectory dots may reappear')
    game.emit('End', view.charge.x, view.charge.y)
    assert.deepEqual(marker(), aimed); assert.equal(game.state().throws, 1)
    game.scene.dispose()
  }
})

test('boss ends a pending charge, persists game over, blocks gameplay and restarts a clean session', () => {
  const seed = rules.initialState(); const person = rules.PEOPLE[0]
  seed.yaw = Math.atan2(person.x - rules.ORIGIN.x, person.z - rules.ORIGIN.z)
  seed.throws = 7; seed.cleared = 7; seed.nextId = 8; seed.totalPersonHits = 7
  const storage = new Map([[rules.SAVE_KEY, rules.snapshot(seed)]])
  const game = boot({ storage }); const view = layout(game.screen)
  game.charge(800)
  game.emit('Start', view.charge.x, view.charge.y); game.flush(1000)
  assert.equal(game.state().gameOver, 'people'); assert.equal(game.frames.size, 0)
  game.emit('End', view.charge.x, view.charge.y)
  game.emit('Start', 40, view.scene.y + 100); game.emit('Move', 140, view.scene.y + 80); game.emit('End', 140, view.scene.y + 80)
  game.tap(view.clean); game.tap(view.pause)
  assert.equal(game.state().throws, 8)
  assert.ok(game.texts.some(item => item.value.includes('GAME OVER')))
  game.scene.hide(); game.flush(5000); game.scene.show(); game.scene.dispose()
  const resumed = boot({ storage }); assert.equal(resumed.frames.size, 0)
  resumed.tap(view.restart)
  assert.equal(resumed.state().gameOver, null); assert.equal(resumed.state().throws, 0)
  assert.equal(resumed.state().totalPersonHits, 0)
  resumed.charge(1120); resumed.flush(5000); assert.equal(resumed.state().scored, 1)
  resumed.scene.dispose()
})
