const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const rules = require('../games/twentyfour/rules.js')
const { layout } = require('../games/twentyfour/layout.js')

function boot(options = {}) {
  const storage = options.storage || new Map(); const listeners = {}; let writes = 0; let paints = 0; let homes = 0
  let screen = options.screen || { width: 375, height: 667, top: 24, bottom: 16 }
  const texts = []; const formulaDraws = []; const carets = []
  const c = Object.fromEntries(['fillRect', 'beginPath', 'moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo', 'closePath',
    'arc', 'rect', 'fill', 'stroke', 'save', 'restore', 'clip', 'scale', 'translate', 'rotate'].map(name => [name, (...args) =>
      assert.ok(args.every(value => typeof value !== 'number' || Number.isFinite(value)), name)]))
  c.clearRect = () => { paints++; texts.length = 0; formulaDraws.length = 0; carets.length = 0 }
  c.measureText = value => ({ width: [...value].reduce((sum, char) => sum +
    ({ '−': 21, '×': 18, '÷': 19, '(': 6, ')': 6, '+': 12.5 }[char] || 9.5), 0) * parseFloat(c.font) / 20 })
  c.fillText = (value, x, y) => {
    texts.push(String(value))
    if (c.font.endsWith('monospace')) formulaDraws.push({ value, x, y })
  }
  const fillRect = c.fillRect
  c.fillRect = (...args) => { fillRect(...args); if (c.fillStyle === '#315747' && args[2] === 1) carets.push(args[0]) }
  c.createLinearGradient = () => ({ addColorStop() {} })
  const wx = { getStorageSync: key => storage.get(key), setStorageSync: (key, value) => {
    writes++; if (options.failedStorage) throw new Error('Full'); storage.set(key, structuredClone(value))
  } }
  for (const name of ['Start', 'Move', 'End', 'Cancel']) {
    listeners[name] = new Set(); wx['onTouch' + name] = callback => listeners[name].add(callback); wx['offTouch' + name] = callback => listeners[name].delete(callback)
  }
  const file = path.resolve(__dirname, '../games/twentyfour/game.js'); const module = { exports: {} }
  vm.runInNewContext('(function(require,module){' + fs.readFileSync(file, 'utf8') + '\n})', {
    wx, setTimeout() { throw new Error('No timers needed') }, requestAnimationFrame() { throw new Error('No animation needed') }
  })(request => require(path.resolve(path.dirname(file), request)), module)
  const scene = module.exports.start({ context: c, screen, goHome: () => { homes++; scene.dispose() } })
  const emit = (name, rect, id = 1) => {
    const touch = { clientX: rect.x + (rect.w || 0) / 2, clientY: rect.y + (rect.h || 0) / 2, identifier: id }
    for (const callback of [...listeners[name]]) callback({ changedTouches: [touch], touches: name === 'End' ? [] : [touch] })
  }
  const tap = rect => { emit('Start', rect); emit('End', rect) }
  const key = key => tap(layout(screen).keys.find(rect => rect.key === key))
  const type = value => { for (const char of rules.display(value)) key(char) }
  return { scene, storage, listeners, texts, formulaDraws, carets, context: c, emit, tap, key, type, view: () => layout(screen), state: () => rules.restore(storage.get(rules.SAVE_KEY)),
    writes: () => writes, paints: () => paints, homes: () => homes, resize(next) { screen = next; scene.resize(next) } }
}

test('native touch keyboard solves, saves and resumes without duplicate scores', () => {
  const g = boot(); assert.equal(g.writes(), 0)
  g.type('(6+4-2)*3'); g.key('submit'); assert.equal(g.state().solved, 1); assert.equal(g.state().completed, true)
  g.key('delete'); g.key('3'); g.key('submit'); assert.equal(g.state().solved, 1)
  const snapshot = rules.snapshot(g.state()); const writes = g.writes()
  g.scene.hide(); g.scene.show(); g.scene.resize(g.view()); assert.equal(g.writes(), writes)
  g.tap(g.view().back); assert.equal(g.homes(), 1)
  for (const set of Object.values(g.listeners)) assert.equal(set.size, 0)
  const resumed = boot({ storage: g.storage }); assert.deepEqual(rules.snapshot(resumed.state()), snapshot)
  resumed.key('submit'); assert.equal(resumed.state().round, 2); assert.equal(resumed.state().solved, 1)
  resumed.scene.dispose()
})

test('formula caret and touch positions follow measured digits, parentheses and Unicode operators', () => {
  const g = boot(); const expression = '(6−4)×3÷2+1'; g.type(expression)
  const x = g.view().formula.x + 12
  const width = value => { g.context.font = `${g.view().compact ? 20 : 22}px monospace`; return g.context.measureText(value).width }
  for (let cursor = expression.length; cursor >= 0; cursor--) {
    assert.equal(g.state().cursor, cursor)
    assert.equal(g.carets[0], x + width(expression.slice(0, cursor)))
    if (cursor) g.tap(g.view().left)
  }
  for (let cursor = 0; cursor <= expression.length; cursor++) {
    g.tap({ x: x + width(expression.slice(0, cursor)), y: g.view().formula.y + 20 })
    assert.equal(g.state().cursor, cursor)
    assert.equal(g.carets[0], x + width(expression.slice(0, cursor)))
  }
  g.scene.dispose()
})

