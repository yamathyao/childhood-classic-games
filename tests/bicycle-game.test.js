const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const rules = require('../games/bicycle/rules.js')
const { layout } = require('../games/bicycle/layout.js')
const renderer = require('../games/bicycle/renderer.js')

function boot(options = {}) {
  let now = 1000; let frameId = 0; let homes = 0; let writes = 0; let paints = 0; let state
  const storage = new Map(); const frames = new Map(); const texts = []
  const listeners = Object.fromEntries(['Start', 'Move', 'End', 'Cancel'].map(name => [name, new Set()]))
  const context = Object.fromEntries(['fillRect', 'beginPath', 'moveTo', 'lineTo', 'quadraticCurveTo',
    'closePath', 'arc', 'fill', 'stroke', 'save', 'restore', 'clip', 'translate', 'scale', 'rotate'].map(name => [name, (...args) =>
      assert.ok(args.every(value => typeof value !== 'number' || Number.isFinite(value)), 'finite ' + name)]))
  context.clearRect = () => { paints++; texts.length = 0 }
  context.fillText = (value, x, y) => texts.push({ value: String(value), x, y })
  const wx = { getStorageSync: key => storage.get(key), setStorageSync: (key, value) => {
    writes++; if (options.storageFailure) throw new Error('Full'); storage.set(key, structuredClone(value))
  } }
  for (const name of Object.keys(listeners)) {
    wx['onTouch' + name] = callback => listeners[name].add(callback)
    wx['offTouch' + name] = callback => listeners[name].delete(callback)
  }
  const file = path.resolve(__dirname, '../games/bicycle/game.js'); const module = { exports: {} }
  vm.runInNewContext('(function(require,module){' + fs.readFileSync(file, 'utf8') + '\n})', {
    wx, Date: { now: () => now }, requestAnimationFrame: callback => { frames.set(++frameId, callback); return frameId },
    cancelAnimationFrame: id => frames.delete(id)
  })(request => request === './renderer.js' ? { draw: args => { state = args.state; renderer.draw(args) } }
    : request === './rules.js' ? { ...rules, randomSeed: options.randomSeed || (() => 0) } : require(path.resolve(path.dirname(file), request)), module)
  const screen = options.screen || { width: 375, height: 667, top: 24, bottom: 16 }
  const scene = module.exports.start({ context, screen, goHome: () => { homes++; scene.dispose() } })
  function emit(type, x, y, identifier = 1) {
    const t = { clientX: x, clientY: y, identifier }
    for (const callback of [...listeners[type]]) callback({ changedTouches: [t], touches: type === 'End' ? [] : [t] })
  }
  function flush(ms) {
    for (let elapsed = 0; elapsed < ms; elapsed += 16) {
      now += Math.min(16, ms - elapsed); const pending = [...frames.values()]; frames.clear(); pending.forEach(cb => cb(now))
    }
  }
  function tap(rect) { const x = rect.x + rect.w / 2; const y = rect.y + rect.h / 2; emit('Start', x, y); emit('End', x, y) }
  return { scene, screen, view: layout(screen), frames, texts, listeners, storage, emit, flush, tap,
    state: () => state, homes: () => homes, writes: () => writes, paints: () => paints }
}

test('entry waits for a start tap; one ride button jumps immediately and release brakes rotation', () => {
  const g = boot(); assert.equal(g.frames.size, 0); g.flush(1000); assert.equal(g.state().x, 80)
  g.tap(g.view.action); assert.equal(g.state().status, 'running'); assert.equal(g.state().grounded, true)
  const x = g.view.action.x + 60; const y = g.view.action.y + 30
  g.emit('Start', x, y); assert.equal(g.state().grounded, false)
  g.flush(400); const angle = g.state().angle; const omega = g.state().omega; assert.ok(g.state().rotation > 0)
  g.emit('End', x, y); g.flush(100)
  assert.ok(g.state().angle < angle && angle - g.state().angle < .4)
  assert.ok(Math.abs(g.state().omega) < Math.abs(omega) * .5)
  assert.equal(g.frames.size, 1); g.scene.dispose()
})

