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
  const storage = new Map(options.storage || [])
  const surfaces = []
  const images = []
  const texts = []
  const opened = []
  const metrics = { paints: 0, calls: 0, writes: 0, blits: 0 }
  const writesByKey = new Map()
  let recordWriteFailures = options.recordWriteFailures || 0
  let now = 1000
  let nextTimer = 0
  function context(main = false) {
    const result = {}
    for (const name of ['fillRect', 'beginPath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo',
      'closePath', 'arc', 'rect', 'fill', 'stroke', 'save', 'restore', 'clip', 'scale', 'translate', 'rotate', 'setLineDash', 'strokeRect', 'fillText']) {
      result[name] = () => { if (main) metrics.calls++ }
    }
    result.fillText = (value, x, y) => { if (main) { metrics.calls++; texts.push({ text: String(value), x, y }) } }
    result.clearRect = () => { if (main) { metrics.calls++; metrics.paints++; texts.length = 0 } }
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
    setStorageSync: (key, value) => {
      if (options.failedStorage) throw new Error('Storage unavailable')
      if (key === 'textbattle.records.v1' && recordWriteFailures > 0) { recordWriteFailures--; throw new Error('Record storage unavailable') }
      metrics.writes++; storage.set(key, structuredClone(value))
      writesByKey.set(key, (writesByKey.get(key) || 0) + 1)
    },
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
  if (options.images) wx.createImage = () => {
    const image = { width: 1536, height: 1024 }; images.push(image); return image
  }
  for (const event of ['TouchStart', 'TouchMove', 'TouchEnd', 'TouchCancel', 'KeyboardConfirm', 'KeyboardComplete']) {
    listeners.set(event, new Set())
    wx['on' + event] = callback => listeners.get(event).add(callback)
    wx['off' + event] = callback => listeners.get(event).delete(callback)
  }
  if (options.keyboard) {
    wx.showKeyboard = () => {}; wx.hideKeyboard = () => {}
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
  const screen = options.screen || { width: 375, height: 667, top: 24, bottom: 16, dpr: 2 }
  const scene = load(`games/${game}/game.js`).start({ context: mainContext, screen, goHome: () => scene.dispose(),
    openGame: (...args) => opened.push(args) })
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
  function emit(type, horizontal, vertical, identifier = 1) {
    const touch = { clientX: horizontal, clientY: vertical, identifier }
    for (const listener of listeners.get('Touch' + type)) listener({ changedTouches: [touch], touches: [touch] })
  }
  const tap = rect => {
    emit('Start', rect.x + rect.w / 2, rect.y + rect.h / 2)
    emit('End', rect.x + rect.w / 2, rect.y + rect.h / 2)
  }
  const reset = () => { for (const key of Object.keys(metrics)) metrics[key] = 0; writesByKey.clear() }
  return { scene, load, screen, timers, listeners, storage, surfaces, images, mainCanvas, metrics, writesByKey, advance, emit, tap, reset, texts, opened }
}

function assertReleased(game) {
  game.scene.dispose()
  assert.equal(game.timers.size, 0)
  assert.ok([...game.listeners.values()].every(listeners => listeners.size === 0))
  assert.ok(game.surfaces.every(surface => surface.width === 1 && surface.height === 1))
  game.reset(); game.advance(2000)
  assert.deepEqual(game.metrics, { paints: 0, calls: 0, writes: 0, blits: 0 })
}

const collection = require('../games/index/order.js')
const { homeCardLayout } = require('../games/index/game.js')
const defaultOrder = collection.games.map(game => game.id)
function enterSort(game) {
  const card = homeCardLayout(game.screen).cards[0]
  game.emit('Start', card.x + 30, card.y + 30)
  game.advance(collection.longPressMs)
  assert.ok(game.texts.some(item => item.text === '排列你的游戏'))
  game.emit('End', card.x + 30, card.y + 30)
  assert.equal(game.opened.length, 0)
  return collection.sortLayout(game.screen)
}
function dragSort(game, view, from, to) {
  const first = view.rows[from]; const last = view.rows[to]
  game.emit('Start', first.x + 40, first.y + first.h / 2)
  game.emit('Move', last.x + 40, last.y + last.h / 2)
  game.emit('End', last.x + 40, last.y + last.h / 2)
}
function visibleSortNames(game) {
  return game.texts.filter(item => collection.games.some(meta => meta.name === item.text))
    .sort((a, b) => a.y - b.y).map(item => item.text)
}

test('collection normalizes old, malformed and duplicated order, appending new games', () => {
  assert.deepEqual(collection.normalizeOrder(['tetris', 'removed', 'tetris', 'klotski']),
    ['tetris', 'klotski', 'sokoban', 'driller', 'textbattle', 'office', 'bicycle', 'twentyfour', 'roadtrip'])
  for (const invalid of [null, {}, 'tetris', 0]) assert.deepEqual(collection.normalizeOrder(invalid), defaultOrder)
  const game = boot('index', { storage: [[collection.saveKey, ['tetris', 'removed', 'tetris']]] })
  const first = game.texts.find(item => item.text === '俄罗斯方块')
  game.tap({ x: first.x, y: first.y, w: 1, h: 1 })
  assert.ok(game.texts.some(item => item.text === '玩法说明'))
  assertReleased(game)
})

test('collection sorting rows and actions fit phone safe areas with equal card dimensions', () => {
  for (const [width, height, top, bottom] of [[320, 568, 24, 16], [320, 568, 64, 16], [375, 667, 24, 16], [390, 844, 47, 34]]) {
    const view = collection.sortLayout({ width, height, top, bottom })
    assert.equal(view.rows.length, collection.games.length)
    view.rows.forEach((row, index) => {
      assert.deepEqual([row.w, row.h], [view.rows[0].w, view.rows[0].h])
      assert.ok(row.x > 0 && row.x + row.w < width)
      assert.ok(row.h >= 36)
      if (index) assert.ok(row.y > view.rows[index - 1].y + row.h)
    })
    assert.ok(view.rows.at(-1).y + view.rowHeight < view.statusY - 8)
    assert.ok(view.cancel.y + view.cancel.h <= height - bottom)
    assert.ok(view.cancel.x + view.cancel.w < view.done.x)
  }
})

test('collection short tap opens details while movement cancels long press', () => {
  const game = boot('index')
  const card = homeCardLayout(game.screen).cards[0]
  game.tap(card); game.advance(1000)
  assert.ok(game.texts.some(item => item.text === '玩法说明'))
  assert.equal(game.texts.some(item => item.text === '排列你的游戏'), false)
  game.emit('Start', 60, 45); game.emit('End', 60, 45)
  game.emit('Start', 70, card.y + 70)
  game.advance(300)
  game.emit('Move', 70, card.y + 40)
  game.advance(1000)
  assert.equal(game.texts.some(item => item.text === '排列你的游戏'), false)
  game.emit('End', 70, card.y + 40)
  assert.equal(game.timers.size, 0)
  assert.ok(game.texts.some(item => item.text === '童 年 游 戏 馆'))
  assertReleased(game)
})

test('collection long press, drag in both directions, save and restart preserve detail routing', () => {
  const game = boot('index')
  const view = enterSort(game)
  assert.equal(game.timers.size, 0)
  dragSort(game, view, 4, 0)
  assert.deepEqual(visibleSortNames(game), ['文字对战', '华容道', '推箱子', '俄罗斯方块', '钻地挑战', '办公室投篮', '自行车大冒险', '算 24 点', '滴滴叭叭'])
  dragSort(game, view, 0, 2)
  assert.deepEqual(visibleSortNames(game), ['华容道', '推箱子', '文字对战', '俄罗斯方块', '钻地挑战', '办公室投篮', '自行车大冒险', '算 24 点', '滴滴叭叭'])
  dragSort(game, view, 3, 0)
  game.tap(view.done)
  const expected = ['tetris', 'klotski', 'sokoban', 'textbattle', 'driller', 'office', 'bicycle', 'twentyfour', 'roadtrip']
  assert.deepEqual(structuredClone(game.storage.get(collection.saveKey)), expected)
  assertReleased(game)
  const restarted = boot('index', { storage: [...game.storage] })
  const first = homeCardLayout(restarted.screen).cards[0]
  assert.equal(restarted.texts.find(item => item.text === '俄罗斯方块').y, first.y + 51)
  restarted.tap(first)
  assert.ok(restarted.texts.some(item => item.text === '玩法说明'))
  const enter = restarted.texts.find(item => item.text.includes('进入游戏'))
  restarted.emit('Start', enter.x, enter.y); restarted.emit('End', enter.x, enter.y)
  assert.deepEqual(restarted.opened, [['tetris']])
  assertReleased(restarted)
})

test('collection cancel abandons draft without writing storage or changing home order', () => {
  const game = boot('index')
  const view = enterSort(game)
  dragSort(game, view, 0, 4)
  game.tap(view.cancel)
  assert.equal(game.storage.has(collection.saveKey), false)
  const first = game.texts.find(item => item.text === '华容道')
  assert.equal(first.y, homeCardLayout(game.screen).cards[0].y + 51)
  assertReleased(game)
})

test('collection cancelled drag reverts only that gesture and ignores unrelated fingers', () => {
  const game = boot('index')
  const view = enterSort(game)
  dragSort(game, view, 4, 0)
  const before = visibleSortNames(game)
  const first = view.rows[0]; const last = view.rows[4]
  game.emit('Start', 70, first.y + first.h / 2)
  game.emit('Move', 70, last.y + last.h / 2, 2)
  game.emit('Cancel', 70, last.y + last.h / 2, 2)
  game.emit('End', 70, last.y + last.h / 2, 2)
  game.advance(16)
  game.emit('Move', 70, last.y + last.h / 2)
  game.advance(16)
  game.emit('Cancel', 70, last.y + last.h / 2)
  assert.deepEqual(visibleSortNames(game), before)
  assert.equal(game.timers.size, 0)
  game.tap(view.done)
  assert.equal(game.storage.get(collection.saveKey)[0], 'textbattle')
  assertReleased(game)
})

test('collection drag clamps to ends, coalesces touch moves and stays idle after release', () => {
  const game = boot('index')
  const view = enterSort(game)
  const first = view.rows[0]
  game.emit('Start', 70, first.y + first.h / 2)
  game.reset()
  for (let y = first.y; y < 900; y += 5) game.emit('Move', 70, y)
  assert.equal(game.timers.size, 1)
  assert.equal(game.metrics.paints, 0)
  game.advance(16)
  assert.equal(game.metrics.paints, 1)
  game.emit('End', 70, 900)
  assert.equal(visibleSortNames(game).at(-1), '华容道')
  const last = view.rows.at(-1)
  game.emit('Start', 70, last.y + last.h / 2)
  game.emit('End', 70, -100)
  assert.equal(visibleSortNames(game)[0], '华容道')
  game.reset(); game.advance(5000)
  assert.equal(game.timers.size, 0); assert.equal(game.metrics.paints, 0)
  assertReleased(game)
})

test('collection hide, resize, touch cancel and dispose release pending long presses and drags', () => {
  for (const operation of ['hide', 'resize', 'cancel', 'dispose']) {
    const game = boot('index')
    game.emit('Start', 70, 200)
    if (operation === 'resize') game.scene.resize({ ...game.screen, width: 390, height: 844 })
    else if (operation === 'cancel') game.emit('Cancel', 70, 200)
    else game.scene[operation]()
    game.advance(2000)
    assert.equal(game.timers.size, 0)
    assert.equal(game.texts.some(item => item.text === '排列你的游戏'), false)
    assertReleased(game)
  }
  const game = boot('index')
  const view = enterSort(game)
  game.emit('Start', 70, view.rows[0].y + 30)
  game.emit('Move', 70, view.rows[4].y + 30)
  game.scene.hide(); game.scene.show()
  assert.deepEqual(visibleSortNames(game), collection.games.map(meta => meta.name))
  assertReleased(game)
})

test('collection failed save retains editable draft and retry persists the requested order', () => {
  const options = { failedStorage: true }
  const game = boot('index', options)
  const view = enterSort(game)
  dragSort(game, view, 4, 0)
  game.tap(view.done)
  assert.ok(game.texts.some(item => item.text === '保存失败，请重试或取消'))
  assert.equal(game.storage.has(collection.saveKey), false)
  assert.equal(visibleSortNames(game)[0], '文字对战')
  options.failedStorage = false
  game.tap(view.done)
  assert.equal(game.storage.get(collection.saveKey)[0], 'textbattle')
  assertReleased(game)
})

function nameControls(game) {
  const { layout, nameControls } = game.load('games/textbattle/layout.js')
  const name = game.storage.get('textbattle.v5').player.name
  return nameControls(layout(game.screen), name)
}

test('text battle preparation is idle, combat has one scheduler, and pause/hide release it', () => {
  const game = boot('textbattle')
  const view = game.load('games/textbattle/layout.js').layout(game.screen)
  const rules = game.load('games/textbattle/rules.js')
  game.reset(); game.advance(5000)
  assert.equal(game.metrics.paints, 0); assert.equal(game.timers.size, 0)
  game.tap(view.action); assert.equal(game.timers.size, 1)
  game.advance(2300); game.tap(view.pause)
  const paused = structuredClone(game.storage.get(rules.saveKey))
  assert.ok(paused.elapsedMs >= 2300 - .000001); assert.ok(paused.logs.length > 0)
  game.reset(); game.advance(5000)
  assert.equal(game.timers.size, 0); assert.equal(game.metrics.paints, 0)
  game.tap(view.modalPrimary); assert.equal(game.timers.size, 1)
  game.advance(1100); game.scene.hide()
  const hidden = structuredClone(game.storage.get(rules.saveKey))
  game.reset(); game.advance(5000); game.scene.show()
  assert.equal(game.timers.size, 0)
  assert.deepEqual(game.storage.get(rules.saveKey), hidden)
  assert.ok(hidden.elapsedMs > paused.elapsedMs)
  assertReleased(game)
})

test('text battle restores live health and cooldowns, then waits for explicit resume', () => {
  const rules = require('../games/textbattle/rules.js')
  const state = rules.initialState(36); rules.startFight(state); rules.tick(state, 3500)
  const game = boot('textbattle', { storage: [[rules.saveKey, rules.snapshot(state)]] })
  const view = game.load('games/textbattle/layout.js').layout(game.screen)
  assert.deepEqual(game.storage.get(rules.saveKey), state)
  game.advance(5000); assert.equal(game.timers.size, 0)
  game.tap(view.modalPrimary); game.advance(600)
  game.scene.hide()
  const saved = game.storage.get(rules.saveKey)
  assert.ok(Math.abs(saved.elapsedMs - state.elapsedMs - 600) < 1e-7,
    `Resuming for 600ms must advance exactly 600ms: ${saved.elapsedMs - state.elapsedMs}`)
  const expected = rules.snapshot(state); rules.tick(expected, 600)
  assert.equal(saved.player.hp, expected.player.hp); assert.equal(saved.enemy.hp, expected.enemy.hp)
  assert.equal(saved.rng, expected.rng)
  assertReleased(game)
})

test('text battle inline pause and log drag freeze combat until the main button resumes it', () => {
  const rules = require('../games/textbattle/rules.js')
  const initial = rules.initialState(36)
  const game = boot('textbattle', { storage: [[rules.saveKey, rules.snapshot(initial)]] })
  const view = game.load('games/textbattle/layout.js').layout(game.screen)
  game.tap(view.action); game.advance(1200); game.tap(view.action)
  const paused = structuredClone(game.storage.get(rules.saveKey))
  assert.equal(game.timers.size, 0)
  game.reset(); game.advance(5000)
  assert.equal(game.metrics.paints, 0)
  assert.deepEqual(game.storage.get(rules.saveKey), paused)
  game.tap(view.action); assert.equal(game.timers.size, 1)
  game.advance(800)
  game.emit('Start', view.log.x + 30, view.log.y + 16)
  game.emit('Move', view.log.x + 30, view.log.y + 116)
  game.emit('End', view.log.x + 30, view.log.y + 116)
  const reviewing = structuredClone(game.storage.get(rules.saveKey))
  assert.equal(game.timers.size, 0)
  assert.ok(Math.abs(reviewing.elapsedMs - 2000) < .000001)
  game.reset(); game.advance(5000)
  assert.equal(game.metrics.paints, 0)
  assert.deepEqual(game.storage.get(rules.saveKey), reviewing)
  game.tap(view.action); assert.equal(game.timers.size, 1)
  game.advance(500); game.tap(view.action)
  const expected = rules.snapshot(initial); rules.startFight(expected); rules.tick(expected, 2500)
  const actual = game.storage.get(rules.saveKey)
  assert.deepEqual(actual.logs, expected.logs)
  assert.equal(actual.player.hp, expected.player.hp); assert.equal(actual.enemy.hp, expected.enemy.hp)
  assert.equal(actual.rng, expected.rng)
  assertReleased(game)
})

test('text battle loads legacy progress once and prioritizes the new save on later starts', () => {
  const rules = require('../games/textbattle/rules.js')
  const legacy = require('./fixtures/textbattle-v1.json')
  const game = boot('textbattle', { storage: [[rules.legacySaveKey, structuredClone(legacy)]] })
  const migrated = game.storage.get(rules.saveKey)
  assert.equal(migrated.version, 5); assert.equal(migrated.player.hp, legacy.player.hp)
  assert.deepEqual(game.storage.get(rules.legacySaveKey), legacy)
  assert.equal(game.timers.size, 0)
  assertReleased(game)
  const fresh = rules.initialState(79); rules.configure(fresh, 'weapon', 'spear')
  const current = boot('textbattle', { storage: [[rules.legacySaveKey, legacy], [rules.saveKey, fresh]] })
  assert.equal(current.storage.get(rules.saveKey).runId, fresh.runId)
  assert.equal(current.storage.get(rules.saveKey).weapon, 'spear')
  assertReleased(current)
})

test('slow text battle weapons retain elapsed time and exact attacks across sleeping scheduler intervals', () => {
  const rules = require('../games/textbattle/rules.js')
  const initial = rules.initialState(3); rules.configure(initial, 'weapon', 'saber')
  assert.ok(Math.min(initial.player.cooldown, initial.enemy.cooldown) > 1000)
  const game = boot('textbattle', { storage: [[rules.saveKey, initial]] })
  const view = game.load('games/textbattle/layout.js').layout(game.screen)
  game.tap(view.action); game.advance(1500); game.tap(view.pause)
  const expected = rules.snapshot(initial); rules.startFight(expected); rules.tick(expected, 1500)
  const actual = game.storage.get(rules.saveKey)
  assert.ok(Math.abs(actual.elapsedMs - 1500) < .000001)
  assert.deepEqual(actual.logs, expected.logs)
  assert.equal(actual.player.hp, expected.player.hp); assert.equal(actual.enemy.hp, expected.enemy.hp)
  assertReleased(game)
})

test('text battle saves victory immediately, advances to full health and keeps one series record', () => {
  const rules = require('../games/textbattle/rules.js')
  const state = rules.initialState(10); rules.startFight(state)
  state.enemy.hp = 1; state.player.cooldown = 0
  const game = boot('textbattle', { storage: [[rules.saveKey, rules.snapshot(state)]] })
  const view = game.load('games/textbattle/layout.js').layout(game.screen)
  game.tap(view.modalPrimary); game.advance(2500)
  assert.equal(game.storage.get(rules.saveKey).status, 'won')
  assert.equal(game.storage.get(rules.bestKey)[0].streak, 1)
  assert.equal(game.timers.size, 0)
  game.tap(view.modalSecondary)
  const finished = structuredClone(game.storage.get(rules.saveKey))
  game.tap(view.modalPrimary) // The old popup button must be inactive on the main screen.
  game.advance(5000)
  assert.deepEqual(game.storage.get(rules.saveKey), finished)
  assert.equal(game.timers.size, 0)
  game.tap(view.action); game.tap(view.modalPrimary)
  assert.equal(game.storage.get(rules.saveKey).progression.pending, true)
  game.tap(view.growthCards[0]); game.tap(view.growthConfirm)
  const next = game.storage.get(rules.saveKey)
  assert.equal(next.round, 2); assert.equal(next.status, 'prepare')
  assert.equal(next.player.hp, next.player.stats.maxHp)
  assert.equal(game.storage.get(rules.bestKey).length, 1)
  assert.ok(game.texts.some(item => item.text === '武器 · 本轮已锁定'))
  game.reset()
  for (const weapon of view.weapons) game.tap(weapon)
  assert.deepEqual(game.storage.get(rules.saveKey), next)
  assert.equal(game.metrics.writes, 0)
  game.tap(view.stances[2])
  assert.equal(game.storage.get(rules.saveKey).stance, 'agile')
  assert.equal(game.storage.get(rules.saveKey).weapon, next.weapon)
  const progress = structuredClone(game.storage.get(rules.saveKey))
  assertReleased(game)
  const resumed = boot('textbattle', { storage: [[rules.saveKey, progress]] })
  resumed.tap(view.weapons[4])
  assert.equal(resumed.storage.get(rules.saveKey).weapon, next.weapon)
  resumed.tap(view.pause); resumed.tap(view.modalPrimary); resumed.tap(view.modalPrimary)
  assert.equal(resumed.storage.get(rules.saveKey).round, 1)
  assert.ok(resumed.texts.some(item => item.text === '武器 · 首战可选择'))
  resumed.tap(view.weapons[4])
  assert.equal(resumed.storage.get(rules.saveKey).weapon, 'axe')
  assertReleased(resumed)
})

test('preparation explains each selected weapon, preserves stance text and stays idle', () => {
  for (const screen of [{ width: 320, height: 568, top: 24, bottom: 16, dpr: 2 }, { width: 375, height: 667, top: 24, bottom: 16, dpr: 2 }]) {
    const game = boot('textbattle', { screen })
    const rules = game.load('games/textbattle/rules.js')
    const view = game.load('games/textbattle/layout.js').layout(screen, true)
    for (const [index, weapon] of rules.weapons.entries()) {
      const before = game.storage.get(rules.saveKey).rng
      game.tap(view.weapons[index])
      const ability = rules.weaponSkill(weapon.id)
      assert.equal(game.storage.get(rules.saveKey).weapon, weapon.id)
      assert.equal(game.storage.get(rules.saveKey).rng, before)
      assert.ok(game.texts.some(item => item.text === `${ability.name} · 武势满100自动触发` && item.y > view.log.y))
      assert.ok(game.texts.some(item => item.text === ability.description && item.y > view.log.y))
      assert.ok(game.texts.some(item => item.text.startsWith('守御：') && item.y + 6 < view.action.y))
      assert.equal(game.timers.size, 0)
    }
    game.tap(view.stances[2])
    assert.ok(game.texts.some(item => item.text.startsWith('游斗：')))
    assert.ok(game.texts.some(item => item.text === rules.weaponSkill('halberd').description))
    game.tap(view.action); game.advance(1000); game.scene.hide()
    assert.equal(game.storage.get(rules.saveKey).status, 'fighting')
    assertReleased(game)
  }
})

test('weapon skills and momentum guide are read-only, pause combat and never add schedulers', () => {
  const game = boot('textbattle')
  const rules = game.load('games/textbattle/rules.js')
  const view = game.load('games/textbattle/layout.js').layout(game.screen)
  const initial = structuredClone(game.storage.get(rules.saveKey))
  assert.equal(view.guideTabs.length, 3)
  assert.ok(!game.texts.some(item => /克制|图谱/.test(item.text)))
  game.tap(view.tactics); game.tap(view.guideTabs[2])
  assert.ok(game.texts.some(item => item.text === '武势上限100，双方使用同一规则'))
  assert.ok(!game.texts.some(item => /克制|图谱/.test(item.text)))
  assert.deepEqual(game.storage.get(rules.saveKey), initial)
  assert.equal(game.timers.size, 0)
  game.tap(view.guidePrimary); game.tap(view.weapons[5])
  assert.equal(game.storage.get(rules.saveKey).weapon, 'halberd')
  assert.equal(game.storage.get(rules.saveKey).skill, undefined)
  game.tap(view.action); game.advance(1100); assert.equal(game.timers.size, 1)
  game.tap(view.tactics)
  const paused = structuredClone(game.storage.get(rules.saveKey))
  game.tap(view.guideTabs[0]); game.tap(view.guideTabs[2])
  assert.ok(game.texts.some(item => item.text === '武势上限100，双方使用同一规则'))
  game.tap(view.guideTabs[1]); game.advance(5000)
  assert.deepEqual(game.storage.get(rules.saveKey), paused); assert.equal(game.timers.size, 0)
  game.tap(view.guidePrimary); assert.equal(game.timers.size, 1)
  game.tap(view.weapons[0]); assert.equal(game.storage.get(rules.saveKey).weapon, 'halberd')
  assertReleased(game)
})

test('late uncapped rewards keep three touch targets, confirm once and leave no scheduler', () => {
  const rules = require('../games/textbattle/rules.js')
  const state = rules.initialState(37)
  for (let round = 1; round < 100; round++) {
    state.status = 'won'; state.enemy.hp = 0; state.streak = state.round; rules.nextRound(state)
    const choices = rules.upgradeChoices(state)
    const chosen = choices.find(c => c.id !== 'atk') || choices[0]
    if (round < 99) rules.chooseUpgrade(state, chosen.id)
  }
  assert.equal(rules.upgradeChoices(state).length, 3)
  const game = boot('textbattle', { storage: [[rules.saveKey, rules.snapshot(state)]] })
  const view = game.load('games/textbattle/layout.js').layout(game.screen)
  const before = structuredClone(game.storage.get(rules.saveKey))
  game.tap(view.growthConfirm)
  assert.deepEqual(game.storage.get(rules.saveKey), before)
  game.tap(view.growthCards[1])
  assert.deepEqual(game.storage.get(rules.saveKey), before)
  assert.ok(game.texts.some(item => item.text === '已选中 ✓'))
  game.tap(view.growthConfirm)
  const chosen = rules.upgradeChoices(before)[1]
  const after = structuredClone(game.storage.get(rules.saveKey))
  assert.equal(after.progression.pending, false); assert.equal(after.progression.counts[chosen.id], before.progression.counts[chosen.id] + 1)
  assert.deepEqual(after.player.stats, rules.upgradePreview(before, chosen.id))
  game.tap(view.growthConfirm)
  assert.deepEqual(game.storage.get(rules.saveKey), after)
  assert.ok(rules.restore(after)); assert.equal(game.timers.size, 0)
  assertReleased(game)
})
test('upgrade selection is a reversible preview; only a separate confirmation applies the latest choice once', () => {
  const rules = require('../games/textbattle/rules.js')
  const state = rules.initialState(73)
  state.status = 'won'; state.enemy.hp = 0; state.streak = 1; rules.nextRound(state)
  const game = boot('textbattle', { storage: [[rules.saveKey, rules.snapshot(state)]] })
  const view = game.load('games/textbattle/layout.js').layout(game.screen)
  const before = structuredClone(game.storage.get(rules.saveKey))
  game.reset(); game.tap(view.growthConfirm)
  assert.equal(game.metrics.writes, 0)
  game.tap(view.growthCards[0]); game.tap(view.growthCards[0]); game.tap(view.growthCards[2])
  assert.deepEqual(game.storage.get(rules.saveKey), before)
  assert.equal(game.metrics.writes, 0); assert.equal(game.timers.size, 0)
  assert.ok(game.texts.some(item => item.text === '已选中 ✓'))
  game.scene.hide(); game.scene.show(); game.scene.resize(game.screen)
  assert.deepEqual(game.storage.get(rules.saveKey), before)
  const chosen = rules.upgradeChoices(before)[2]
  const expected = rules.upgradePreview(before, chosen.id)
  game.tap(view.growthConfirm)
  const after = structuredClone(game.storage.get(rules.saveKey))
  assert.deepEqual(after.player.stats, expected)
  assert.equal(after.progression.pending, false); assert.equal(after.progression.counts[chosen.id], 1)
  assert.equal(after.rng, before.rng)
  game.reset(); game.tap(view.growthConfirm)
  assert.deepEqual(game.storage.get(rules.saveKey), after); assert.equal(game.metrics.writes, 0)
  assertReleased(game)
})

test('pending growth survives hide, exit and reload, blocks controls and can be claimed only once', () => {
  const rules = require('../games/textbattle/rules.js')
  const state = rules.initialState(73)
  state.status = 'won'; state.enemy.hp = 0; state.streak = 1; rules.nextRound(state)
  const game = boot('textbattle', { storage: [[rules.saveKey, rules.snapshot(state)]] })
  const view = game.load('games/textbattle/layout.js').layout(game.screen)
  const original = structuredClone(game.storage.get(rules.saveKey))
  assert.ok(game.texts.some(item => item.text === '胜战修行'))
  game.tap(view.action); game.tap(view.info); game.tap(view.home)
  assert.deepEqual(game.storage.get(rules.saveKey), original)
  game.scene.hide(); game.advance(10000); game.scene.show()
  assert.deepEqual(game.storage.get(rules.saveKey), original); assert.equal(game.timers.size, 0)
  game.tap(view.growthRestart); game.tap(view.modalSecondary)
  assert.ok(game.texts.some(item => item.text === '胜战修行'))
  assert.deepEqual(game.storage.get(rules.saveKey), original)
  game.tap(view.growthCards[1]); game.tap(view.growthHome)
  assert.equal(game.timers.size, 0)
  const saved = structuredClone(game.storage.get(rules.saveKey))
  const resumed = boot('textbattle', { storage: [[rules.saveKey, saved]] })
  assert.ok(resumed.texts.some(item => item.text === '胜战修行'))
  const id = rules.upgradeChoices(saved)[0].id
  resumed.tap(view.growthConfirm)
  assert.deepEqual(resumed.storage.get(rules.saveKey), saved) // Preview selection is not persisted or implicitly claimed.
  resumed.tap(view.growthCards[0]); resumed.tap(view.growthConfirm)
  const after = resumed.storage.get(rules.saveKey)
  assert.equal(after.progression.counts[id], 1); assert.equal(after.progression.pending, false)
  resumed.tap(view.growthCards[0]) // Repeat touch cannot collect the reward again.
  assert.equal(resumed.storage.get(rules.saveKey).progression.counts[id], 1)
  resumed.tap(view.action); assert.equal(resumed.storage.get(rules.saveKey).status, 'fighting')
  assertReleased(resumed)
  const reset = boot('textbattle', { storage: [[rules.saveKey, saved]] })
  reset.tap(view.growthRestart); reset.tap(view.modalPrimary)
  assert.equal(reset.storage.get(rules.saveKey).round, 1)
  assert.equal(reset.storage.get(rules.saveKey).progression.pending, false)
  assertReleased(reset)
})

test('combat animations repaint local regions, keep one scheduler, and sleep between attacks', () => {
  const rules = require('../games/textbattle/rules.js')
  const initial = rules.initialState(3); rules.configure(initial, 'weapon', 'saber'); rules.startFight(initial)
  initial.player.cooldown = 10
  const game = boot('textbattle', { images: true, storage: [[rules.saveKey, rules.snapshot(initial)]] })
  game.images[0].onload()
  const view = game.load('games/textbattle/layout.js').layout(game.screen)
  game.tap(view.modalPrimary); game.advance(10)
  game.reset(); game.advance(200)
  assert.equal(game.timers.size, 1)
  assert.equal(game.metrics.paints, 0, 'Animation frames must not clear and rebuild the full page')
  assert.ok(game.metrics.blits >= 10 && game.metrics.blits <= 14, 'Only two fighters are blitted at 30fps')
  assert.equal(game.metrics.writes, 0, 'Presentation frames do not save progress')
  game.advance(600)
  game.reset(); game.advance(150)
  assert.equal(game.metrics.calls, 0, 'Completed effects leave the renderer idle until the next attack')
  game.tap(view.pause)
  const actual = game.storage.get(rules.saveKey)
  const expected = rules.snapshot(initial); rules.tick(expected, 960)
  assert.deepEqual(actual.logs, expected.logs)
  assert.equal(actual.rng, expected.rng)
  assert.equal(actual.player.combat.momentum, expected.player.combat.momentum)
  assert.equal(game.timers.size, 0)
  assertReleased(game)
})

test('normal attacks update combat regions without rebuilding static controls or rewriting unchanged records', () => {
  const rules = require('../games/textbattle/rules.js')
  const initial = rules.initialState(3); rules.startFight(initial)
  const game = boot('textbattle', { storage: [[rules.saveKey, rules.snapshot(initial)]] })
  const view = game.load('games/textbattle/layout.js').layout(game.screen)
  game.tap(view.modalPrimary); game.reset(); game.advance(5000)
  assert.equal(game.metrics.paints, 0, 'Ordinary attacks must not clear the full canvas')
  assert.ok(game.writesByKey.get(rules.saveKey) > 0, 'Combat still autosaves')
  assert.equal(game.writesByKey.get(rules.bestKey) || 0, 0, 'Records remain unchanged during combat')
  game.scene.hide()
  const actual = game.storage.get(rules.saveKey)
  const expected = rules.snapshot(initial); rules.tick(expected, 5000)
  assert.ok(Math.abs(actual.elapsedMs - expected.elapsedMs) < 1e-7)
  expected.elapsedMs = actual.elapsedMs
  for (const side of ['player', 'enemy']) {
    assert.ok(Math.abs(actual[side].cooldown - expected[side].cooldown) < 1e-7)
    expected[side].cooldown = actual[side].cooldown
  }
  assert.deepEqual(actual, expected, 'Rendering optimization cannot change combat or RNG')
  assertReleased(game)
})

test('unchanged records are not rewritten and failed victory record writes retry on the next save', () => {
  const rules = require('../games/textbattle/rules.js')
  const initial = rules.initialState(10); rules.startFight(initial)
  initial.enemy.hp = 1; initial.player.cooldown = 0
  const game = boot('textbattle', { recordWriteFailures: 1, storage: [[rules.saveKey, rules.snapshot(initial)]] })
  const view = game.load('games/textbattle/layout.js').layout(game.screen)
  game.tap(view.modalPrimary); game.advance(1)
  assert.equal(game.storage.get(rules.saveKey).status, 'won')
  assert.equal(game.storage.has(rules.bestKey), false)
  assert.ok(game.texts.some(item => item.text.includes('存档失败')))
  game.scene.hide()
  assert.equal(game.storage.get(rules.bestKey)[0].streak, 1)
  assert.equal(game.writesByKey.get(rules.bestKey), 1)
  game.reset(); game.scene.show(); game.scene.hide()
  assert.equal(game.writesByKey.get(rules.bestKey) || 0, 0)
  assertReleased(game)
})

test('settled momentum strips stop drawing while hit labels continue animating', () => {
  const rules = require('../games/textbattle/rules.js')
  const initial = rules.initialState(3); rules.startFight(initial); initial.player.cooldown = 10
  const game = boot('textbattle', { storage: [[rules.saveKey, rules.snapshot(initial)]] })
  const view = game.load('games/textbattle/layout.js').layout(game.screen)
  game.tap(view.modalPrimary); game.advance(400)
  const before = game.texts.length
  game.reset(); game.advance(150)
  assert.ok(game.metrics.calls > 0, 'Hit labels are still animated')
  assert.ok(!game.texts.slice(before).some(item => item.text.startsWith('武势 ')), 'Settled meters must not be repainted')
  assert.equal(game.metrics.paints, 0); assert.equal(game.metrics.writes, 0)
  assertReleased(game)
})

test('last-hit feedback saves victory immediately, ends promptly and cannot keep rendering in the background', () => {
  const rules = require('../games/textbattle/rules.js')
  for (const interrupt of [false, true]) {
    const initial = rules.initialState(10); rules.startFight(initial)
    initial.enemy.hp = 1; initial.player.cooldown = 0
    const game = boot('textbattle', { storage: [[rules.saveKey, rules.snapshot(initial)]] })
    const view = game.load('games/textbattle/layout.js').layout(game.screen)
    game.tap(view.modalPrimary); game.advance(1)
    assert.equal(game.storage.get(rules.saveKey).status, 'won')
    assert.equal(game.storage.get(rules.bestKey)[0].streak, 1)
    assert.equal(game.timers.size, 1)
    if (interrupt) game.scene.hide()
    else {
      game.advance(410)
      assert.ok(game.texts.some(item => item.text === '此战告捷'))
    }
    assert.equal(game.timers.size, 0)
    game.reset(); game.advance(3000)
    assert.equal(game.metrics.calls, 0); assert.equal(game.metrics.writes, 0)
    assertReleased(game)
  }
})

test('both momentum meters restore precisely, stay frozen while paused and spend charge on resume', () => {
  const rules = require('../games/textbattle/rules.js')
  const initial = rules.initialState(42); rules.startFight(initial)
  initial.player.combat.momentum = rules.momentum.max; initial.enemy.combat.momentum = 1234
  const game = boot('textbattle', { storage: [[rules.saveKey, rules.snapshot(initial)]] })
  const view = game.load('games/textbattle/layout.js').layout(game.screen)
  assert.ok(game.texts.some(item => item.text === '武势 待发'))
  assert.ok(game.texts.some(item => item.text === '武势 12'))
  game.advance(5000)
  assert.deepEqual(game.storage.get(rules.saveKey), initial)
  assert.equal(game.timers.size, 0)
  game.tap(view.modalPrimary); game.advance(1500); game.tap(view.pause)
  const paused = game.storage.get(rules.saveKey)
  assert.ok(paused.logs.some(event => event.side === 'player' && event.skill === rules.weaponSkill(initial.weapon).id))
  assert.ok(paused.player.combat.momentum < rules.momentum.max)
  assert.equal(game.timers.size, 0)
  const persisted = structuredClone(paused)
  game.advance(5000)
  assert.deepEqual(game.storage.get(rules.saveKey), persisted)
  assertReleased(game)
})

test('restart confirmation preserves later-round progress on cancel, then resets the challenge and unlocks weapons', () => {
  const rules = require('../games/textbattle/rules.js')
  const state = rules.initialState(10); rules.startFight(state)
  state.enemy.hp = 1; state.player.cooldown = 0
  rules.tick(state, 1)
  assert.equal(state.status, 'won')
  rules.nextRound(state)
  rules.chooseUpgrade(state, rules.upgradeChoices(state)[0].id)
  const game = boot('textbattle', { storage: [[rules.saveKey, rules.snapshot(state)],
    [rules.bestKey, [{ runId: state.runId, name: state.player.name, streak: 1 }]]] })
  const view = game.load('games/textbattle/layout.js').layout(game.screen)
  const before = structuredClone(game.storage.get(rules.saveKey))
  const records = structuredClone(game.storage.get(rules.bestKey))
  game.tap(view.restart)
  assert.ok(game.texts.some(item => item.text === '重新开始挑战？'))
  assert.deepEqual(game.storage.get(rules.saveKey), before)
  game.advance(5000); assert.equal(game.timers.size, 0)
  game.tap(view.weapons[4]) // Confirmation blocks controls beneath it.
  assert.deepEqual(game.storage.get(rules.saveKey), before)
  game.tap(view.modalSecondary)
  assert.deepEqual(game.storage.get(rules.saveKey), before)
  assert.ok(game.texts.some(item => item.text === '武器 · 本轮已锁定'))
  game.tap(view.restart); game.tap(view.modalPrimary)
  const fresh = game.storage.get(rules.saveKey)
  assert.equal(fresh.status, 'prepare'); assert.equal(fresh.round, 1); assert.equal(fresh.streak, 0)
  assert.equal(fresh.elapsedMs, 0); assert.equal(fresh.logs.length, 0)
  assert.equal(fresh.player.hp, fresh.player.stats.maxHp); assert.equal(fresh.enemy.hp, fresh.enemy.stats.maxHp)
  assert.equal(fresh.player.combat.attacks, 0); assert.equal(fresh.enemy.combat.attacks, 0)
  assert.equal(game.timers.size, 0)
  assert.deepEqual(game.storage.get(rules.bestKey), records)
  game.tap(view.weapons[4]); assert.equal(game.storage.get(rules.saveKey).weapon, 'axe')
  assertReleased(game)
})

test('restart during combat cancels the scheduler and cancelling waits for explicit resume', () => {
  const game = boot('textbattle')
  const rules = game.load('games/textbattle/rules.js')
  const view = game.load('games/textbattle/layout.js').layout(game.screen)
  game.tap(view.action); game.advance(1100); game.tap(view.restart)
  assert.ok(game.texts.some(item => item.text === '重新开始挑战？'))
  const paused = structuredClone(game.storage.get(rules.saveKey))
  assert.equal(paused.status, 'fighting'); assert.ok(paused.elapsedMs >= 1100)
  game.advance(5000); assert.equal(game.timers.size, 0)
  assert.deepEqual(game.storage.get(rules.saveKey), paused)
  game.tap(view.modalSecondary)
  assert.ok(game.texts.some(item => item.text === '交战已暂停'))
  assert.equal(game.timers.size, 0)
  game.tap(view.modalPrimary); game.advance(1000)
  game.tap(view.restart); game.tap(view.modalPrimary)
  assert.equal(game.storage.get(rules.saveKey).status, 'prepare')
  game.reset(); game.advance(5000)
  assert.equal(game.metrics.paints, 0); assert.equal(game.timers.size, 0)
  assertReleased(game)
})

test('restart is available after inspecting victory or defeat and preserves saved records', () => {
  const rules = require('../games/textbattle/rules.js')
  for (const winner of ['player', 'enemy']) {
    const state = rules.initialState(10); rules.startFight(state)
    const target = winner === 'player' ? 'enemy' : 'player'
    state[target].hp = 1; state[target].stats.dodge = 0
    state[winner].cooldown = 0; state[target].cooldown = 500
    rules.tick(state, 1)
    // Return the manipulated test dodge value to the valid stored stat value.
    state[target].stats = rules.stats(state[target].base, target === 'player' ? state.weapon : state.enemy.weapon,
      target === 'player' ? state.stance : 'strong', target === 'enemy' ? true : null, state.round)
    assert.ok(rules.restore(rules.snapshot(state)))
    const game = boot('textbattle', { storage: [[rules.saveKey, rules.snapshot(state)]] })
    const view = game.load('games/textbattle/layout.js').layout(game.screen)
    const records = structuredClone(game.storage.get(rules.bestKey))
    game.tap(view.modalSecondary); game.tap(view.restart); game.tap(view.modalPrimary)
    assert.equal(game.storage.get(rules.saveKey).round, 1)
    assert.equal(game.storage.get(rules.saveKey).status, 'prepare')
    assert.deepEqual(game.storage.get(rules.bestKey), records)
    assertReleased(game)
  }
})

test('the new save migrates old progress without deleting the previous save or changing a live battle', () => {
  const rules = require('../games/textbattle/rules.js')
  const legacy = require('./fixtures/textbattle-v2-hammer.json')
  const game = boot('textbattle', { storage: [[rules.previousSaveKey, structuredClone(legacy)]] })
  const migrated = game.storage.get(rules.saveKey)
  assert.equal(migrated.combatVersion, 1)
  assert.equal(migrated.rng, legacy.rng); assert.equal(migrated.player.hp, legacy.player.hp)
  assert.equal(game.timers.size, 0)
  assert.deepEqual(game.storage.get(rules.previousSaveKey), legacy)
  assertReleased(game)
})

test('text battle remains playable when storage is unavailable', () => {
  const game = boot('textbattle', { failedStorage: true })
  const view = game.load('games/textbattle/layout.js').layout(game.screen)
  game.tap(view.action); game.advance(2000)
  assert.ok(game.metrics.paints > 1)
  assertReleased(game)
})

test('text battle native name editing validates input and ignores late callbacks after hide/dispose', () => {
  const game = boot('textbattle', { keyboard: true })
  const view = game.load('games/textbattle/layout.js').layout(game.screen)
  const key = game.load('games/textbattle/rules.js').saveKey
  const confirm = value => { for (const callback of game.listeners.get('KeyboardConfirm')) callback({ value }) }
  game.tap(nameControls(game).name); confirm('  江湖第一剑客长名字  ')
  assert.equal(game.storage.get(key).player.name, '江湖第一剑客长名')
  game.tap(nameControls(game).name)
  for (const callback of game.listeners.get('KeyboardComplete')) callback({ value: '不提交' })
  confirm('不得覆盖'); assert.equal(game.storage.get(key).player.name, '江湖第一剑客长名')
  game.tap(nameControls(game).name); game.scene.hide(); confirm('后台回调')
  assert.equal(game.storage.get(key).player.name, '江湖第一剑客长名')
  assertReleased(game)
})

test('random name button saves name and gender without changing combat, and locks when fighting', () => {
  const game = boot('textbattle', { keyboard: true })
  const view = game.load('games/textbattle/layout.js').layout(game.screen)
  const key = game.load('games/textbattle/rules.js').saveKey
  const before = structuredClone(game.storage.get(key))
  game.tap(nameControls(game).name); game.tap(nameControls(game).randomName)
  const after = game.storage.get(key)
  assert.notEqual(after.player.name, before.player.name)
  assert.ok(['male', 'female'].includes(after.player.gender))
  assert.deepEqual({ ...after, player: { ...after.player, name: before.player.name, gender: before.player.gender } }, before)
  for (const callback of game.listeners.get('KeyboardConfirm')) callback({ value: '迟到回调' })
  assert.equal(game.storage.get(key).player.name, after.player.name)
  assert.equal(game.storage.get(key).player.gender, after.player.gender)
  game.tap(view.action); game.tap(nameControls(game).randomName); game.scene.hide()
  assert.equal(game.storage.get(key).player.name, after.player.name)
  assertReleased(game)
})

test('random names avoid recent surnames after reload and keyboard fallback leaves combat RNG intact', () => {
  const game = boot('textbattle')
  const view = game.load('games/textbattle/layout.js').layout(game.screen)
  const key = game.load('games/textbattle/rules.js').saveKey
  const before = structuredClone(game.storage.get(key))
  const parts = game.load('games/textbattle/names.js').parts
  const genders = new Set()
  for (let i = 0; i < 80; i++) {
    const controls = nameControls(game)
    game.tap(i % 2 ? controls.name : controls.randomName)
    genders.add(game.storage.get(key).player.gender)
  }
  assert.equal(genders.size, 2)
  const after = game.storage.get(key)
  assert.deepEqual({ ...after, player: { ...after.player, name: before.player.name, gender: before.player.gender } }, before)
  const recent = game.storage.get('textbattle.names.v1')
  assert.equal(recent.length, 64)
  assert.equal(new Set(recent).size, 64)
  const restored = boot('textbattle', { storage: [...game.storage] })
  restored.tap(nameControls(restored).randomName)
  const name = restored.storage.get(key).player.name
  assert.ok(!recent.includes(name))
  assert.ok(!recent.slice(-8).some(value => parts(value).surname === parts(name).surname))
  assert.ok(!recent.slice(-16).some(value => parts(value).given === parts(name).given))
  assertReleased(game); assertReleased(restored)
})

test('fighter atlas loads once, repaints once, remains idle and releases callbacks on exit', () => {
  const game = boot('textbattle', { images: true })
  assert.equal(game.images.length, 1)
  const image = game.images[0]
  assert.equal(image.src, 'assets/textbattle/fighters-2d.png')
  game.reset(); image.onload()
  assert.equal(game.metrics.paints, 1); assert.equal(game.metrics.blits, 2)
  assert.equal(image.onload, null); assert.equal(image.onerror, null)
  game.reset(); game.advance(5000)
  assert.equal(game.metrics.paints, 0); assert.equal(game.timers.size, 0)
  assertReleased(game)
  const pending = boot('textbattle', { images: true })
  const late = pending.images[0].onload
  assertReleased(pending); pending.reset(); late()
  assert.equal(pending.metrics.paints, 0)
  assert.equal(pending.images[0].onload, null)
})

test('gender button switches the avatar without changing combat values and persists across reload', () => {
  const game = boot('textbattle', { images: true })
  game.images[0].onload()
  const view = game.load('games/textbattle/layout.js').layout(game.screen)
  const before = structuredClone(game.storage.get('textbattle.v5'))
  game.tap(view.gender)
  const after = game.storage.get('textbattle.v5')
  assert.equal(after.player.gender, 'female')
  assert.deepEqual({ ...after, player: { ...after.player, gender: 'male' } }, before)
  const restored = boot('textbattle', { storage: [...game.storage] })
  assert.equal(restored.storage.get('textbattle.v5').player.gender, 'female')
  game.tap(view.action); game.tap(view.gender)
  assert.equal(game.storage.get('textbattle.v5').player.gender, 'female')
  assertReleased(game); assertReleased(restored)
})

test('fighter atlas loading or texture upload failure falls back to playable vector art', () => {
  for (const failedBlit of [false, true]) {
    const game = boot('textbattle', { images: true, failedBlit })
    if (failedBlit) game.images[0].onload()
    else game.images[0].onerror()
    const view = game.load('games/textbattle/layout.js').layout(game.screen)
    game.tap(view.action); game.advance(1500); game.scene.hide()
    assert.ok(game.storage.get('textbattle.v5').elapsedMs > 0)
    assertReleased(game)
  }
})

test('quality atlas loads lazily once, owned badges are read-only and late image callbacks cannot repaint', () => {
  const rules = require('../games/textbattle/rules.js')
  const state = rules.initialState(29)
  for (let i = 0; i < 2; i++) {
    state.status = 'won'; state.enemy.hp = 0; state.streak = state.round; rules.nextRound(state)
    if (i === 0) rules.chooseUpgrade(state, rules.upgradeChoices(state)[0].id)
  }
  const game = boot('textbattle', { images: true, storage: [[rules.saveKey, rules.snapshot(state)]] })
  const view = game.load('games/textbattle/layout.js').layout(game.screen)
  assert.equal(game.images.length, 2)
  const atlas = game.images[1]
  assert.equal(atlas.src, 'assets/textbattle/upgrade-icons.png')
  atlas.width = 768; atlas.height = 512
  game.reset(); atlas.onload()
  assert.equal(game.metrics.paints, 1); assert.equal(game.metrics.blits, 4)
  assert.equal(atlas.onload, null); assert.equal(atlas.onerror, null)
  const before = structuredClone(game.storage.get(rules.saveKey))
  game.reset(); game.tap(view.growthOwned[0])
  assert.deepEqual(game.storage.get(rules.saveKey), before)
  assert.ok(game.texts.some(item => /普通\d+ \/ 精良\d+/.test(item.text)))
  assert.ok(game.texts.some(item => /史诗\d+ \/ 传说\d+/.test(item.text)))
  assert.equal(game.images.length, 2); assert.equal(game.metrics.writes, 0)
  game.reset(); game.advance(5000)
  assert.equal(game.metrics.paints, 0); assert.equal(game.timers.size, 0)
  assertReleased(game)
  const pending = boot('textbattle', { images: true, storage: [[rules.saveKey, rules.snapshot(state)]] })
  const late = pending.images[1].onload
  assertReleased(pending); pending.reset(); late()
  assert.equal(pending.metrics.paints, 0); assert.equal(pending.images[1].onload, null)
  const failed = boot('textbattle', { images: true, failedBlit: true, storage: [[rules.saveKey, rules.snapshot(state)]] })
  failed.images[1].width = 768; failed.images[1].height = 512; failed.images[1].onload()
  failed.tap(view.growthCards[0]); failed.tap(view.growthConfirm); assert.equal(failed.storage.get(rules.saveKey).progression.pending, false)
  assertReleased(failed)
})

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