test('long formula keeps its visible text steady when clicking or moving within the viewport', () => {
  const g = boot({ screen: { width: 320, height: 568, top: 24, bottom: 16 } })
  const expression = '(6−4)×3÷2+1'.repeat(5); g.type(expression)
  const drawn = g.formulaDraws[0]
  assert.equal(drawn.value, expression)
  assert.ok(drawn.x < g.view().formula.x)
  g.tap(g.view().left)
  assert.equal(g.formulaDraws[0].x, drawn.x)
  g.context.font = '20px monospace'
  const cursor = expression.length - 6
  const clickX = drawn.x + g.context.measureText(expression.slice(0, cursor)).width
  g.tap({ x: clickX, y: g.view().formula.y + 20 })
  assert.equal(g.state().cursor, cursor)
  assert.equal(g.carets[0], clickX)
  assert.equal(g.formulaDraws[0].x, drawn.x)
  g.key('7'); assert.equal(g.state().expression, expression.slice(0, cursor) + '7' + expression.slice(cursor))
  g.resize({ width: 390, height: 844, top: 88, bottom: 34 })
  const v = g.view(); assert.ok(g.carets[0] >= v.formula.x + 12 && g.carets[0] <= v.formula.x + v.formula.w - 74)
  g.key('clear'); assert.equal(g.carets[0], v.formula.x + 12)
  g.scene.dispose()
})

test('cards input numbers, arrows edit in place, and invalid answers explain the error', () => {
  const g = boot(); g.tap({ ...g.view().cards[0], w: 20 }); assert.equal(g.state().expression, '3')
  g.key('6'); g.tap(g.view().left); g.key('+'); assert.equal(g.state().expression, '3+6')
  g.key('submit'); assert.ok(g.texts.some(text => text.includes('各用一次')))
  g.key('clear'); g.type('3+4+6+2'); g.key('submit'); assert.ok(g.texts.some(text => text.includes('15')))
  g.key('clear'); g.type('6/(4-4)'); g.key('submit'); assert.ok(g.texts.some(text => text.includes('除数不能是 0')))
  g.key('clear'); g.type('3+6'); g.tap({ x: g.view().formula.x + 12, y: g.view().formula.y + 20 }); g.key('(')
  assert.equal(g.state().expression, '(3+6'); g.scene.dispose()
})

test('help blocks underlying controls, hints and saved progress survive lifecycle events', () => {
  const g = boot(); g.key('hint'); assert.equal(g.state().hintLevel, 1)
  g.tap(g.view().help); const saved = rules.snapshot(g.state()); g.key('7'); g.tap(g.view().swap)
  assert.deepEqual(rules.snapshot(g.state()), saved)
  g.tap(g.view().close); g.key('hint'); assert.equal(g.state().hintLevel, 2)
  const paints = g.paints(); g.scene.hide(); g.key('8'); assert.equal(g.paints(), paints)
  g.scene.show(); g.key('6'); g.scene.dispose()
  const restored = boot({ storage: g.storage }); assert.equal(restored.state().expression, '6'); assert.equal(restored.state().hintLevel, 2); restored.scene.dispose()
})

test('unrelated fingers, swipes, cancels, resize and hide cannot trigger pending actions', () => {
  const g = boot(); const key = g.view().keys[0]
  g.emit('Start', key); g.emit('End', key, 2); assert.equal(g.writes(), 0); g.emit('Cancel', key)
  g.emit('Start', key); g.emit('Move', { x: 0, y: 0 }); g.emit('End', key); assert.equal(g.writes(), 0)
  for (const operation of ['cancel', 'resize', 'hide', 'dispose']) {
    const t = boot(); const key = t.view().keys[0]; t.emit('Start', key)
    if (operation === 'cancel') t.emit('Cancel', key)
    else if (operation === 'resize') t.scene.resize(t.view())
    else t.scene[operation]()
    t.emit('End', key); assert.equal(t.writes(), 0); t.scene.dispose()
  }
  g.scene.dispose()
})

test('failed saves retain a playable state and retry on hide', () => {
  const options = { failedStorage: true }; const g = boot(options); g.type('3+6')
  assert.ok(g.texts.some(text => text.includes('保存失败'))); options.failedStorage = false
  g.scene.hide(); g.scene.show(); assert.equal(g.state().expression, '3+6')
  assert.ok(!g.texts.some(text => text.includes('保存失败'))); g.scene.dispose()
})

test('cards and compact keyboard fit small screens and menu-button safe areas', () => {
  for (const screen of [{ width: 320, height: 568, top: 24, bottom: 16 }, { width: 320, height: 568, top: 64, bottom: 16 },
    { width: 375, height: 667, top: 64, bottom: 16 }, { width: 390, height: 844, top: 88, bottom: 34 }]) {
    const g = boot({ screen }); const v = g.view()
    assert.ok(v.cards[0].y > screen.top + 65)
    assert.ok(v.cards[0].y + v.cardH < v.swap.y)
    assert.ok(v.cards[0].w >= 50 && Math.abs(v.cards[0].w / v.cardH - 5 / 7) < .001)
    assert.ok(v.keys.every(key => key.w >= 44 && key.h >= 36 && key.y + key.h <= screen.height - screen.bottom))
    assert.ok(v.formula.y > v.workspaceY && v.formula.y + v.formula.h < v.keys[0].y)
    g.tap(g.view().help); g.scene.dispose()
  }
})
