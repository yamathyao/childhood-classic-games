const assert = require('node:assert/strict')
const { test } = require('node:test')
const { create } = require('../games/driller/rules.js')
const { levels, getLevel } = require('../games/driller/levels.js')

function fixture(rows, options = {}) {
  return create({ id: 'fixture', rows, targetDepth: rows.length - 2 - rows.findIndex(row => row.includes('P')), oxygenPeriod: 1000, warningMs: 500, fallMs: 100, ...options })
}
function advance(rules, state, duration) {
  const events = []
  for (let elapsed = 0; elapsed < duration; elapsed += 50) events.push(...rules.tick(state, Math.min(50, duration - elapsed)).events)
  return events
}

test('initial-style courses have ten playable columns, continuous strata and seeded variation', () => {
  assert.deepEqual(levels.map(level => level.targetDepth), [500, 1000])
  assert.equal(getLevel('driller-10').id, 'arcade-500')
  for (const level of levels) {
    const rules = create(level)
    const state = rules.initialState()
    assert.equal(rules.width, 12)
    assert.equal(rules.height, level.targetDepth + 3)
    assert.equal(state.danger.length, 0)
    assert.equal(state.depth, 0)
    assert.equal(state.lives, 3)
    assert.ok(level.rows.slice(2, -1).every(row => row.length === 12 && !row.slice(1, -1).includes('#')))
    assert.ok(state.grid.includes('X') && state.grid.includes('O'))
    assert.equal(state.grid.includes('E'), false)
    assert.deepEqual(rules.initialState(42), rules.initialState(42))
    assert.notDeepEqual(rules.initialState(42).grid, rules.initialState(43).grid)
    assert.equal(rules.restore({ version: 1, levelId: 'driller-01', history: [] }), null)
  }
})

test('effective drill starts time; ordinary moves do not directly consume oxygen', () => {
  const rules = fixture(['######', '#PAA.#', '#BBBB#', '#CCCC#', '#DDDD#', '######'])
  const state = rules.initialState()
  advance(rules, state, 2000)
  assert.equal(state.oxygen, 100)
  assert.equal(state.started, false)
  assert.equal(rules.move(state, 'left').changed, false)
  const result = rules.move(state, 'right')
  assert.equal(result.events.find(event => event.type === 'clear').cells.length, 2)
  assert.equal(state.oxygen, 100)
  advance(rules, state, 1000)
  assert.equal(state.oxygen, 99)
  assert.equal(state.elapsedMs, 1000)
})

test('unsupported blocks warn then fall without another input and consume one life', () => {
  const rules = fixture(['#####', '#.A.#', '#PB.#', '#.C.#', '#.D.#', '#####'])
  const state = rules.initialState()
  rules.move(state, 'right')
  assert.ok(state.danger.includes(7))
  advance(rules, state, 450)
  assert.equal(state.status, 'playing')
  advance(rules, state, 50)
  assert.equal(state.status, 'respawn')
  assert.equal(state.reason, 'crushed')
  assert.equal(state.lives, 2)
  assert.equal(rules.tick(state, 1000).changed, false)
  assert.deepEqual(rules.restore(rules.snapshot(state)), state)
  assert.equal(rules.revive(state), true)
  assert.equal(state.status, 'playing')
  assert.equal(state.invincibleMs, 1500)
  assert.equal(state.lives, 2)
})

test('escaping sideways and drilling overhead are available during warning', () => {
  const rules = fixture(['######', '#.A..#', '#PB..#', '#.CCC#', '#.####', '######'])
  const state = rules.initialState()
  rules.move(state, 'right')
  rules.move(state, 'right')
  advance(rules, state, 600)
  assert.equal(state.status, 'playing')
  assert.equal(state.grid[14], 'A')
  const overhead = fixture(['#####', '#.A.#', '#.P.#', '#BBB#', '#CCC#', '#####'])
  const miner = overhead.initialState()
  const position = miner.player
  assert.equal(overhead.move(miner, 'up').changed, true)
  assert.equal(miner.player, position)
  assert.equal(miner.grid.includes('A'), false)
  assert.equal(overhead.move(miner, 'up').changed, false)
})

