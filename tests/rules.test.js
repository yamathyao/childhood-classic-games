const assert = require('node:assert/strict')
const { test } = require('node:test')
const rules = require('../games/klotski/rules.js')
const { levels } = require('../games/klotski/levels.js')
const { solve, solveLevel } = require('./helpers/solver.js')
const { layout } = require('../games/klotski/layout.js')
const { formatDuration } = require('../games/klotski/renderer.js')

test('timer formatting stays compact beside the step count', () => {
  assert.equal(formatDuration(0), '00:00')
  assert.equal(formatDuration(61 * 1000), '01:01')
  assert.equal(formatDuration(61 * 60 * 1000 + 2 * 1000), '01:01:02')
})

test('exact 横刀立马 board: ten pieces, eighteen occupied cells, bottom two empty', () => {
  const state = rules.initialState()
  assert.equal(rules.isValid(state.pieces), true)
  const rows = Array.from({ length: 5 }, () => Array(4).fill('.'))
  for (const p of state.pieces) for (let y = p.y; y < p.y + p.h; y++) {
    for (let x = p.x; x < p.x + p.w; x++) rows[y][x] = p.id
  }
  assert.deepEqual(rows, [
    ['zhang', 'cao', 'cao', 'ma'], ['zhang', 'cao', 'cao', 'ma'],
    ['zhao', 'guan', 'guan', 'huang'], ['zhao', 's1', 's2', 'huang'],
    ['s3', '.', '.', 's4']
  ])
})

test('published variant catalogue has valid independent starting states and goals', () => {
  assert.equal(levels.length, 32)
  const ids = new Set()
  for (const level of levels) {
    assert.equal(ids.has(level.id), false)
    ids.add(level.id)
    const bound = rules.create(level)
    const state = bound.initialState()
    const heroes = state.pieces.filter(piece => piece.id !== 'cao' && piece.w * piece.h === 2)
    assert.deepEqual(heroes.map(piece => piece.name).sort(), ['关羽', '张飞', '赵云', '黄忠', '马超'].sort(), level.id)
    assert.equal(state.pieces.some(piece => piece.name === '横将' || piece.name === '竖将'), false, level.id)
    assert.equal(state.level, level.id)
    assert.equal(bound.isValid(state.pieces), true, level.id)
    assert.equal(bound.isWon(state.pieces), false, level.id)
    assert.equal(bound.restore(bound.snapshot(state)).level, level.id)
    assert.equal(bound.restore({ ...bound.snapshot(state), level: 'other' }).steps, 0)
    const solution = solveLevel(level)
    const solved = bound.initialState()
    for (const action of solution) assert.equal(bound.move(solved, action.id, action.axis, action.delta), true)
    assert.equal(bound.isWon(solved.pieces), true, level.id)
  }
})

test('collisions, boundaries and long-drag path checks cannot be bypassed', () => {
  const state = rules.initialState()
  for (const [id, axis, delta] of [['cao', 'y', 1], ['zhang', 'x', -1],
    ['s3', 'x', 3], ['s1', 'y', .5], ['s1', 'z', 1], ['missing', 'x', 1]]) {
    assert.equal(rules.move(state, id, axis, delta), false)
  }
  assert.equal(state.steps, 0)
  assert.equal(rules.move(state, 's3', 'x', 2), true)
  assert.equal(state.steps, 1, 'a straight two-cell drag counts once')
  assert.equal(rules.undo(state), true)
  assert.deepEqual(state, rules.initialState())
})

test('storage replay rejects corrupt history and restores valid progress', () => {
  const state = rules.initialState()
  rules.move(state, 's1', 'y', 1)
  assert.deepEqual(rules.restore(rules.snapshot(state)), state)
  for (const saved of [null, {}, { version: 2 },
    { version: 1, level: 'classic', history: [{ id: 'cao', axis: 'y', delta: 4 }] },
    { version: 1, level: 'classic', history: [null] }]) {
    assert.deepEqual(rules.restore(saved), rules.initialState())
  }
})

test('solver completes the actual rules; every intermediate board is legal; win locks play', () => {
  const solution = solve()
  const state = rules.initialState()
  for (const action of solution) {
    assert.equal(rules.move(state, action.id, action.axis, action.delta), true)
    assert.equal(rules.isValid(state.pieces), true)
  }
  assert.equal(rules.isWon(state.pieces), true)
  assert.equal(rules.move(state, 'cao', 'y', -1), false)
  assert.deepEqual(rules.restore(rules.snapshot(state)), state)
  while (state.steps) assert.equal(rules.undo(state), true)
  assert.deepEqual(state, rules.initialState())
})

test('controls and board stay on screen from compact phones to tablets and safe areas', () => {
  for (const [width, height, top, bottom] of [
    [320, 568, 24, 16], [375, 667, 60, 16], [390, 844, 60, 34], [768, 1024, 60, 20]
  ]) {
    const view = layout({ width, height, top, bottom })
    assert.ok(view.cell >= 39)
    for (const name of ['board', 'undo', 'reset', 'exit', 'dialog', 'cancel', 'confirm']) {
      const rect = view[name]
      assert.ok(rect.x >= 0 && rect.y >= top, name)
      assert.ok(rect.x + rect.w <= width && rect.y + rect.h <= height - bottom, name)
    }
  }
})
