const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const { layout } = require('../games/driller/layout.js')
const { create } = require('../games/driller/rules.js')
const { levels } = require('../games/driller/levels.js')
const renderer = require('../games/driller/renderer.js')

function boot(options = {}) {
  const texts = []
  const frames = new Map()
  let frameId = 0
  let now = 1000
  let homeCount = 0
  const storage = options.storage || new Map()
  const listeners = Object.fromEntries(['TouchStart', 'TouchMove', 'TouchEnd', 'TouchCancel'].map(name => [name, new Set()]))
  const context = Object.fromEntries(['fillRect', 'beginPath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'closePath', 'arc', 'fill', 'stroke', 'save', 'restore', 'clip'].map(name => [name, (...values) => assert.ok(values.every(value => typeof value !== 'number' || Number.isFinite(value)), name)]))
  context.createLinearGradient = () => ({ addColorStop() {} })
  context.clearRect = () => { texts.length = 0 }
  context.fillText = (value, x, y) => texts.push({ value: String(value), x, y })
  const wx = {
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => { if (options.storageFailure) throw new Error('Full'); storage.set(key, structuredClone(value)) }
  }
  for (const name of Object.keys(listeners)) {
    wx['on' + name] = callback => listeners[name].add(callback)
    wx['off' + name] = callback => listeners[name].delete(callback)
  }
  const file = path.resolve(__dirname, '../games/driller/game.js')
  const module = { exports: {} }
  vm.runInNewContext('(function(require,module){' + fs.readFileSync(file, 'utf8') + '\n})', {
    wx, Date: { now: () => now },
    requestAnimationFrame: callback => { frames.set(++frameId, callback); return frameId },
    cancelAnimationFrame: handle => frames.delete(handle)
  })(request => require(path.resolve(path.dirname(file), request)), module)
  const screen = options.screen || { width: 375, height: 667, top: 24, bottom: 16 }
  const scene = module.exports.start({ context, screen, goHome: () => { homeCount++; scene.dispose() }, levelId: options.levelId || levels[0].id })
  const emit = (type, x, y, identifier = 1) => {
    const touch = { clientX: x, clientY: y, identifier }
    for (const listener of [...listeners['Touch' + type]]) listener({ changedTouches: [touch], touches: [touch] })
  }
  const tap = rect => { emit('Start', rect.x + rect.w / 2, rect.y + rect.h / 2); emit('End', rect.x + rect.w / 2, rect.y + rect.h / 2) }
  const flush = (duration = 250) => {
    for (let elapsed = 0; elapsed < duration; elapsed += 50) {
      now += Math.min(50, duration - elapsed)
      const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(now))
    }
  }
  const state = (level = levels[0]) => create(level).restore(storage.get(create(level).saveKey))
  return { scene, texts, frames, listeners, storage, screen, tap, emit, flush, state, homeCount: () => homeCount }
}

function finalApproach(level) {
  const rules = create(level)
  const state = rules.initialState()
  state.grid = state.grid.map((color, position) => color === '#' ? '#' : position < rules.width * (rules.height - 2) ? '.' : 'A')
  state.player = (rules.height - 3) * rules.width + 5
  state.depth = level.targetDepth - 1
  state.started = true
  state.steps = 1
  return new Map([[rules.saveKey, rules.snapshot(state)]])
}

for (const [width, height] of [[320, 568], [375, 667], [390, 844]]) test(`arcade driller controls and ten-column playfield fit ${width}x${height}`, () => {
  const screen = { width, height, top: 44, bottom: 34 }
  const view = layout(screen, levels[0])
  assert.equal(view.columns, 12)
  assert.ok(view.board.y > view.oxygen.y + view.oxygen.h + 8)
  assert.ok(view.board.y + view.board.h + 24 <= view.pad.left.y)
  const rects = [view.board, view.back, view.reset, view.pause, view.oxygen, ...Object.values(view.pad)]
  rects.forEach(rect => {
    assert.ok(rect.x >= 0 && rect.x + rect.w <= width)
    assert.ok(rect.y >= screen.top && rect.y + rect.h <= height - screen.bottom)
  })
  for (const name of ['left', 'right', 'down']) assert.ok(view.pad[name].w >= 70 && view.pad[name].h >= 48)
  const game = boot({ screen })
  assert.ok(game.texts.every(item => item.x >= 0 && item.x <= width && item.y >= 0 && item.y <= height))
  assert.ok(game.texts.some(item => item.value.includes('向上钻')))
  assert.equal(game.frames.size, 0)
  game.scene.dispose()
})

test('first touch responds immediately, holding repeats, releasing keeps one realtime loop', () => {
  const game = boot()
  const view = layout(game.screen, levels[0])
  const rect = view.pad.down
  game.emit('Start', rect.x + 20, rect.y + 20)
  assert.equal(game.state().steps, 1)
  assert.equal(game.frames.size, 1)
  game.flush(350)
  assert.ok(game.state().steps >= 2)
  game.emit('End', rect.x + 20, rect.y + 20)
  const steps = game.state().steps
  game.flush(200)
  game.tap(view.pause)
  assert.equal(game.state().steps, steps)
  assert.equal(game.frames.size, 0)
  game.scene.dispose()
})

test('real time drains oxygen; pause and background preserve exact state and resume safely', () => {
  const game = boot()
  const view = layout(game.screen, levels[0])
  game.tap(view.pad.left)
  game.flush(1000)
  assert.equal(game.state().oxygen, 99)
  game.tap(view.pause)
  const saved = JSON.stringify(game.state())
  game.flush(10000)
  assert.equal(JSON.stringify(game.state()), saved)
  game.tap(renderer.modalButtons(view, 'pause', false)[0])
  game.scene.hide()
  assert.equal(game.frames.size, 0)
  game.flush(30000)
  game.scene.show()
  assert.ok(game.texts.some(item => item.value === '休息一下'))
  assert.equal(JSON.stringify(game.state()), saved)
  game.tap(renderer.modalButtons(view, 'pause', false)[0])
  game.tap(view.back)
  assert.equal(game.homeCount(), 1)
  assert.ok(Object.values(game.listeners).every(set => set.size === 0))
  assert.equal(game.frames.size, 0)
})

test('500m victory can inspect the shaft and advance to an independent 1000m course', () => {
  const game = boot({ storage: finalApproach(levels[0]) })
  const view = layout(game.screen, levels[0])
  game.tap(renderer.modalButtons(view, 'pause', false)[0])
  game.tap(view.pad.down)
  game.flush()
  assert.equal(game.state().status, 'won')
  assert.ok(game.texts.some(item => item.value === '下一关'))
  game.tap(renderer.modalButtons(view, 'result', true)[0])
  assert.equal(game.texts.some(item => item.value === '下一关'), false)
  game.tap(view.pause)
  game.tap(renderer.modalButtons(view, 'result', true)[2])
  assert.equal(game.storage.get('driller.currentLevel'), levels[1].id)
  assert.equal(game.state(levels[1]).steps, 0)
  assert.equal(game.state(levels[0]).status, 'won')
  assert.equal(game.storage.has('tetris.v1'), false)
  game.scene.dispose()
})

test('restart generates a fresh mine; reload preserves the previous seed and pauses', () => {
  const game = boot()
  const view = layout(game.screen, levels[0])
  game.tap(view.pad.down)
  const seed = game.state().seed
  game.tap(view.reset)
  game.tap(renderer.modalButtons(view, 'reset', false)[0])
  assert.equal(game.state().seed, seed)
  game.scene.dispose()
  const resumed = boot({ storage: game.storage })
  assert.equal(resumed.state().seed, seed)
  assert.ok(resumed.texts.some(item => item.value === '休息一下'))
  resumed.tap(renderer.modalButtons(view, 'pause', false)[0])
  resumed.tap(view.reset)
  resumed.tap(renderer.modalButtons(view, 'reset', false)[1])
  assert.equal(resumed.state().steps, 0)
  assert.notEqual(resumed.state().seed, seed)
  resumed.scene.dispose()
})

test('outdated short-course saves are preserved and storage failures remain visible', () => {
  const old = { version: 1, levelId: 'driller-01', history: ['down'] }
  const storage = new Map([['driller.driller-01.v1', old], ['driller.currentLevel', 'driller-01']])
  const game = boot({ storage, levelId: 'driller-01' })
  assert.deepEqual(storage.get('driller.driller-01.v1'), old)
  assert.equal(game.state().steps, 0)
  game.scene.dispose()
  const failed = boot({ storageFailure: true })
  assert.ok(failed.texts.some(item => item.value.includes('存档未保存')))
  failed.scene.dispose()
})

test('last-course victory and remaining-life dialogs have appropriate actions', () => {
  const level = levels[1]
  const game = boot({ levelId: level.id, storage: finalApproach(level) })
  const view = layout(game.screen, level)
  game.tap(renderer.modalButtons(view, 'pause', false)[0])
  game.tap(view.pad.down); game.flush()
  assert.ok(game.texts.some(item => item.value === '返回合集'))
  assert.equal(game.texts.some(item => item.value === '下一关'), false)
  game.scene.dispose()
  const rules = create(level)
  const state = rules.initialState()
  state.started = true; state.oxygen = 1
  rules.tick(state, 1000)
  const injured = boot({ levelId: level.id, storage: new Map([[rules.saveKey, rules.snapshot(state)]]) })
  assert.ok(injured.texts.some(item => item.value === '继续挑战'))
  injured.tap(renderer.modalButtons(view, 'result', false, 'respawn')[0])
  assert.equal(injured.state(level).lives, 2)
  assert.equal(injured.state(level).status, 'playing')
  injured.scene.dispose()
})

test('cancel and resize stop a held direction without leaking extra frame loops', () => {
  const game = boot()
  const view = layout(game.screen, levels[0])
  game.emit('Start', view.pad.left.x + 20, view.pad.left.y + 20)
  game.emit('Cancel', 0, 0)
  game.scene.resize({ ...game.screen, height: 844 })
  game.flush(500)
  game.scene.hide()
  assert.equal(game.state().steps, 1)
  assert.equal(game.frames.size, 0)
  game.scene.dispose()
})