test('brown blocks take five hits and charge oxygen only when broken', () => {
  const rules = fixture(['#####', '#.P.#', '#.X.#', '#BBB#', '#CCC#', '#####'])
  const state = rules.initialState()
  const target = state.player + rules.width
  for (let count = 1; count <= 4; count++) {
    rules.move(state, 'down')
    assert.equal(state.damage[target], count)
    assert.equal(state.grid[target], 'X')
    assert.equal(state.oxygen, 100)
    assert.deepEqual(rules.restore(rules.snapshot(state)), state)
  }
  rules.move(state, 'down')
  assert.equal(state.grid[target], '.')
  assert.equal(state.oxygen, 80)
  assert.equal(state.damage[target], undefined)
})

test('falling pairs stay intact; four connected falling blocks clear automatically', () => {
  for (const [row, expected] of [['#AA...P#', false], ['#AAAA.P#', true], ['#XXXX.P#', true]]) {
    const rules = fixture(['########', row, '#......#', '#BBBBBC#', '#CCCCCD#', '########'])
    const state = rules.initialState()
    state.started = true
    const events = advance(rules, state, 550)
    assert.equal(events.some(event => event.type === 'clear' && event.color === row[1]), expected)
    assert.equal(state.oxygen, 100)
  }
})

test('air restores twenty points with a cap, and oxygen exhaustion respects remaining lives', () => {
  const rules = fixture(['#####', '#.P.#', '#.O.#', '#AAA#', '#BBB#', '#####'])
  const state = rules.initialState()
  state.oxygen = 70
  rules.move(state, 'down')
  assert.equal(state.oxygen, 90)
  state.oxygen = 1
  advance(rules, state, 1000)
  assert.equal(state.status, 'respawn')
  assert.equal(state.reason, 'oxygen')
  rules.revive(state)
  state.oxygen = 1; state.lives = 1
  advance(rules, state, 1000)
  assert.equal(state.status, 'lost')
  assert.equal(rules.revive(state), false)
})

test('restore rejects malformed physics, wrong course, old saves and changed walls', () => {
  const rules = create(levels[0])
  const state = rules.initialState(2026)
  rules.move(state, 'down')
  advance(rules, state, 350)
  assert.deepEqual(rules.restore(rules.snapshot(state)), state)
  for (const mutate of [
    saved => { saved.levelId = levels[1].id },
    saved => { saved.grid[0] = '.' },
    saved => { saved.player = -1 },
    saved => { saved.oxygen = NaN },
    saved => { saved.fallAges = { '-1': 5 } },
    saved => { saved.damage = { 0: 4 } },
    saved => { saved.falling = [999999] },
    saved => { saved.status = 'won' },
    saved => { saved.version = 1 }
  ]) {
    const saved = rules.snapshot(state); mutate(saved)
    assert.equal(rules.restore(saved), null)
  }
})

test('time subdivision produces the same state, while death and win freeze time', () => {
  const rules = fixture(['######', '#.P..#', '#ABCD#', '#DCBA#', '#AAAA#', '######'])
  const first = rules.initialState(); const second = rules.initialState()
  rules.move(first, 'down'); rules.move(second, 'down')
  rules.tick(first, 750)
  for (let index = 0; index < 15; index++) rules.tick(second, 50)
  assert.deepEqual(first, second)
  assert.equal(rules.tick(first, Infinity).changed, false)
})

test('mixed falling delays cannot overwrite a slower group beneath', () => {
  const rules = fixture(['######', '#.A.P#', '#.B.C#', '#...D#', '#DDDD#', '######'])
  const state = rules.initialState()
  state.started = true
  state.falling = [8]
  state.fallAges[8] = 50
  const before = state.grid.filter(color => color === 'A' || color === 'B').sort()
  rules.tick(state, 50)
  assert.deepEqual(state.grid.filter(color => color === 'A' || color === 'B').sort(), before)
  assert.equal(state.grid[8], 'A')
  assert.equal(state.grid[14], 'B')
})

test('500m and 1000m generated courses can be completed at a human input rate', () => {
  const { solve } = require('../tools/verify-driller.cjs')
  for (const level of levels) {
    const rules = create(level)
    const { state, replay } = solve(level)
    const replayed = rules.initialState(level.seed)
    for (const action of replay) {
      if (action === 'revive') { rules.revive(replayed); continue }
      if (action !== 'wait') rules.move(replayed, action)
      advance(rules, replayed, 150)
    }
    assert.deepEqual(replayed, state)
    assert.equal(state.status, 'won', `${level.id}: depth ${state.depth}, oxygen ${state.oxygen}, lives ${state.lives}`)
    assert.ok(state.elapsedMs > 10000)
    assert.deepEqual(rules.restore(rules.snapshot(state)), state)
  }
})
