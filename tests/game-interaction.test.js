const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const rules = require('../games/klotski/rules.js')
const { solve } = require('./helpers/solver.js')
const { layout } = require('../games/klotski/layout.js')

function boot(options = {}) {
  const listeners = Object.fromEntries(['TouchStart', 'TouchMove', 'TouchEnd', 'TouchCancel',
    'Hide', 'Show', 'WindowResize'].map(name => [name, new Set()]))
  const storage = options.storage || new Map()
  const intervals = new Map()
  let nextInterval = 1
  let now = 1000
  let nextFrame = 1
  let paints = 0
  const frames = new Map()
  const animationGlobals = options.animation ? {
    Date: class extends Date { static now() { return now } },
    requestAnimationFrame: callback => { const id = nextFrame++; frames.set(id, callback); return id },
    cancelAnimationFrame: id => frames.delete(id)
  } : {}
  const advanceFrame = (ms = 16) => {
    now += ms
    const pending = [...frames.entries()]
    for (const [id, callback] of pending) {
      if (frames.delete(id)) callback(now)
    }
  }
  const screen = { width: 375, height: 812, top: 24, bottom: 16, dpr: 2 }
  const view = layout(screen)
  let texts = []
  const operations = []
  const c = Object.fromEntries(['fillRect', 'beginPath', 'moveTo', 'lineTo',
    'quadraticCurveTo', 'bezierCurveTo', 'closePath', 'arc', 'fill', 'stroke', 'strokeRect', 'save', 'restore',
    'clip', 'drawImage'].map(name => [name, (...args) => { operations.push({ name, args }) }]))
  c.scale = (...args) => operations.push({ name: 'scale', args })
  c.createLinearGradient = () => ({ addColorStop() {} })
  c.clearRect = () => { texts = []; operations.length = 0; paints++ }
  c.fillText = (text, x, y) => texts.push({ text: String(text), x, y })
  const canvas = { getContext: () => c }
  const wx = {
    createCanvas: () => canvas,
    getSystemInfoSync: () => ({ windowWidth: screen.width, windowHeight: screen.height, pixelRatio: screen.dpr }),
    getStorageSync: key => {
      if (options.storageFails) throw new Error('Storage unavailable')
      return storage.get(key)
    },
    setStorageSync: (key, value) => {
      if (options.storageFails) throw new Error('Storage unavailable')
      storage.set(key, JSON.parse(JSON.stringify(value)))
    },
    setInterval: undefined
  }
  const setIntervalMock = callback => { const id = nextInterval++; intervals.set(id, callback); return id }
  const clearIntervalMock = id => intervals.delete(id)
  for (const name of Object.keys(listeners)) {
    wx['on' + name] = callback => listeners[name].add(callback)
    wx['off' + name] = callback => listeners[name].delete(callback)
  }
  const cache = new Map()
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports
    const module = { exports: {} }
    cache.set(file, module)
    const evaluate = vm.runInNewContext(
      '(function(require, module, exports) {\n' + fs.readFileSync(file, 'utf8') + '\n})',
      { wx, ...animationGlobals, setInterval: setIntervalMock, clearInterval: clearIntervalMock,
        console: { log() {}, warn() {}, error(...args) { throw new Error(args.join(' ')) } } },
      { filename: file }
    )
    evaluate(request => load(path.resolve(path.dirname(file), request)), module, module.exports)
    return module.exports
  }
  load(path.resolve(__dirname, '../game.js'))
  const emit = (type, x, y, identifier = 1) => {
    const touch = { clientX: x, clientY: y, identifier }
    const event = { touches: type === 'Start' || type === 'Move' ? [touch] : [], changedTouches: [touch] }
    for (const listener of [...listeners['Touch' + type]]) listener(event)
  }
  const tap = (x, y) => { emit('Start', x, y); emit('End', x, y) }
  const drag = (x, y, endX, endY) => {
    emit('Start', x, y); emit('Move', endX, endY); emit('End', endX, endY)
  }
  const clickText = label => {
    let target = texts.find(t => t.text.includes(label))
    if (!target && ['进入棋局', '继续解局', '选择对局'].includes(label)) {
      const card = texts.find(t => t.text.includes('华容道'))
      assert.ok(card, 'missing game card')
      tap(card.x, card.y)
      target = texts.find(t => t.text.includes(label) || (label === '进入棋局' && t.text.includes('继续解局')))
    }
    assert.ok(target, 'missing visible control: ' + label)
    tap(target.x, target.y)
  }
  const steps = () => Number(texts.find(t => t.x === screen.width - 43 && t.y === screen.top + 80).text)
  const timer = () => texts.find(t => t.x === screen.width - 116 && t.y === screen.top + 80).text
  const getState = () => rules.restore(storage.get('klotski.classic.v1'))
  const center = id => {
    const p = getState().pieces.find(p => p.id === id)
    return [view.board.x + (p.x + p.w / 2) * view.cell, view.board.y + (p.y + p.h / 2) * view.cell]
  }
  clickText(texts.some(t => t.text.includes('继续解局')) ? '继续解局' : '进入棋局')
  return {
    emit, tap, drag, clickText, steps, timer, getState, center, storage, canvas, listeners, intervals, view,
    advanceFrame, frames, paints: () => paints,
    tick: () => [...intervals.values()].forEach(callback => callback()),
    hasText: label => texts.some(t => t.text.includes(label)),
    operations: () => operations,
    event: name => { for (const callback of [...listeners[name]]) callback({}) },
    apply: action => {
      const [x, y] = center(action.id)
      drag(x, y, x + (action.axis === 'x' ? action.delta * view.cell : 0),
        y + (action.axis === 'y' ? action.delta * view.cell : 0))
    }
  }
}