test('airborne HUD shows completed laps and keeps them visible after release', () => {
  const g = boot(); g.tap(g.view.action); const s = g.state()
  s.x = 1100; s.grounded = false; s.y = rules.terrain(s.x) - 3000
  s.takeoffAngle = s.angle; s.angle -= rules.TAU + .4; s.tricking = true; s.rotation = rules.TAU + .4
  s.airFlips = 1; s.held = false; s.omega = -.2
  g.flush(16)
  assert.ok(g.texts.some(t => t.value.includes('空翻 1 圈') && t.value.includes('稳住落地')))
  g.scene.dispose()
})

test('impact rolls before showing results; the crash can pause and resume without accepting ride input', () => {
  const g = boot(); g.tap(g.view.action)
  const s = g.state(); s.x = rules.OBSTACLE_OFFSET - 75; s.angle = rules.roadAngle(s.x); s.y = rules.supportY(s.x, s.angle)
  g.flush(180)
  assert.equal(s.status, 'crashing'); assert.equal(g.frames.size, 1)
  assert.ok(g.texts.some(t => t.value === '撞击翻滚中…'))
  assert.ok(g.texts.every(t => t.value !== '这趟冒险，先到这里'))
  const angle = s.angle; const distance = s.distance
  g.tap(g.view.action); g.flush(80)
  assert.equal(s.status, 'crashing'); assert.ok(s.angle > angle); assert.equal(s.distance, distance)
  const pauseX = g.view.pause.x + g.view.pause.w / 2; const pauseY = g.view.pause.y + g.view.pause.h / 2
  g.emit('Start', pauseX, pauseY); g.flush(80); g.emit('End', pauseX, pauseY)
  assert.equal(g.frames.size, 0, 'a pause touch keeps ownership across crash animation frames')
  g.tap(g.view.action); assert.equal(g.frames.size, 1)
  g.scene.hide(); const frozen = structuredClone(s); g.flush(60000)
  assert.deepEqual(s, frozen); assert.equal(g.frames.size, 0)
  g.scene.show(); assert.equal(g.frames.size, 0)
  g.tap(g.view.action); g.flush(1300)
  assert.equal(s.status, 'over'); assert.equal(g.frames.size, 0)
  assert.ok(g.texts.some(t => t.value === '这趟冒险，先到这里'))
  assert.equal(g.storage.get(rules.SAVE_KEY).distance, Math.floor(distance))
  const paints = g.paints(); g.flush(1000); assert.equal(g.paints(), paints)
  g.tap(g.view.action); assert.equal(g.state().status, 'running'); assert.equal(g.state().crashMotion, null)
  g.scene.dispose()
})

test('resizing or exiting during a crash cancels animation frames and releases listeners', () => {
  const g = boot(); g.tap(g.view.action)
  const s = g.state(); s.x = rules.OBSTACLE_OFFSET - 75; s.angle = rules.roadAngle(s.x); s.y = rules.supportY(s.x, s.angle)
  g.flush(180); assert.equal(s.status, 'crashing')
  g.scene.resize({ ...g.screen, width: 320, height: 568 }); assert.equal(g.frames.size, 0)
  const frozen = structuredClone(s); g.flush(1000); assert.deepEqual(s, frozen)
  g.tap(g.view.action)
  const backX = g.view.back.x + g.view.back.w / 2; const backY = g.view.back.y + g.view.back.h / 2
  g.emit('Start', backX, backY); g.flush(80); g.emit('End', backX, backY)
  assert.equal(g.homes(), 1); assert.equal(g.frames.size, 0)
  for (const set of Object.values(g.listeners)) assert.equal(set.size, 0)
})

test('secondary fingers do not release or cancel the controlling finger; drifting preserves its hold', () => {
  const g = boot(); g.tap(g.view.action); const x = 100; const y = g.view.action.y + 20
  g.emit('Start', x, y, 4); g.emit('Start', x, y, 5); g.emit('End', x, y, 5); g.emit('Cancel', x, y, 5)
  g.emit('Move', x, 30, 4); g.flush(300); assert.equal(g.state().held, true)
  g.emit('End', x, 30, 4); assert.equal(g.state().held, false); g.scene.dispose()
})

