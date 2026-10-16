const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const rules = require('../games/roadtrip/rules.js')
const route = require('../games/roadtrip/route.js')
const scenery = require('../games/roadtrip/scenery.js')
const store = require('../games/roadtrip/storage.js')
const { layout } = require('../games/roadtrip/layout.js')

function boot(options = {}) {
  const storage = options.storage || new Map(); const listeners = {}; const frames = new Map()
  let now = 1000; let frameId = 0; let paints = 0; let homes = 0; let data; let failed = !!options.failedStorage
  const writes = []
  const wx = { getStorageSync: key => storage.get(key), setStorageSync: (key, value) => {
    if (failed) throw new Error('Full'); storage.set(key, structuredClone(value)); writes.push(key)
  } }
  for (const name of ['Start', 'Move', 'End', 'Cancel']) {
    listeners[name] = new Set(); wx['onTouch' + name] = cb => listeners[name].add(cb); wx['offTouch' + name] = cb => listeners[name].delete(cb)
  }
  const c = {}
  for (const name of ['beginPath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'closePath', 'arc', 'ellipse', 'fill', 'stroke', 'save', 'restore',
    'clip', 'translate', 'scale', 'rotate', 'setLineDash', 'strokeRect', 'fillRect', 'fillText', 'clearRect']) {
    c[name] = (...args) => assert.ok(args.every(v => typeof v !== 'number' || Number.isFinite(v)), name)
  }
  c.createLinearGradient = () => ({ addColorStop() {} })
  const nativeRenderer = require('../games/roadtrip/renderer.js')
  const renderer = { draw(args) { data = args; paints++; if (options.realArt) nativeRenderer.draw(args) } }
  const file = path.resolve(__dirname, '../games/roadtrip/game.js'); const module = { exports: {} }
  vm.runInNewContext('(function(require,module){' + fs.readFileSync(file, 'utf8') + '\n})', {
    wx, Date: class extends Date { static now() { return now } },
    requestAnimationFrame: cb => { frames.set(++frameId, cb); return frameId }, cancelAnimationFrame: id => frames.delete(id)
  })(request => request === './renderer.js' ? renderer : require(path.resolve(path.dirname(file), request)), module)
  const scene = module.exports.start({ context: c, screen: options.screen || { width: 375, height: 667, top: 24, bottom: 16 },
    goHome() { homes++; scene.dispose() } })
  const touch = (r, id = 1) => ({ identifier: id, clientX: r.x + r.w / 2, clientY: r.y + r.h / 2 })
  const emit = (name, changed = [], touches = changed) => { for (const cb of [...listeners[name]]) cb({ changedTouches: changed, touches }) }
  const tap = r => { const t = touch(r); emit('Start', [t]); emit('End', [t], []) }
  const advance = (ms = 32) => {
    for (let t = 0; t < ms; t += 16) { now += 16; const pending = [...frames.values()]; frames.clear(); pending.forEach(cb => cb(now)) }
  }
  return { scene, frames, storage, writes, listeners, touch, emit, tap, advance, data: () => data, homes: () => homes, paints: () => paints,
    failStorage(value) { failed = value }, control(key) { return data.view.controls.find(r => r.key === key) } }
}

test('selection is a separate, idle page; all settings persist and corrupt data falls back', () => {
  const g = boot(); assert.equal(g.data().page, 'setup'); assert.equal(g.data().state, null); assert.equal(g.frames.size, 0)
  g.tap(g.data().view.modes[1]); g.tap(g.data().view.cars[4]); g.tap(g.data().view.densities[2])
  assert.deepEqual(g.storage.get(store.SETTINGS_KEY), { mode: 'manual', model: 4, density: 'busy' })
  g.tap(g.data().view.start); assert.equal(g.data().page, 'drive'); assert.equal(g.data().state.model, 4)
  assert.equal(g.data().state.phase, 'entering'); assert.equal(g.frames.size, 1)
  g.tap(g.data().view.back); assert.equal(g.data().page, 'setup'); assert.equal(g.frames.size, 0)
  g.tap(g.data().view.back); assert.equal(g.homes(), 1)
  for (const set of Object.values(g.listeners)) assert.equal(set.size, 0)
  const restored = boot({ storage: g.storage }); assert.equal(restored.data().settings.model, 4); restored.scene.dispose()
  assert.deepEqual(store.settings({ model: 99, mode: 'evil', density: [] }), { model: 0, mode: 'cruise', density: 'easy' })
  assert.deepEqual(store.records({ trips: Infinity, bestScore: '1', bestDistance: NaN, arrivals: -1 }), { bestScore: 0, bestDistance: 0, trips: 0, arrivals: 0 })
})