test('former home button region cannot restart a game; scene listeners stay single', () => {
  const game = boot()
  game.apply({ id: 's1', axis: 'y', delta: 1 })
  game.tap(300, 235)
  assert.equal(game.steps(), 1)
  assert.equal(game.getState().pieces.find(p => p.id === 's1').y, 4)
  for (const type of ['Start', 'Move', 'End', 'Cancel']) {
    assert.equal(game.listeners['Touch' + type].size, 1)
  }
  assert.equal(game.canvas.width, 750, 'DPR scales backing canvas, not input coordinates')
})

test('timer starts on the first valid move, ignores invalid moves, and pauses across hide', () => {
  const game = boot()
  assert.equal(game.timer(), '00:00')
  assert.equal(game.intervals.size, 0)
  game.apply({ id: 'cao', axis: 'y', delta: 1 })
  assert.equal(game.intervals.size, 0)
  game.apply({ id: 's1', axis: 'y', delta: 1 })
  assert.equal(game.intervals.size, 1)
  game.tick()
  assert.match(game.timer(), /^\d{2}:\d{2}$/)
  game.event('Hide')
  assert.equal(game.intervals.size, 0)
  const saved = game.storage.get('klotski.classic.v1')
  assert.ok(Number.isFinite(saved.elapsedMs))
  const resumed = boot({ storage: game.storage })
  assert.equal(resumed.intervals.size, 1)
  assert.equal(resumed.getState().steps, 1)
})

test('reset requires button hit and explicit confirmation; blanks never reset', () => {
  const game = boot()
  game.apply({ id: 's1', axis: 'y', delta: 1 })
  game.tap(5, game.view.reset.y + 20)
  game.tap(187, 790)
  assert.equal(game.steps(), 1)
  game.clickText('重新开始')
  assert.equal(game.steps(), 1)
  game.clickText('取消')
  assert.equal(game.steps(), 1)
  game.clickText('重新开始')
  game.clickText('确认重开')
  assert.equal(game.steps(), 0)
  assert.deepEqual(game.getState(), rules.initialState())
})

test('cancel, hide and unrelated fingers do not commit abandoned gestures', () => {
  const game = boot()
  const [x, y] = game.center('s1')
  game.emit('Start', x, y)
  game.emit('Move', x, y + game.view.cell)
  game.emit('End', x, y + game.view.cell, 2)
  assert.equal(game.steps(), 0)
  game.emit('Cancel', x, y)
  game.emit('End', x, y + game.view.cell)
  assert.equal(game.steps(), 0)
  game.emit('Start', x, y)
  game.event('Hide')
  game.emit('End', x, y + game.view.cell)
  assert.equal(game.steps(), 0)
  game.apply({ id: 's1', axis: 'y', delta: 1 })
  assert.equal(game.steps(), 1)
})

