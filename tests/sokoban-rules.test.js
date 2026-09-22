const assert = require('node:assert/strict')
const { test } = require('node:test')
const { levels, originals, tutorials } = require('../games/sokoban/levels.js')
const { create } = require('../games/sokoban/rules.js')
const solutions = require('./sokoban-solutions.json')
const directionNames = { U: 'up', D: 'down', L: 'left', R: 'right' }
const clone = state => ({ ...state, boxes: [...state.boxes], gemStyles: [...state.gemStyles], history: [...state.history] })

test('26 teaching levels and 20 selected XSokoban challenges replay to a classic Sokoban win', () => {
  assert.equal(tutorials.length, 26)
  assert.equal(originals.length, 20)
  assert.equal(levels.length, 46)
  assert.equal(new Set(levels.map(level => level.id)).size, 46)
  assert.equal(new Set(levels.map(level => level.map)).size, 46)
  assert.deepEqual(tutorials.slice(6).map(level => level.sourceOrder), [
    ...Array.from({ length: 17 }, (_, index) => index + 7), 25, 30, 31
  ])
  assert.equal(new Set(originals.map(level => level.template)).size, 1)
  assert.deepEqual(originals.map(level => level.sourceOrder), Array.from({ length: 20 }, (_, i) => i + 31))
  for (const level of levels) {
    const rules = create(level); const state = rules.initialState()
    if (!level.id.includes('tutorial')) assert.ok(rules.board.width >= 13 && rules.board.height >= 12)
    assert.ok(rules.isValid(state), level.id)
    assert.equal(rules.isWon(state), false)
    assert.equal(rules.deadlockReason(state), null)
    for (const code of solutions[level.id]) {
      assert.ok(rules.move(state, directionNames[code]), `${level.id} at step ${state.steps}`)
      if (!level.id.includes('tutorial')) assert.equal(rules.deadlockReason(state), null, `${level.id} false deadlock at ${state.steps}`)
      assert.ok(rules.isValid(state))
      if (state.steps % 100 === 0 || state.steps === solutions[level.id].length) {
        assert.deepEqual(rules.restore(rules.snapshot(state)), state, `${level.id} resume at ${state.steps}`)
      }
    }
    assert.ok(rules.isWon(state), level.id)
    assert.equal(state.pushes, level.minimumPushes)
    assert.ok(level.minimumPushes >= 1)
    const completed = clone(state)
    assert.equal(rules.move(state, 'left'), false)
    assert.deepEqual(state, completed)
    while (state.history.length) assert.ok(rules.undo(state))
    assert.deepEqual(state, rules.initialState(), `${level.id} undo all`)
  }
})

test('reference teaching puzzles have verified replay solutions', () => {
  for (const level of tutorials) assert.ok(level.minimumPushes >= 1 && solutions[level.id].length >= level.minimumPushes, level.id)
})

test('classic Sokoban wins when every goal is occupied regardless of box identity', () => {
  const rules = create({ id: 'colors', map: ['#######', '#. .  #', '# $ $ #', '#  @  #', '#######'].join('\n') })
  const state = rules.initialState()
  state.boxes = [...rules.board.goals]; state.gemStyles = [1, 0]
  assert.ok(rules.isValid(state))
  assert.equal(rules.isWon(state), true)
})

test('a real push reorders boxes without changing colors, including undo and resume', () => {
  const rules = create({ id: 'identity', map: ['#######', '# @ . #', '# $ $ #', '# .   #', '#######'].join('\n'), gemStyles: [0, 1], goalStyles: { 11: 1, 23: 0 } })
  const state = rules.initialState(); const before = clone(state)
  assert.equal(rules.move(state, 'down'), true)
  assert.equal(state.pushes, 1)
  assert.notEqual(state.history[0].pushedFrom, null)
  assert.deepEqual(state.boxes, [18, 23])
  assert.deepEqual(state.gemStyles, [1, 0])
  assert.equal(rules.isMatched(state, 1), true)
  const saved = rules.snapshot(state)
  // Saved styles cannot override identity reconstructed from legal moves.
  saved.gemStyles = [0, 1]
  const restored = rules.restore(saved)
  assert.deepEqual(restored, state)
  assert.equal(rules.undo(restored), true)
  assert.deepEqual(restored, before)
})

test('each template allows recoverable bad pushes without hiding legal moves', () => {
  const trappedTemplates = new Set()
  for (const level of originals) {
    const rules = create(level); const state = rules.initialState()
    for (const code of solutions[level.id]) {
      for (const direction of Object.keys(rules.directions)) {
        const next = clone(state)
        if (!rules.move(next, direction) || !rules.deadlockReason(next)) continue
        assert.ok(rules.undo(next))
        assert.deepEqual(next, state)
        assert.equal(rules.deadlockReason(next), null)
        trappedTemplates.add(level.template)
      }
      rules.move(state, directionNames[code])
    }
  }
  assert.equal(trappedTemplates.size, 1)
})

test('blocked moves, multiple-box pushes and invalid positions leave state unchanged', () => {
  const rules = create({ id: 'blocked', map: ['#######', '#@$$..#', '#######'].join('\n') })
  const state = rules.initialState(); const before = clone(state)
  for (const direction of ['up', 'left', 'right', 'invalid']) assert.equal(rules.move(state, direction), false)
  assert.deepEqual(state, before)
  state.player = -1
  assert.equal(rules.isValid(state), false)
  assert.equal(rules.move(state, 'right'), false)
})

test('archives are isolated by map/color revision and invalid history is rejected', () => {
  const rules = create(levels[0]); const state = rules.initialState()
  assert.ok(rules.move(state, directionNames[solutions[levels[0].id][0]]))
  state.elapsedMs = 12345
  const saved = rules.snapshot(state)
  assert.deepEqual(rules.restore(saved), state)
  assert.equal(rules.restore({ ...saved, version: 2 }).steps, 0)
  assert.equal(rules.restore({ ...saved, history: [{ direction: 'bad' }] }).steps, 0)
  const recolored = create({ ...levels[0], gemStyles: Array.from({ length: levels[0].map.match(/\$/g).length }, (_, i) => i % 4) })
  assert.equal(recolored.saveKey, rules.saveKey)
  assert.equal(recolored.bestKey, rules.bestKey)
  assert.equal(recolored.restore(saved).steps, state.steps)
  const changed = create({ id: levels[0].id, map: ['#####', '#.@ #', '# $ #', '#####'].join('\n') })
  assert.notEqual(changed.saveKey, rules.saveKey)
  assert.equal(changed.restore(saved).steps, 0)
})

test('malformed maps are rejected before play and box styles remain visual metadata', () => {
  assert.throws(() => create({ id: 'edge', map: ['#####', ' .$@#', '#####'].join('\n') }), /boundary/)
  assert.throws(() => create({ id: 'players', map: ['######', '#.$@@#', '######'].join('\n') }), /Invalid map/)
  assert.ok(create({ ...levels[0], gemStyles: levels[0].map.match(/\$/g).map((_, i) => i % 4) }))
  assert.throws(() => create({ ...levels[0], gemStyles: [NaN, 1] }), /box styles/)
})