test('two fingers steer and accelerate independently; unrelated release, cancel and dragging out release correctly', () => {
  const g = boot(); g.tap(g.data().view.modes[1]); g.tap(g.data().view.start)
  Object.assign(g.data().state, { phase: 'driving', distance: 150, lane: 1, targetLane: 1, traffic: [] })
  const left = g.touch(g.control('left'), 10); const accelerate = g.touch(g.control('accelerate'), 20)
  g.emit('Start', [left]); g.emit('Start', [accelerate], [left, accelerate]); g.advance(160)
  assert.equal(g.data().input.left, true); assert.equal(g.data().input.accelerate, true)
  assert.ok(g.data().state.lane < 1)
  g.emit('End', [{ ...left, identifier: 99 }], [left, accelerate]); assert.equal(g.data().input.left, true)
  g.emit('End', [accelerate], [left]); assert.equal(g.data().input.accelerate, false); assert.equal(g.data().input.left, true)
  g.emit('Cancel', [left], []); assert.equal(g.data().input.left, false)
  g.emit('Start', [accelerate]); g.emit('Move', [{ ...accelerate, clientY: 0 }]); assert.equal(g.data().input.accelerate, false)
  g.emit('End', [accelerate], []); g.scene.dispose(); assert.equal(g.frames.size, 0)
})

test('cruise touch changes one lane per press and rejects an occupied gap', () => {
  const g = boot(); g.tap(g.data().view.start)
  Object.assign(g.data().state, { phase: 'driving', distance: 150, lane: 1, targetLane: 1, traffic: [] })
  const left = g.touch(g.control('left'), 4); g.emit('Start', [left]); assert.equal(g.data().state.targetLane, 0)
  g.emit('Start', [left]); g.advance(1500); assert.equal(g.data().state.targetLane, 0)
  g.emit('End', [left], [])
  Object.assign(g.data().state, { lane: 1, targetLane: 1, traffic: [{ id: 100, lane: 2, z: 6, speed: 20, desired: 20 }] })
  g.tap(g.control('right')); assert.equal(g.data().state.targetLane, 1); assert.match(g.data().state.notice, /旁边有车/)
  g.scene.dispose()
})

test('a burst of multi-touch moves shares the next animation frame rather than repainting per event', () => {
  const g = boot(); g.tap(g.data().view.modes[1]); g.tap(g.data().view.start)
  Object.assign(g.data().state, { phase: 'driving', lane: 1, targetLane: 1, distance: 150, traffic: [] })
  const left = g.touch(g.control('left'), 10); const gas = g.touch(g.control('accelerate'), 20)
  const before = g.paints()
  g.emit('Start', [left]); g.emit('Start', [gas], [left, gas])
  for (let i = 0; i < 100; i++) g.emit('Move', [left, gas])
  assert.equal(g.paints(), before); assert.equal(g.frames.size, 1)
  assert.equal(g.data().input.left, true); assert.equal(g.data().input.accelerate, true)
  g.advance(16); assert.equal(g.paints(), before + 1); assert.equal(g.frames.size, 1)
  g.emit('End', [left], [gas]); g.emit('Cancel', [gas], [])
  assert.equal(g.data().input.left, false); assert.equal(g.data().input.accelerate, false)
  assert.equal(g.paints(), before + 1)
  g.tap(g.data().view.pause); assert.equal(g.data().state.status, 'paused')
  assert.equal(g.frames.size, 0); assert.equal(g.paints(), before + 2)
  g.scene.dispose()
})

test('hide, resize, help and pause stop frames, clear held controls and never resume automatically', () => {
  const g = boot(); g.tap(g.data().view.start); g.advance(500)
  const accel = g.touch(g.control('accelerate')); g.emit('Start', [accel]); g.scene.hide()
  assert.equal(g.frames.size, 0); assert.equal(g.data().state.status, 'paused'); assert.equal(g.data().input.accelerate, false)
  const snapshot = JSON.stringify(g.data().state); const paints = g.paints(); g.advance(10000); assert.equal(g.paints(), paints)
  g.scene.show(); assert.equal(JSON.stringify(g.data().state), snapshot); assert.equal(g.frames.size, 0)
  g.tap(g.data().view.resume); g.advance(32); assert.ok(g.data().state.distance - JSON.parse(snapshot).distance < 1)
  g.scene.resize({ width: 320, height: 568, top: 64, bottom: 16 }); assert.equal(g.frames.size, 0); assert.equal(g.data().state.status, 'paused')
  g.tap(g.data().view.resume); g.tap(g.data().view.help); assert.equal(g.data().help, true); assert.equal(g.frames.size, 0)
  g.tap(g.control('accelerate')); assert.equal(g.data().input.accelerate, false)
  g.tap(g.data().view.close); assert.equal(g.data().state.status, 'paused'); assert.equal(g.frames.size, 0)
  g.tap(g.data().view.resume); g.tap(g.data().view.pause); assert.equal(g.frames.size, 0)
  g.tap(g.data().view.choose); assert.equal(g.data().page, 'setup'); g.scene.dispose()
})