test('100 moves, repeated home round trips, relaunch and undo preserve progress', () => {
  const game = boot()
  for (let i = 0; i < 50; i++) {
    game.apply({ id: 's1', axis: 'y', delta: 1 })
    game.tap(300, 235)
    game.apply({ id: 's1', axis: 'y', delta: -1 })
    if (i % 10 === 0) {
      game.clickText('游戏合集')
      game.clickText('继续解局')
    }
  }
  assert.equal(game.steps(), 100)
  game.event('WindowResize')
  assert.equal(game.steps(), 100)
  for (const name of Object.keys(game.listeners)) assert.equal(game.listeners[name].size, 1, name)
  game.clickText('悔棋')
  assert.equal(game.steps(), 99)
  const saved = rules.restore(game.storage.get('klotski.classic.v1'))
  assert.equal(saved.steps, 99)
  const resumed = boot({ storage: game.storage })
  assert.equal(resumed.steps(), 99)
  assert.deepEqual(resumed.getState().pieces, saved.pieces)
})

test('real touch controller plays a complete solved game, locks win and restarts explicitly', () => {
  const game = boot()
  const solution = solve()
  solution.forEach(action => {
    game.apply(action)
    assert.equal(rules.isValid(game.getState().pieces), true)
  })
  assert.equal(game.steps(), solution.length)
  assert.equal(game.hasText('成功解围'), true)
  assert.equal(rules.isWon(game.getState().pieces), true)
  game.clickText('查看棋盘')
  game.apply({ id: 'cao', axis: 'y', delta: -1 })
  assert.equal(game.steps(), solution.length)
  game.clickText('悔棋')
  assert.equal(game.steps(), solution.length - 1)
  assert.equal(rules.isWon(game.getState().pieces), false)
  game.apply(solution[solution.length - 1])
  game.clickText('再来一局')
  assert.equal(game.steps(), 0)
})

test('won dialog advances to the next Klotski layout', () => {
  const game = boot()
  solve().forEach(action => game.apply(action))
  assert.equal(game.hasText('成功解围'), true)
  assert.equal(game.hasText('下一关'), true)
  game.clickText('下一关')
  assert.equal(game.storage.get('klotski.currentLevel'), 'cross-generals')
  assert.equal(game.hasText('横竖皆将'), true)
  assert.equal(game.steps(), 0)
})

test('level picker switches layouts and keeps saves isolated by level id', () => {
  const game = boot()
  game.clickText('游戏合集')
  game.clickText('选择对局')
  assert.equal(game.hasText('横竖皆将'), true)
  game.clickText('横竖皆将')
  game.clickText('进入棋局')
  assert.equal(game.hasText('横竖皆将'), true)
  assert.equal(game.storage.get('klotski.currentLevel'), 'cross-generals')
  const variant = require('../games/klotski/rules.js').create(require('../games/klotski/levels.js').getLevel('cross-generals'))
  assert.equal(variant.isValid(variant.restore(game.storage.get('klotski.three-lanes.v1')).pieces), true)
  assert.deepEqual(game.storage.get('klotski.classic.v1').history, [])
  game.clickText('游戏合集')
  game.clickText('选择对局')
  game.clickText('横刀立马')
  game.clickText('进入棋局')
  assert.equal(game.hasText('横刀立马'), true)
  assert.equal(game.storage.get('klotski.currentLevel'), 'classic')
})

test('in-game level button opens and closes the Klotski picker', () => {
  const game = boot()
  assert.equal(game.hasText('选关'), true)
  game.clickText('选关')
  assert.equal(game.hasText('选择布局'), true)
  assert.equal(game.hasText('横刀立马'), true)
  game.clickText('×')
  assert.equal(game.hasText('选择布局'), false)
  assert.equal(game.hasText('选关'), true)
})

test('game keeps the top-left collection link and also provides a dedicated exit button', () => {
  const game = boot()
  assert.equal(game.hasText('游戏合集'), true)
  assert.equal(game.hasText('退出棋局'), true)
  game.clickText('退出棋局')
  assert.equal(game.hasText('童 年 游 戏 馆'), true)
  game.clickText('进入棋局')
  game.clickText('游戏合集')
  assert.equal(game.hasText('童 年 游 戏 馆'), true)
})

test('32-level picker paginates and opens a later reference layout', () => {
  const game = boot()
  game.clickText('游戏合集')
  game.clickText('选择对局')
  game.clickText('下一页')
  assert.equal(game.hasText('水泄不通'), true)
  game.clickText('水泄不通')
  game.clickText('进入棋局')
  assert.equal(game.hasText('水泄不通'), true)
  assert.equal(game.storage.get('klotski.currentLevel'), 'flooded-road')
})

