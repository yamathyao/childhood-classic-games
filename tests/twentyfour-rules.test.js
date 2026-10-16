const { test } = require('node:test')
const assert = require('node:assert/strict')
const rules = require('../games/twentyfour/rules.js')

test('every easy puzzle has a valid solution using positive integer intermediate results', () => {
  assert.ok(rules.puzzles.length >= 30)
  const combinations = new Set()
  for (const puzzle of rules.puzzles) {
    assert.equal(rules.check(puzzle.solution, puzzle.numbers).ok, true, puzzle.solution)
    assert.ok(rules.evaluate(puzzle.solution).steps.every(step => Number.isInteger(step.value) && step.value > 0), puzzle.solution)
    assert.ok(puzzle.numbers.every(number => number >= 1 && number <= 9))
    assert.ok(puzzle.hint)
    combinations.add(puzzle.numbers.slice().sort((a, b) => a - b).join(','))
  }
  assert.equal(combinations.size, rules.puzzles.length)
})

test('arithmetic follows precedence, parentheses and left associativity', () => {
  for (const [expression, value] of [['2+3*4', 14], ['(2+3)*4', 20], ['24/3/2', 4], ['8-3-2', 3], ['(8+4)*(3-1)', 24], ['8÷(4−2)×6', 24]]) {
    assert.equal(rules.evaluate(expression).value, value)
  }
})

test('answers must use each supplied number once, including repeated numbers', () => {
  assert.equal(rules.check('(6+3+3)*2', [2, 3, 3, 6]).ok, true)
  assert.equal(rules.check('6*4', [2, 3, 4, 6]).code, 'numbers')
  assert.equal(rules.check('24+3-3', [2, 4, 3, 3]).code, 'numbers')
  assert.equal(rules.check('(6+4-3)*3', [2, 3, 4, 6]).code, 'numbers')
  assert.equal(rules.check('(6+4-2)*03', [2, 3, 4, 6]).code, 'numbers')
  assert.deepEqual(rules.usage('3+3', [2, 3, 3, 6]), [false, true, true, false])
  assert.deepEqual(rules.usage('3', [2, 3, 3, 6]), [false, true, false, false])
  assert.equal(rules.check('2+3+4+6', [2, 3, 4, 6]).value, 15)
  assert.equal(rules.check('6÷(1−3÷4)', [1, 3, 4, 6]).ok, true)
})

test('incomplete, unsafe and unsupported expressions produce readable failures', () => {
  for (const expression of ['(6+4-', '6(4)', '()', '6**4', '6//4', '1 2+3', '(6+4))', '6+', '*6', '-6', '(6+4', '6+4)']) {
    assert.equal(rules.check(expression, [2, 3, 4, 6]).code, 'syntax', expression)
  }
  for (const expression of ['Math.pow(2,3)', 'alert(1)', '2**3^4', '2.5+1', '2e3', '2=2', '<script>']) {
    assert.equal(rules.check(expression, [2, 3, 4, 6]).code, 'characters', expression)
  }
  assert.equal(rules.check('6/(3-3)', [6, 3, 3, 2]).code, 'zero')
  assert.equal(rules.check('', [2, 3, 4, 6]).code, 'empty')
  assert.equal(rules.check('1'.repeat(65), [2, 3, 4, 6]).code, 'length')
})

test('shuffling preserves the complete bank and changes its order', () => {
  const deck = rules.shuffledPuzzles(() => 0)
  assert.deepEqual(deck.map(puzzle => puzzle.id).sort((a, b) => a - b), rules.puzzles.map(puzzle => puzzle.id))
  assert.notDeepEqual(deck.map(puzzle => puzzle.id), rules.puzzles.map(puzzle => puzzle.id))
  assert.equal(rules.puzzles[0].id, 0)
})

test('each complete deck visits all puzzles once and does not repeat at the boundary', () => {
  const state = rules.initialState(() => .25); const seen = new Set([state.puzzleId])
  for (let i = 1; i < rules.puzzles.length; i++) {
    rules.next(state, () => .25); assert.ok(!seen.has(state.puzzleId)); seen.add(state.puzzleId)
  }
  const previous = state.puzzleId; rules.next(state, () => .25)
  assert.notEqual(state.puzzleId, previous); assert.equal(state.round, 32)
})

test('cursor edits preserve completed puzzle accounting and limits', () => {
  const state = rules.initialState()
  for (const char of '(6+4-2)*3') rules.edit(state, char)
  assert.equal(rules.submit(state).ok, true); assert.equal(state.solved, 1)
  rules.edit(state, 'delete'); rules.edit(state, '3'); assert.equal(rules.submit(state).ok, true); assert.equal(state.solved, 1)
  rules.edit(state, 'clear'); rules.edit(state, '3'); rules.edit(state, '6'); rules.edit(state, 'left'); rules.edit(state, '+')
  assert.equal(state.expression, '3+6'); assert.equal(state.cursor, 2)
  rules.edit(state, 'clear'); for (let i = 0; i < 80; i++) rules.edit(state, '1')
  assert.equal(state.expression.length, 64); assert.equal(rules.edit(state, 'a'), false)
  rules.next(state); assert.equal(state.expression, ''); assert.equal(state.solved, 1); assert.equal(state.counted, false)
})

test('snapshots preserve deck, hints, cursor and answers, and reject malformed saves', () => {
  const state = rules.initialState(() => .5)
  for (const char of '(6+4-2)*3') rules.edit(state, char)
  rules.submit(state); state.hintLevel = 2; rules.edit(state, 'left')
  const saved = rules.snapshot(state)
  assert.deepEqual(rules.snapshot(rules.restore(saved)), saved)
  saved.deck.pop(); assert.notEqual(saved.deck.length, state.deck.length)
  for (const patch of [{ version: 0 }, { deck: [1, 1] }, { deck: [0] }, { deck: [999] }, { puzzleId: -1 },
    { cursor: 90 }, { expression: '<script>' }, { solved: -1 }, { round: NaN }, { hintLevel: 99 }, { counted: false }]) {
    const restored = rules.restore({ ...rules.snapshot(state), ...patch })
    assert.equal(restored.round, 1); assert.equal(restored.expression, ''); assert.equal(restored.solved, 0)
  }
  assert.equal(rules.restore({ ...rules.snapshot(state), expression: '3+6', cursor: 3 }).completed, false)
  assert.equal(rules.restore(null).puzzleId, 0)
})
