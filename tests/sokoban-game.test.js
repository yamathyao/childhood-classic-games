const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const { layout } = require('../games/sokoban/layout.js')
const { create } = require('../games/sokoban/rules.js')
const { defaultLevel, getLevel, levels } = require('../games/sokoban/levels.js')

function boot(options = {}) {
  const listeners = Object.fromEntries(['TouchStart', 'TouchMove', 'TouchEnd', 'TouchCancel', 'Hide', 'Show', 'WindowResize'].map(name => [name, new Set()]))
  const storage = options.storage || new Map()
  const screen = { width: 375, height: 812, top: 24, bottom: 16, dpr: 2 }
  const texts = []
  const operations = []
  const c = Object.fromEntries(['fillRect', 'beginPath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'closePath', 'arc', 'fill', 'stroke', 'strokeRect', 'save', 'restore', 'clip', 'drawImage'].map(name => [name, (...args) => operations.push({ name, args })]))
  c.scale = (...args) => operations.push({ name: 'scale', args })
  c.createLinearGradient = () => ({ addColorStop() {} })
  c.clearRect = () => { texts.length = 0; operations.length = 0 }
  c.fillText = (value, x, y) => texts.push({ text: String(value), x, y })
  const canvas = { getContext: () => c }
  const wx = {
    createCanvas: () => canvas,
    getSystemInfoSync: () => ({ windowWidth: screen.width, windowHeight: screen.height, pixelRatio: screen.dpr }),
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, JSON.parse(JSON.stringify(value))),
    setInterval: undefined
  }
  for (const name of Object.keys(listeners)) {
    wx['on' + name] = callback => listeners[name].add(callback)
    wx['off' + name] = callback => listeners[name].delete(callback)
  }
  const cache = new Map()
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports
    const module = { exports: {} }; cache.set(file, module)
    const evaluate = vm.runInNewContext('(function(require, module, exports) {\n' + fs.readFileSync(file, 'utf8') + '\n})', {
      wx, console: { log() {}, warn() {}, error(...args) { throw new Error(args.map(item => item && item.stack ? item.stack : String(item)).join(' ')) } }
    }, { filename: file })
    evaluate(request => load(path.resolve(path.dirname(file), request)), module, module.exports)
    return module.exports
  }
  load(path.resolve(__dirname, '../game.js'))
  const emit = (type, x, y, identifier = 1) => {
    const touch = { clientX: x, clientY: y, identifier }
    const event = { touches: type === 'Start' || type === 'Move' ? [touch] : [], changedTouches: [touch] }
    for (const callback of [...listeners['Touch' + type]]) callback(event)
  }
  const tap = (x, y) => { emit('Start', x, y); emit('End', x, y) }
  const clickText = label => {
    let target = texts.find(item => item.text.includes(label))
    if (!target && ['进入游戏', '继续推箱', '选关'].includes(label)) {
      const card = texts.find(item => item.text.includes('推箱子'))
      assert.ok(card, 'missing game card')
      tap(card.x, card.y)
      target = texts.find(item => item.text.includes(label))
    }
    assert.ok(target, 'missing visible control: ' + label)
    tap(target.x, target.y)
  }
  const sokobanLayout = (level = defaultLevel) => layout(screen, create(level).board)
  const state = () => create(defaultLevel).restore(storage.get(create(defaultLevel).saveKey))
  return { texts, storage, listeners, emit, tap, clickText, sokobanLayout, state, canvas }
}

test('home exposes推箱子 and routes into an independent scene', () => {
  const game = boot()
  assert.ok(game.texts.some(item => item.text.includes('推箱子')))
  game.clickText('进入游戏')
  assert.ok(game.texts.some(item => item.text === '推箱子'))
  assert.ok(game.texts.some(item => item.text.includes('选关')))
  assert.ok(game.texts.some(item => item.text.includes('退出棋局')))
  game.clickText('退出棋局')
  assert.ok(game.texts.some(item => item.text.includes('童 年 游 戏 馆')))
})

test('sokoban card opens a readable full-screen detail page before the board', () => {
  const game = boot()
  const card = game.texts.find(item => item.text.includes('推箱子'))
  game.tap(card.x, card.y)
  assert.ok(game.texts.some(item => item.text === '玩法核心'))
  assert.ok(game.texts.some(item => item.text.includes('只能推、不能拉')))
  assert.ok(game.texts.some(item => item.text.includes('选择关卡')))
  game.tap(70, 30)
  assert.ok(game.texts.some(item => item.text.includes('童 年 游 戏 馆')))
})

test('won dialog advances to the next level', () => {
  const game = boot()
  game.clickText('进入游戏')
  const rules = create(defaultLevel)
  const directions = { U: 'up', D: 'down', L: 'left', R: 'right' }
  for (const code of 'DULLRUUDRR') {
    const state = game.state()
    const current = game.sokobanLayout(defaultLevel)
    const columns = rules.board.width
    const x = current.board.x + (state.player % columns) * current.cell + current.cell / 2
    const y = current.board.y + Math.floor(state.player / columns) * current.cell + current.cell / 2
    const delta = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[directions[code]]
    game.emit('Start', x, y)
    game.emit('Move', x + delta[0] * current.cell, y + delta[1] * current.cell)
    game.emit('End', x + delta[0] * current.cell, y + delta[1] * current.cell)
  }
  assert.ok(game.texts.some(item => item.text.includes('下一关')))
  game.clickText('下一关')
  assert.equal(game.storage.get('sokoban.currentLevel'), 'sokoban-tutorial-02')
  assert.ok(game.texts.some(item => item.text.includes('基础关卡 02')))
})

test('swipe moves a harder level, persists progress, and picker switches levels', () => {
  const game = boot()
  game.clickText('进入游戏')
  game.clickText('选关')
  for (let i = 0; i < 3; i++) game.clickText('下一页')
  game.clickText('挑战关卡 31')
  const current = game.sokobanLayout(getLevel('sokoban-31'))
  const start = create(getLevel('sokoban-31')).initialState()
  const columns = create(getLevel('sokoban-31')).board.width
  const x = current.board.x + (start.player % columns) * current.cell + current.cell / 2
  const y = current.board.y + Math.floor(start.player / columns) * current.cell + current.cell / 2
  game.emit('Start', x, y)
  game.emit('Move', x, y - current.cell * 2)
  game.emit('End', x, y - current.cell * 2)
  const saved = game.storage.get(create(getLevel('sokoban-31')).saveKey)
  assert.equal(saved.history.length, 1)
  assert.equal(saved.history[0].pushedTo, null)
  game.clickText('选关')
  for (let i = 0; i < 2; i++) game.clickText('下一页')
  game.clickText('挑战关卡 50')
  assert.ok(game.texts.some(item => item.text.includes('挑战关卡 50')))
  assert.equal(game.storage.get('sokoban.currentLevel'), 'sokoban-50')
})

test('sokoban save is isolated from klotski save', () => {
  const game = boot()
  game.clickText('进入游戏')
  const current = game.sokobanLayout(); const start = create(defaultLevel).initialState()
  const columns = create(defaultLevel).board.width
  const x = current.board.x + (start.player % columns) * current.cell + current.cell / 2
  const y = current.board.y + Math.floor(start.player / columns) * current.cell + current.cell / 2
  game.emit('Start', x, y); game.emit('Move', x, y - current.cell * 2); game.emit('End', x, y - current.cell * 2)
  game.clickText('退出棋局')
  assert.equal(game.storage.get(create(defaultLevel).saveKey).history.length, 1)
  assert.equal(game.storage.has('klotski.classic.v1'), false)
})