test('long and diagonal gestures cannot jump obstacles; tap cannot move', () => {
  const game = boot()
  game.apply({ id: 'cao', axis: 'y', delta: 3 })
  assert.equal(game.steps(), 0)
  const [x, y] = game.center('s1')
  game.tap(x, y)
  assert.equal(game.steps(), 0)
  // Predominantly horizontal diagonal drag is locked to x, where s1 is blocked.
  game.drag(x, y, x + game.view.cell, y + game.view.cell * .7)
  assert.equal(game.steps(), 0)
  game.apply({ id: 's3', axis: 'x', delta: 3 })
  assert.equal(game.steps(), 1)
  assert.equal(game.getState().pieces.find(p => p.id === 's3').x, 2)
})

test('unavailable storage leaves game playable and displays honest save status', () => {
  const game = boot({ storageFails: true })
  const [x, y] = game.center('s1')
  game.drag(x, y, x, y + game.view.cell)
  assert.equal(game.steps(), 1)
  assert.equal(game.hasText('本机保存不可用'), true)
})

test('touch bursts render once per frame and release uses the latest pointer position', () => {
  const game = boot({ animation: true })
  const [x, y] = game.center('s1')
  game.emit('Start', x, y)
  const before = game.paints()
  for (let n = 1; n <= 20; n++) game.emit('Move', x, y + game.view.cell * n / 25)
  assert.equal(game.paints(), before, 'touch events must not redraw synchronously')
  assert.equal(game.frames.size, 1)
  game.advanceFrame()
  assert.equal(game.paints(), before + 1)
  assert.equal(game.frames.size, 1, 'drag interpolation continues between touch events')
  // Release reverses the last rendered position: current input must decide the move.
  game.emit('End', x, y + game.view.cell * .2)
  game.advanceFrame(100)
  assert.equal(game.steps(), 0)
  // A flick completed entirely between frames must still register.
  game.drag(x, y, x, y + game.view.cell * .75)
  game.advanceFrame(100)
  assert.equal(game.steps(), 1)
  assert.equal(game.getState().pieces.find(p => p.id === 's1').y, 4)
  assert.equal(game.frames.size, 0)
})

test('pending drag frames cancel cleanly and snap animations do not swallow the next gesture', () => {
  const game = boot({ animation: true })
  const [x, y] = game.center('s1')
  game.emit('Start', x, y)
  game.emit('Move', x, y + game.view.cell)
  game.emit('End', x, y, 2)
  assert.equal(game.frames.size, 1, 'unrelated finger cannot end the drag')
  game.event('Hide')
  assert.equal(game.frames.size, 0)
  const before = game.paints()
  game.advanceFrame(100)
  assert.equal(game.paints(), before)
  assert.equal(game.steps(), 0)
  game.event('Show')
  game.drag(x, y, x, y + game.view.cell * .7)
  assert.equal(game.frames.size, 1, 'released move is snapping')
  game.emit('Start', x, y + game.view.cell)
  assert.equal(game.getState().steps, 1, 'new touch completes the released move first')
  game.emit('End', x, y)
  assert.equal(game.steps(), 2, 'the next touch was accepted immediately')
  assert.equal(game.frames.size, 0)
  assert.equal(game.getState().pieces.find(p => p.id === 's1').y, 3)
})

test('a full solution through animation frames preserves legal moves, undo and victory', () => {
  const game = boot({ animation: true })
  for (const action of solve()) {
    const [x, y] = game.center(action.id)
    const endX = x + (action.axis === 'x' ? action.delta * game.view.cell : 0)
    const endY = y + (action.axis === 'y' ? action.delta * game.view.cell : 0)
    game.emit('Start', x, y)
    game.emit('Move', endX, endY)
    game.advanceFrame()
    game.emit('End', endX, endY)
    game.advanceFrame(100)
    assert.equal(rules.isValid(game.getState().pieces), true)
  }
  assert.equal(game.hasText('成功解围'), true)
  assert.equal(game.frames.size, 0)
  game.clickText('查看棋盘')
  game.clickText('悔棋')
  assert.equal(rules.isWon(game.getState().pieces), false)
})