test('exit button leads to a terminal result, saves once, retries failed storage, and restarts a clean run', () => {
  const g = boot(); g.tap(g.data().view.start)
  Object.assign(g.data().state, { phase: 'driving', distance: 1500, lane: 3, targetLane: 3, traffic: [], speed: 20 })
  g.advance(); g.tap(g.data().view.exit); assert.equal(g.data().state.exitRequested, true)
  for (let i = 0; i < 1250 && g.data().state.phase === 'driving'; i++) g.advance(16)
  assert.equal(g.data().state.phase, 'exiting')
  Object.assign(g.data().state, { distance: route.exitAt(1500).end - .01, traffic: [], score: 90, distancePoints: 70, skillPoints: 20 })
  g.failStorage(true); g.advance(); assert.equal(g.data().state.status, 'finished'); assert.equal(g.frames.size, 0)
  assert.match(g.data().warning, /保存失败/); assert.equal(g.data().records.arrivals, 1)
  g.failStorage(false); g.scene.hide(); g.scene.show(); g.scene.resize(g.data().view)
  assert.equal(g.storage.get(store.RECORDS_KEY).arrivals, 1)
  assert.equal(g.writes.filter(k => k === store.RECORDS_KEY).length, 1)
  g.tap(g.data().view.resume); assert.equal(g.data().state.distance, 0); assert.equal(g.data().state.score, 0); assert.equal(g.frames.size, 1)
  g.scene.dispose(); assert.equal(g.storage.get(store.RECORDS_KEY).trips, 1)
})

test('collision settles only once and controls remain disabled under results', () => {
  const g = boot(); g.tap(g.data().view.start)
  Object.assign(g.data().state, { phase: 'driving', lane: 1, targetLane: 1, distance: 150, score: 250, distancePoints: 210, skillPoints: 40, traffic: [{ id: 98, model: 0, lane: 1, z: 0, speed: 15, desired: 15 }] })
  g.advance(); assert.equal(g.data().state.status, 'crashed'); assert.equal(g.frames.size, 0)
  assert.equal(g.data().state.score, 0)
  assert.equal(g.storage.get(store.RECORDS_KEY).bestScore, 0)
  const snapshot = JSON.stringify(g.data().state); g.tap(g.control('left')); g.advance(500)
  assert.equal(JSON.stringify(g.data().state), snapshot)
  g.scene.hide(); g.scene.show(); assert.equal(g.storage.get(store.RECORDS_KEY).trips, 1); assert.equal(g.storage.get(store.RECORDS_KEY).arrivals, 0)
  g.tap(g.data().view.choose); assert.equal(g.data().page, 'setup'); g.scene.dispose()
})

test('small and tall phone layouts fit safe areas and art draws without browser globals or roundRect', () => {
  for (const [width, height, top, bottom] of [[320, 568, 24, 16], [320, 568, 64, 16], [375, 667, 24, 16], [390, 844, 88, 34]]) {
    const screen = { width, height, top, bottom }; const v = layout(screen)
    assert.ok(v.scene.h > 240); assert.ok(v.scene.y + v.scene.h < v.dashboard.y)
    assert.ok(v.densityY + 76 < v.start.y)
    for (const r of [...v.cars, ...v.modes, ...v.densities, ...v.controls, v.start, v.modal]) {
      assert.ok(r.x >= 0 && r.y >= top && r.x + r.w <= width && r.y + r.h <= height - bottom)
    }
    const g = boot({ screen, realArt: true }); g.tap(g.data().view.help); g.tap(g.data().view.close); g.tap(g.data().view.start)
    g.advance(250); g.tap(g.data().view.pause); g.scene.dispose()
  }
})

test('save errors retain selections in memory, show a warning and retry on lifecycle events', () => {
  const g = boot({ failedStorage: true }); g.tap(g.data().view.cars[5]); assert.equal(g.data().settings.model, 5)
  assert.match(g.data().warning, /保存失败/); assert.equal(g.storage.size, 0)
  g.failStorage(false); g.scene.hide(); g.scene.show(); assert.equal(g.storage.get(store.SETTINGS_KEY).model, 5)
  assert.equal(g.data().warning, ''); g.scene.dispose()
})

