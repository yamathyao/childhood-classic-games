const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')

function boot(game, options = {}) {
  const root = path.resolve(__dirname, '..')
  const modules = new Map()
  const timers = new Map()
  const listeners = new Map()
  const storage = new Map()
  const surfaces = []
  const metrics = { paints: 0, calls: 0, writes: 0, blits: 0 }
  let now = 1000
  let nextTimer = 0
  function context(main = false) {
    const result = {}
    for (const name of ['fillRect', 'beginPath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo',
      'closePath', 'arc', 'fill', 'stroke', 'save', 'restore', 'clip', 'scale', 'strokeRect', 'fillText']) {
      result[name] = () => { if (main) metrics.calls++ }
    }
    result.clearRect = () => { if (main) { metrics.calls++; metrics.paints++ } }
    result.drawImage = () => {
      if (main && options.failedBlit) throw new Error('Texture upload failed')
      if (main) { metrics.calls++; metrics.blits++ }
    }
    result.createLinearGradient = () => ({ addColorStop() {} })
    return result
  }
  const mainContext = context(true)
  const mainCanvas = { width: 750, height: 1334, getContext: () => mainContext }
  mainContext.canvas = mainCanvas
  const wx = {
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => { metrics.writes++; storage.set(key, structuredClone(value)) },
    createCanvas: () => mainCanvas,
    createOffscreenCanvas: () => {
      if (options.unsupported) throw new Error('Unsupported')
      if (options.sameCanvas) return mainCanvas
      const surfaceContext = context()
      const surface = { width: 0, height: 0, getContext: () => surfaceContext }
      surfaces.push(surface)
      return surface
    }
  }
  for (const event of ['TouchStart', 'TouchMove', 'TouchEnd', 'TouchCancel']) {
    listeners.set(event, new Set())
    wx['on' + event] = callback => listeners.get(event).add(callback)
    wx['off' + event] = callback => listeners.get(event).delete(callback)
  }
  function schedule(callback, delay, interval = false) {
    timers.set(++nextTimer, { callback, at: now + delay, delay, interval })
    return nextTimer
  }
  const globals = {
    wx, Date: class extends Date { static now() { return now } },
    requestAnimationFrame: callback => schedule(callback, 16),
    cancelAnimationFrame: handle => timers.delete(handle),
    setTimeout: (callback, delay) => schedule(callback, delay),
    clearTimeout: handle => timers.delete(handle),
    setInterval: (callback, delay) => schedule(callback, delay, true),
    clearInterval: handle => timers.delete(handle)
  }
  function load(relative) {
    const file = path.resolve(root, relative)
    if (modules.has(file)) return modules.get(file).exports
    const module = { exports: {} }
    modules.set(file, module)
    const evaluate = vm.runInNewContext('(function(require,module){' + fs.readFileSync(file, 'utf8') + '\n})', globals, { filename: file })
    evaluate(request => load(path.resolve(path.dirname(file), request)), module)
    return module.exports
  }
  const screen = { width: 375, height: 667, top: 24, bottom: 16, dpr: 2 }
  const scene = load(`games/${game}/game.js`).start({ context: mainContext, screen, goHome: () => scene.dispose() })
  function advance(duration) {
    const end = now + duration
    while (true) {
      const pending = [...timers].filter(([, entry]) => entry.at <= end).sort((first, second) => first[1].at - second[1].at)[0]
      if (!pending) break
      const [handle, entry] = pending
      now = entry.at
      if (entry.interval) entry.at += entry.delay
      else timers.delete(handle)
      entry.callback(now)
    }
    now = end
  }
  function emit(type, horizontal, vertical) {
    const touch = { clientX: horizontal, clientY: vertical, identifier: 1 }
    for (const listener of listeners.get('Touch' + type)) listener({ changedTouches: [touch], touches: [touch] })
  }
  const tap = rect => {
    emit('Start', rect.x + rect.w / 2, rect.y + rect.h / 2)
    emit('End', rect.x + rect.w / 2, rect.y + rect.h / 2)
  }
  const reset = () => { for (const key of Object.keys(metrics)) metrics[key] = 0 }
  return { scene, load, screen, timers, listeners, storage, surfaces, mainCanvas, metrics, advance, emit, tap, reset }
}

function assertReleased(game) {
  game.scene.dispose()
  assert.equal(game.timers.size, 0)
  assert.ok([...game.listeners.values()].every(listeners => listeners.size === 0))
  assert.ok(game.surfaces.every(surface => surface.width === 1 && surface.height === 1))
  game.reset(); game.advance(2000)
  assert.deepEqual(game.metrics, { paints: 0, calls: 0, writes: 0, blits: 0 })
}