test('touch cancellation releases rotation; hide/show and resize require an explicit resume', () => {
  const g = boot(); g.tap(g.view.action); g.emit('Start', 100, g.view.action.y + 20); g.flush(400)
  g.emit('Cancel', 100, 20); assert.equal(g.state().held, false)
  g.scene.hide(); const frozen = structuredClone(g.state()); const paints = g.paints()
  g.flush(60000); assert.deepEqual(g.state(), frozen); assert.equal(g.paints(), paints); assert.equal(g.frames.size, 0)
  g.scene.show(); assert.equal(g.frames.size, 0); g.tap(g.view.action); assert.equal(g.frames.size, 1)
  g.scene.resize({ ...g.screen, width: 320, height: 568 }); assert.equal(g.frames.size, 0)
  g.scene.dispose(); assert.equal(g.frames.size, 0)
  for (const set of Object.values(g.listeners)) assert.equal(set.size, 0)
})

test('a crash stops redraws, saves the best record, and the same button restarts a fresh run', () => {
  const g = boot(); g.tap(g.view.action); g.flush(8000)
  assert.equal(g.state().status, 'over'); assert.equal(g.frames.size, 0)
  const saved = g.storage.get(rules.SAVE_KEY); assert.ok(saved.distance > 80)
  const paints = g.paints(); g.flush(1000); assert.equal(g.paints(), paints)
  g.tap(g.view.action); assert.equal(g.state().status, 'running'); assert.equal(g.state().distance, 0)
  assert.deepEqual(g.storage.get(rules.SAVE_KEY), saved); g.tap(g.view.back); assert.equal(g.homes(), 1)
  assert.equal(g.frames.size, 0)
})

test('failed record writes show a warning and are retried when storage becomes available', () => {
  const options = { storageFailure: true }; const g = boot(options); g.tap(g.view.action); g.flush(2300)
  assert.ok(g.texts.some(item => item.value.includes('纪录保存失败')))
  options.storageFailure = false; g.scene.hide(); g.scene.show()
  assert.ok(g.storage.get(rules.SAVE_KEY).distance > 0)
  assert.ok(g.texts.every(item => !item.value.includes('纪录保存失败'))); g.scene.dispose()
})

test('game controls and overlays fit small and large phone safe areas', () => {
  for (const [width, height, top, bottom] of [[320, 568, 24, 16], [375, 667, 24, 16], [390, 844, 47, 34]]) {
    const g = boot({ screen: { width, height, top, bottom } }); const v = g.view
    assert.ok(v.action.y + v.action.h <= height - bottom)
    assert.ok(v.scene.y + v.scene.h < v.action.y)
    assert.ok(v.panel.y >= v.scene.y && v.panel.y + v.panel.h <= v.scene.y + v.scene.h)
    for (const t of g.texts) assert.ok(t.y >= top && t.y <= height - bottom)
    g.scene.dispose()
  }
})

test('new rides get fresh routes while pause, hide and resize preserve the current seed', () => {
  let calls = 0
  const g = boot({ randomSeed: () => ++calls * 7919 })
  const sample = () => Array.from({ length: 6 }, (_, i) => [rules.profile(i).name, rules.route(i).kind, rules.feature(i).lip])
  try {
    const first = sample(); const seed = g.state().seed
    assert.equal(seed, 7919); g.tap(g.view.action); g.flush(80)
    g.scene.hide(); g.scene.show(); g.scene.resize(g.screen)
    assert.equal(calls, 1); assert.equal(g.state().seed, seed); assert.deepEqual(sample(), first)
    g.state().status = 'over'; g.tap(g.view.action)
    assert.equal(g.state().status, 'running'); assert.equal(g.state().seed, 15838)
    assert.equal(calls, 2); assert.notDeepEqual(sample(), first)
  } finally { g.scene.dispose(); rules.setWorldSeed(0) }
})