test('landscapes cover distinct districts and landmarks with stable distance boundaries', () => {
  assert.equal(scenery.THEMES.length, 11)
  assert.deepEqual(scenery.THEMES.map(t => t.id), ['town', 'park', 'farmland', 'coast', 'westlake', 'shanghai', 'riverside', 'bridge', 'windmill', 'fuji', 'paris'])
  for (let i = 0; i < scenery.THEMES.length * 3; i++) {
    assert.equal(scenery.themeAt(i * scenery.SEGMENT).id, scenery.THEMES[i % scenery.THEMES.length].id)
    assert.equal(scenery.themeAt((i + 1) * scenery.SEGMENT - .01).id, scenery.THEMES[i % scenery.THEMES.length].id)
  }
  assert.equal(scenery.themeAt(-10).id, 'town')
})

test('visible scenery stays bounded, deterministic and outside curved main roads and ramps', () => {
  for (let distance = 0; distance < 10000; distance += 17) {
    const origin = 360 - route.sample(distance).center
    const plots = scenery.plots(distance - 40, distance + 130, 720, origin)
    assert.ok(plots.length <= 48)
    for (const plot of plots) {
      assert.ok(plot.x + plot.w / 2 >= 0 && plot.x - plot.w / 2 <= 720)
      for (let d = plot.distance - plot.h / 16; d <= plot.distance + plot.h / 16; d += 2) {
        const edge = scenery.edgeAt(d, plot.side)
        if (plot.side < 0) assert.ok(plot.x + plot.w / 2 - origin <= edge + .01, 'Left footprint stays clear')
        else assert.ok(plot.x - plot.w / 2 - origin >= edge - .01, 'Right footprint stays clear')
      }
    }
  }
  const original = scenery.plots(900, 1100, 720, 360)
  scenery.plots(9999900, 10000100, 1000, 500)
  assert.deepEqual(scenery.plots(900, 1100, 720, 360), original)
  for (const d of [0, 60, 100]) assert.ok(scenery.edgeAt(d, 1) > route.entryX(d) + route.LANE / 2)
  for (const d of [1600, 1650, 1710, 1720, 3200, 3300]) {
    const exit = route.exitAt(d - 22)
    assert.ok(scenery.edgeAt(d, 1) >= route.exitX(d, exit) + route.LANE / 2 + 28)
  }
})

test('all landscapes draw on the native Canvas API without mutating driving or score state', () => {
  const g = boot({ realArt: true }); g.tap(g.data().view.start); g.tap(g.data().view.pause)
  const renderer = require('../games/roadtrip/renderer.js')
  for (let i = 0; i < scenery.THEMES.length; i++) {
    Object.assign(g.data().state, { distance: i * 320 + 144, phase: 'driving', lane: 1, targetLane: 1 })
    const before = JSON.stringify(g.data().state)
    renderer.draw(g.data()); assert.equal(JSON.stringify(g.data().state), before)
  }
  g.scene.dispose()
})

test('each landmark district has one landmark, surrounded by ordinary plots, across viewport changes', () => {
  for (let i = 0; i < scenery.THEMES.length * 3; i++) {
    const start = i * scenery.SEGMENT; const theme = scenery.themeAt(start)
    const plots = scenery.plots(start, start + scenery.SEGMENT, 4000, 2000).filter(p => p.distance >= start && p.distance < start + scenery.SEGMENT)
    const marked = plots.filter(p => p.landmark)
    assert.equal(marked.length, theme.landmark ? 1 : 0, theme.id)
    if (!theme.landmark) continue
    assert.equal(marked[0].landmark, theme.landmark)
    assert.ok(plots.filter(p => !p.landmark).length > 20)
    const distance = marked[0].distance
    for (const width of [720, 1000, 4000]) {
      const origin = width / 2 - route.sample(distance).center
      for (const offset of [-20, 0, 20]) {
        const visible = scenery.plots(distance - 40 + offset, distance + 60 + offset, width, origin).filter(p => p.landmark)
        assert.equal(visible.length, 1)
        assert.equal(visible[0].distance, distance)
        assert.equal(visible[0].side, -1); assert.equal(visible[0].column, 0)
        assert.ok(Math.abs((visible[0].x - origin) - (marked[0].x - 2000)) < 1e-8)
      }
    }
  }
})

test('water crossings have finite spans and repeat with scenery rather than road exits', () => {
  const cycle = scenery.THEMES.length * scenery.SEGMENT
  for (let i = 0; i < 3; i++) {
    const start = 7 * scenery.SEGMENT + i * cycle + 36; const end = start + 248
    assert.equal(scenery.bridgeAt(start - .01), null)
    assert.deepEqual(scenery.bridgeAt(start), { start, end })
    assert.deepEqual(scenery.bridgeAt(end), { start, end })
    assert.equal(scenery.bridgeAt(end + .01), null)
    assert.deepEqual(scenery.bridges(start + 50, end - 50), [{ start, end }])
    assert.deepEqual(scenery.bridges(end + 1, end + 50), [])
  }
  assert.equal(scenery.bridges(0, cycle * 3).length, 3)
})