test('sokoban waits without redraws or timers and still records playing time', context => {
  const game = boot('sokoban')
  const level = game.load('games/sokoban/levels.js').defaultLevel
  const rules = game.load('games/sokoban/rules.js').create(level)
  const view = game.load('games/sokoban/layout.js').layout(game.screen, rules.board)
  for (const direction of ['up', 'left', 'right', 'down']) game.tap(view.pad[direction])
  game.reset(); game.advance(3000)
  context.diagnostic(JSON.stringify(game.metrics))
  assert.equal(game.metrics.paints, 0)
  assert.equal(game.timers.size, 0)
  game.scene.hide()
  const elapsed = game.storage.get(rules.saveKey).elapsedMs
  assert.ok(elapsed >= 3000)
  game.advance(2000); game.scene.show(); game.scene.hide()
  assert.equal(game.storage.get(rules.saveKey).elapsedMs, elapsed)
  assertReleased(game)
})

test('tetris paints only when the falling piece changes, and sleeps in background', context => {
  const game = boot('tetris')
  const view = game.load('games/tetris/layout.js').layout(game.screen)
  game.tap(view.pad.left)
  game.reset(); game.advance(2000)
  context.diagnostic(JSON.stringify(game.metrics))
  assert.ok(game.metrics.paints > 0 && game.metrics.paints <= 3)
  game.scene.hide(); game.reset(); game.advance(2000)
  assert.equal(game.metrics.paints, 0)
  assert.equal(game.timers.size, 0)
  game.scene.show()
  assert.equal(game.timers.size, 1)
  assertReleased(game)
})

test('klotski refreshes only the clock while the board is stationary', context => {
  const game = boot('klotski')
  const view = game.load('games/klotski/layout.js').layout(game.screen)
  const piece = game.load('games/klotski/rules.js').initialState().pieces.find(piece => piece.id === 's1')
  const horizontal = view.board.x + (piece.x + piece.w / 2) * view.cell
  const vertical = view.board.y + (piece.y + piece.h / 2) * view.cell
  game.emit('Start', horizontal, vertical)
  game.emit('Move', horizontal, vertical + view.cell)
  game.emit('End', horizontal, vertical + view.cell)
  game.advance(200)
  game.reset(); game.advance(2000)
  context.diagnostic(JSON.stringify(game.metrics))
  assert.equal(game.metrics.paints, 0)
  assert.ok(game.metrics.calls > 0 && game.metrics.calls < 100)
  game.scene.hide(); game.reset(); game.advance(2000)
  assert.equal(game.metrics.calls, 0)
  assert.equal(game.timers.size, 0)
  assert.ok(game.surfaces.every(surface => surface.width === 1 && surface.height === 1))
  assertReleased(game)
})

test('driller idles at oxygen refresh rate and releases its bounded texture atlas', context => {
  const game = boot('driller')
  const level = game.load('games/driller/levels.js').levels[0]
  const view = game.load('games/driller/layout.js').layout(game.screen, level)
  game.tap(view.pad.left); game.advance(200)
  game.reset(); game.advance(2000)
  context.diagnostic(JSON.stringify(game.metrics))
  assert.equal(game.metrics.paints, 2)
  assert.ok(game.metrics.blits > 0)
  assert.ok(game.metrics.calls < 3000)
  assert.equal(game.surfaces.length, 1)
  assert.ok(game.surfaces[0].width * game.surfaces[0].height * 4 < 512 * 1024)
  game.scene.hide(); game.reset(); game.advance(2000)
  assert.equal(game.metrics.paints, 0)
  assert.equal(game.timers.size, 0)
  assert.ok(game.surfaces.every(surface => surface.width === 1))
  game.scene.show()
  assert.equal(game.timers.size, 0)
  assertReleased(game)
})

test('driller retains direct rendering when offscreen canvases are unsupported', () => {
  const game = boot('driller', { unsupported: true })
  const level = game.load('games/driller/levels.js').levels[0]
  const view = game.load('games/driller/layout.js').layout(game.screen, level)
  game.tap(view.pad.down); game.advance(300)
  assert.equal(game.metrics.blits, 0)
  assert.ok(game.metrics.paints >= 2)
  assertReleased(game)
})

test('driller texture failures preserve the main canvas and recover by direct rendering', () => {
  for (const options of [{ sameCanvas: true }, { failedBlit: true }]) {
    const game = boot('driller', options)
    assert.equal(game.mainCanvas.width, 750)
    assert.equal(game.mainCanvas.height, 1334)
    assert.ok(game.metrics.calls > 1000)
    assertReleased(game)
  }
})

test('driller replaces textures on density changes without retaining old buffers', () => {
  const game = boot('driller')
  for (const dpr of [3, 1, 2]) {
    game.scene.resize({ ...game.screen, dpr })
    assert.ok(game.surfaces.slice(0, -1).every(surface => surface.width === 1 && surface.height === 1))
    assert.equal(game.surfaces.filter(surface => surface.width > 1).length, 1)
  }
  assertReleased(game)
})
