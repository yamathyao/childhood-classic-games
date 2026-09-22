const assert = require('node:assert/strict')
const { test } = require('node:test')
const { createRules, WIDTH, HEIGHT, PIECES, cellsFor } = require('../games/tetris/rules.js')

function fixedRandom(values = [0]) {
  let index = 0
  return () => values[index++ % values.length]
}

test('creates a 10x20 board with seven standard pieces and a queued preview', () => {
  const rules = createRules(fixedRandom([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]))
  const state = rules.initialState()
  assert.equal(state.board.length, WIDTH * HEIGHT)
  assert.deepEqual(PIECES.slice().sort(), ['I', 'J', 'L', 'O', 'S', 'T', 'Z'])
  assert.equal(state.queue.length, 5)
  assert.ok(state.active && PIECES.includes(state.active.type))
  assert.equal(state.version, 1)
})

test('moves inside boundaries and rejects collision', () => {
  const rules = createRules(() => 0.2)
  const state = rules.initialState()
  state.active = { type: 'I', rotation: 0, x: 0, y: 0 }
  assert.equal(rules.move(state, 'left').changed, false)
  assert.equal(rules.move(state, 'right').changed, true)
  state.board[2 * WIDTH + state.active.x + 1] = 'J'
  state.active.y = 0
  const landed = rules.move(state, 'softDrop')
  assert.equal(landed.changed, true)
  assert.equal(landed.locked, true)
})

test('rotates with a wall kick and preserves the piece when rotation is blocked', () => {
  const rules = createRules(() => 0.2)
  const state = rules.initialState()
  state.active = { type: 'I', rotation: 1, x: -1, y: 0 }
  assert.equal(rules.rotate(state).changed, true)
  assert.ok(state.active.x >= 0)
  state.active = { type: 'T', rotation: 0, x: 3, y: 0 }
  state.board.fill('J')
  for (const [x, y] of cellsFor(state.active)) state.board[y * WIDTH + x] = null
  const before = JSON.stringify(state.active)
  assert.equal(rules.rotate(state).changed, false)
  assert.equal(JSON.stringify(state.active), before)
})

test('hard drop locks a piece, clears a full row, and awards score', () => {
  const rules = createRules(() => 0.2)
  const state = rules.initialState()
  state.started = true
  state.board.fill(null)
  for (let x = 0; x < WIDTH - 4; x++) state.board[19 * WIDTH + x] = 'J'
  state.active = { type: 'I', rotation: 0, x: WIDTH - 4, y: 0 }
  const result = rules.hardDrop(state)
  assert.equal(result.changed, true)
  assert.equal(result.lines, 1)
  assert.equal(state.lines, 1)
  assert.ok(state.score >= 108)
  assert.equal(state.gameOver, false)
})

test('tick locks pieces at the fall interval and computes levels', () => {
  const rules = createRules(() => 0.2)
  const state = rules.initialState()
  state.started = true
  state.active = { type: 'O', rotation: 0, x: 3, y: HEIGHT - 2 }
  const result = rules.tick(state, rules.fallInterval(1))
  assert.equal(result.changed, true)
  assert.equal(state.board.filter(Boolean).length, 4)
  assert.equal(state.active.y, 0)
})

test('snapshot restores valid progress and rejects malformed data', () => {
  const rules = createRules(() => 0.3)
  const state = rules.initialState()
  state.score = 120
  state.lines = 10
  state.level = 2
  state.started = true
  const restored = rules.restore(rules.snapshot(state))
  assert.deepEqual(restored, state)
  assert.deepEqual(rules.restore({ version: 1, board: [1] }), rules.initialState())
  assert.deepEqual(rules.restore({ version: 2 }), rules.initialState())
})
