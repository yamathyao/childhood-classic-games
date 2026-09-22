const assert = require('node:assert/strict')
const { test, afterEach } = require('node:test')
const { layout } = require('../games/tetris/layout.js')

const gameModule = require('../games/tetris/game.js')

function makeContext(texts) {
  const context = {}
  for (const name of ['clearRect', 'fillRect', 'beginPath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo',
    'closePath', 'arc', 'fill', 'stroke', 'save', 'restore']) context[name] = () => {}
  context.createLinearGradient = () => ({ addColorStop() {} })
  context.fillText = (value, x, y) => texts.push({ text: String(value), x, y })
  return context
}

function bootTetris() {
  const listeners = Object.fromEntries(['TouchStart', 'TouchMove', 'TouchEnd', 'TouchCancel'].map(name => [name, new Set()]))
  const intervals = new Map()
  const storage = new Map()
  let nextInterval = 1
  const wx = {
    onTouchStart: callback => listeners.TouchStart.add(callback),
    onTouchMove: callback => listeners.TouchMove.add(callback),
    onTouchEnd: callback => listeners.TouchEnd.add(callback),
    onTouchCancel: callback => listeners.TouchCancel.add(callback),
    offTouchStart: callback => listeners.TouchStart.delete(callback),
    offTouchMove: callback => listeners.TouchMove.delete(callback),
    offTouchEnd: callback => listeners.TouchEnd.delete(callback),
    offTouchCancel: callback => listeners.TouchCancel.delete(callback),
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, JSON.parse(JSON.stringify(value)))
  }
  const oldWx = global.wx
  const oldSetInterval = global.setInterval
  const oldClearInterval = global.clearInterval
  global.wx = wx
  global.setInterval = callback => { const id = nextInterval++; intervals.set(id, callback); return id }
  global.clearInterval = id => intervals.delete(id)
  const texts = []
  const screen = { width: 375, height: 667, top: 24, bottom: 16, dpr: 2 }
  let returnedHome = false
  const scene = gameModule.start({ context: makeContext(texts), screen, goHome: () => { returnedHome = true } })
  const view = layout(screen)
  const emit = (type, x, y, identifier = 1) => {
    const touch = { clientX: x, clientY: y, identifier }
    const event = { touches: type === 'Start' || type === 'Move' ? [touch] : [], changedTouches: [touch] }
    for (const callback of [...listeners['Touch' + type]]) callback(event)
  }
  const tap = rect => { const x = rect.x + rect.w / 2; const y = rect.y + rect.h / 2; emit('Start', x, y); emit('End', x, y) }
  return {
    scene, view, listeners, intervals, storage, texts, emit, tap,
    hasText: label => texts.some(item => item.text.includes(label)),
    get state() { return storage.get('tetris.v1') },
    get returnedHome() { return returnedHome },
    cleanup() {
      scene.dispose()
      global.wx = oldWx
      global.setInterval = oldSetInterval
      global.clearInterval = oldClearInterval
    }
  }
}

afterEach(() => { if (global.wx) delete global.wx })

test('scene registers one listener set and renders the main controls', () => {
  const game = bootTetris()
  assert.equal(game.listeners.TouchStart.size, 1)
  assert.equal(game.listeners.TouchEnd.size, 1)
  assert.equal(game.hasText('俄罗斯方块'), true)
  assert.equal(game.hasText('硬降'), true)
  game.cleanup()
  for (const set of Object.values(game.listeners)) assert.equal(set.size, 0)
})

test('first valid action starts timer, persists progress, and hard drop updates score', () => {
  const game = bootTetris()
  assert.equal(game.intervals.size, 0)
  game.tap(game.view.pad.rotate)
  assert.equal(game.intervals.size, 1)
  assert.equal(game.state.started, true)
  game.tap(game.view.hardDrop)
  assert.ok(game.state.score > 0)
  assert.ok(game.state.board.some(Boolean))
  game.cleanup()
})

test('back action persists and returns to the collection', () => {
  const game = bootTetris()
  game.tap(game.view.hardDrop)
  game.tap(game.view.back)
  assert.equal(game.returnedHome, true)
  assert.ok(game.storage.has('tetris.v1'))
  assert.equal(game.intervals.size, 0)
  game.cleanup()
})

test('玩法弹窗的说明文字按弹窗中心对齐', () => {
  const game = bootTetris()
  game.tap(game.view.help)
  const centerX = game.view.dialog.x + game.view.dialog.w / 2
  const lines = game.texts.filter(item => item.text.includes('滑动') || item.text.includes('下滑软降') || item.text.includes('填满整行'))
  assert.equal(lines.length, 3)
  assert.ok(lines.every(item => item.x === centerX))
  game.cleanup()
})
