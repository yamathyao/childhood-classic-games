const { test } = require('node:test')
const assert = require('node:assert/strict')
const rules = require('../games/textbattle/rules.js')
const progression = require('../games/textbattle/progression.js')
const report = require('../games/textbattle/report.js')
const { layout } = require('../games/textbattle/layout.js')

function victory(state) {
  state.status = 'won'; state.enemy.hp = 0; state.streak = state.round
}
test('victory offers three distinct, deterministic upgrades and blocks fighting until one is taken', () => {
  const state = rules.initialState(123); victory(state)
  assert.ok(rules.nextRound(state))
  const saved = rules.snapshot(state); const choices = rules.upgradeChoices(state)
  assert.equal(choices.length, 3); assert.equal(new Set(choices.map(item => item.id)).size, 3)
  assert.deepEqual(rules.upgradeChoices(rules.restore(saved)), choices)
  assert.equal(rules.startFight(state), false)
  assert.equal(rules.configure(state, 'stance', 'agile'), false)
  assert.equal(rules.nextRound(state), false)
  assert.equal(rules.chooseUpgrade(state, rules.upgrades.find(item => !choices.includes(item)).id), false)
  assert.deepEqual(state, saved)
  const expected = rules.upgradePreview(state, choices[0].id)
  const originalBase = { ...state.player.base }; const rng = state.rng
  assert.equal(rules.chooseUpgrade(state, choices[0].id), true)
  assert.deepEqual(state.player.stats, expected); assert.equal(state.player.hp, expected.maxHp)
  assert.deepEqual(state.player.base, originalBase); assert.equal(state.rng, rng)
  assert.equal(rules.chooseUpgrade(state, choices[0].id), false)
  assert.equal(rules.configure(state, 'weapon', 'axe'), false)
  assert.equal(rules.configure(state, 'stance', 'agile'), true)
  assert.deepEqual(rules.restore(rules.snapshot(state)), state)
  assert.equal(rules.startFight(state), true)
})
test('a hundred-round challenge never offers capped stats and receives exactly 99 upgrades', () => {
  const state = rules.initialState(6)
  for (let round = 1; round < 100; round++) {
    victory(state); assert.ok(rules.nextRound(state))
    const choices = rules.upgradeChoices(state)
    assert.equal(choices.length, 3)
    for (const item of choices) {
      const key = item.id === 'hp' ? 'maxHp' : item.id
      assert.ok(rules.upgradePreview(state, item.id)[key] > state.player.stats[key])
    }
    const chosen = choices.find(item => ['spd', 'crit', 'dodge'].includes(item.id)) || choices[0]
    rules.chooseUpgrade(state, chosen.id)
    assert.ok(rules.restore(rules.snapshot(state)))
  }
  victory(state)
  assert.equal(rules.nextRound(state), false); assert.equal(rules.upgradeChoices(state).length, 0)
  assert.equal(progression.total(state.progression), 99)
  assert.equal(progression.total(rules.initialState(6).progression), 0)
})
test('progression saves deeply copy data and reject extra, negative or duplicate reward claims', () => {
  const state = rules.initialState(28); victory(state); rules.nextRound(state)
  for (const corrupt of [s => { s.progression.pending = false }, s => { s.progression.counts.hp = 1 },
    s => { s.progression.counts.atk = -1 }, s => { s.progression.counts.spd = 13 },
    s => { s.progression.version = 2 }, s => { s.progression.counts.def = NaN },
    s => { s.status = 'fighting' }]) {
    const save = rules.snapshot(state); corrupt(save); assert.equal(rules.restore(save), null)
  }
  const saved = rules.snapshot(state); saved.progression.counts.hp++
  assert.equal(state.progression.counts.hp, 0)
})
test('older live saves keep exact battle values and receive catch-up growth only after victory', () => {
  const state = rules.initialState(9); delete state.progression; delete state.report
  state.round = 12; state.streak = 11
  state.enemy.stats = rules.stats(state.enemy.base, state.enemy.weapon, 'strong', true, 12)
  state.enemy.hp = state.enemy.stats.maxHp; rules.startFight(state); delete state.report
  const save = rules.snapshot(state); const restored = rules.restore(save)
  assert.ok(restored); assert.equal(restored.progression, undefined); assert.equal(restored.report.complete, false)
  assert.deepEqual(restored.player.stats, save.player.stats); assert.deepEqual(restored.enemy.stats, save.enemy.stats)
  assert.deepEqual(rules.tick(restored, 500), rules.tick(state, 500)); assert.equal(restored.rng, state.rng)
  victory(restored); rules.nextRound(restored)
  assert.equal(progression.total(restored.progression), 11); assert.equal(restored.progression.pending, true)
  rules.chooseUpgrade(restored, rules.upgradeChoices(restored)[0].id)
  assert.equal(progression.total(restored.progression), 12); assert.ok(rules.restore(rules.snapshot(restored)))
})
test('battle reports count actual damage, misses and skills independently of the 80-log limit', () => {
  const state = rules.initialState(23); rules.startFight(state)
  state.player.stats.atk = state.enemy.stats.atk = 1
  state.player.hp = state.enemy.hp = 10000
  const events = rules.tick(state, 60000).concat(rules.tick(state, 60000))
  assert.ok(events.length > 80); assert.equal(state.logs.length, 80)
  assert.deepEqual(state.report, report.fromLogs(events, true))
  const snapshot = rules.snapshot(state); snapshot.report.player.damage++
  assert.notEqual(snapshot.report.player.damage, state.report.player.damage)
  const row = report.fresh()
  report.record(row, { side: 'player', damage: 0, critical: false, dodged: true, skill: 'point' })
  assert.equal(row.player.skills, 1); assert.equal(row.enemy.dodges, 1); assert.equal(row.player.damage, 0)
  report.record(row, { side: 'enemy', damage: 999, critical: true, dodged: false }, 3)
  assert.equal(row.enemy.damage, 3); assert.equal(row.enemy.criticals, 1)
  assert.ok(report.valid(row))
})
test('cumulative reports survive live save restoration and reset at the next battle', () => {
  const state = rules.initialState(8); rules.startFight(state); rules.tick(state, 4000)
  const saved = rules.snapshot(state); const restored = rules.restore(saved)
  assert.deepEqual(restored.report, state.report)
  assert.deepEqual(rules.tick(restored, 1000), rules.tick(state, 1000))
  assert.deepEqual(restored.report, state.report)
  for (const corrupt of [s => { s.report.player.skills = s.report.player.attacks + 1 },
    s => { s.report.enemy.dodges = -1 }, s => { s.report.player.damage = Infinity }]) {
    const bad = rules.snapshot(restored); corrupt(bad); assert.equal(rules.restore(bad), null)
  }
  victory(restored); rules.nextRound(restored)
  assert.deepEqual(restored.report, report.fresh())
})
test('strong opponents appear every five battles without permanent stat jumps', () => {
  const normal = progression.enemyGrowth(4); const strong = progression.enemyGrowth(5); const next = progression.enemyGrowth(6)
  assert.ok(strong.hp > next.hp && next.hp > normal.hp)
  assert.ok(strong.atk > next.atk && next.atk > normal.atk)
  assert.deepEqual(progression.enemyGrowth(1), { hp: 1, atk: 1, def: 1 })
})
test('three symmetric growth cards and actions fit compact phone safe areas', () => {
  for (const [width, height] of [[320, 568], [375, 667], [390, 844]]) {
    const view = layout({ width, height, top: 44, bottom: 34 }); const r = view.growthDialog
    assert.ok(r.y >= 44 && r.y + r.h <= height - 34)
    const rects = [...view.growthCards, view.growthHome, view.growthRestart]
    for (const rect of rects) assert.ok(rect.x >= r.x && rect.x + rect.w <= r.x + r.w && rect.y >= r.y && rect.y + rect.h <= r.y + r.h)
    assert.equal(view.growthCards[0].w, view.growthCards[2].w)
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i]; const b = rects[j]
      assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y)
    }
  }
})
