const { test } = require('node:test')
const assert = require('node:assert/strict')
const rules = require('../games/textbattle/rules.js')
const progression = require('../games/textbattle/progression.js')
const report = require('../games/textbattle/report.js')
const { layout } = require('../games/textbattle/layout.js')

function victory(state) {
  state.status = 'won'; state.enemy.hp = 0; state.streak = state.round
}
test('ordinary opponents follow the previous strong opponent and every fifth reflects all confirmed upgrades', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const state = rules.initialState(Math.imul(seed, 2654435761) >>> 0)
    rules.reroll(state)
    const initial = { ...state.player.base }
    let lastStrong = null
    for (let round = 1; round <= 20; round++) {
      for (const key of ['maxHp', 'atk', 'def', 'crit', 'dodge', 'spd']) {
        const delta = Math.abs(state.enemy.base[key] - initial[key])
        assert.ok(delta <= initial[key] * .08 + (['maxHp', 'atk', 'def'].includes(key) ? .5 : 1e-10))
      }
      const plain = rules.stats(state.enemy.base, state.enemy.weapon, 'strong', true, 1)
      if (round > 5 && round % 5 !== 0) {
        assert.deepEqual(state.enemy.reference, lastStrong)
        for (const key of ['maxHp', 'atk', 'def', 'crit', 'dodge', 'spd']) {
          const delta = Math.abs(state.enemy.stats[key] - lastStrong[key])
          assert.ok(delta <= lastStrong[key] * .08 + (['maxHp', 'atk', 'def'].includes(key) ? .5 : 1e-10), `${round}/${key}`)
        }
      } else {
        const expected = round % 5 === 0 ? progression.apply(plain, state.progression) : plain
        assert.deepEqual(state.enemy.stats, expected)
        if (round % 5 === 0) lastStrong = { ...state.enemy.stats }
      }
      const enemy = structuredClone(state.enemy); const rng = state.rng
      assert.ok(rules.configure(state, 'stance', 'agile'))
      assert.deepEqual(state.enemy, enemy); assert.equal(state.rng, rng)
      assert.ok(rules.restore(rules.snapshot(state)))
      if (round < 20) {
        victory(state); assert.ok(rules.nextRound(state))
        const options = rules.upgradeChoices(state)
        const chosen = options.find(item => item.id === 'atk') || options[0]
        const preview = rules.upgradePreview(state, chosen.id)
        const beforeRng = state.rng; const beforeEnemy = structuredClone(state.enemy)
        assert.ok(rules.chooseUpgrade(state, chosen.id)); assert.deepEqual(state.player.stats, preview)
        assert.equal(state.rng, beforeRng); assert.equal(state.enemy.weapon, beforeEnemy.weapon)
        if (state.round % 5 !== 0) assert.deepEqual(state.enemy, beforeEnemy)
      }
    }
  }
})
test('strong-opponent baselines survive reload, isolate snapshots and reject malformed saves', () => {
  const state = rules.initialState(123)
  while (state.round < 6) {
    victory(state); rules.nextRound(state)
    rules.chooseUpgrade(state, rules.upgradeChoices(state)[0].id)
  }
  const saved = rules.snapshot(state)
  assert.deepEqual(rules.restore(saved), state)
  saved.enemy.reference.atk++
  assert.notEqual(saved.enemy.reference.atk, state.enemy.reference.atk)
  for (const mutate of [s => { s.enemy.reference = null }, s => { s.enemy.reference.spd = Infinity },
    s => { delete s.enemy.reference.maxHp }, s => { s.enemy.reference.crit = 61 },
    s => { s.enemy.stats.atk++ }]) {
    const invalid = rules.snapshot(state); mutate(invalid)
    assert.equal(rules.restore(invalid), null)
  }
  const restored = rules.restore(rules.snapshot(state))
  rules.startFight(restored); rules.startFight(state)
  assert.deepEqual(rules.tick(restored, 3000), rules.tick(state, 3000))
  assert.deepEqual(restored, state)
  // Saves created before the fix have no baseline. Resume their ongoing fight
  // exactly; the next strong opponent supplies the new baseline on progression.
  const legacy = rules.snapshot(state); delete legacy.enemy.reference
  legacy.status = 'prepare'; legacy.logs = []; legacy.report = report.fresh(); legacy.elapsedMs = 0
  require('../games/textbattle/strategy.js').resetCombat(legacy)
  legacy.enemy.stats = rules.stats(legacy.enemy.base, legacy.enemy.weapon, 'strong', true, legacy.round, undefined, legacy.progression)
  for (const actor of [legacy.player, legacy.enemy]) { actor.hp = actor.stats.maxHp; actor.cooldown = 1000 / actor.stats.spd }
  assert.deepEqual(rules.restore(legacy), legacy)
})

test('fixed rewards use exact grade values, honor caps and suppress exhausted types', () => {
  const tables = { atk: [1, 2, 3, 5], hp: [10, 20, 30, 50], def: [1, 2, 3, 5],
    spd: [.04, .08, .12, .2], crit: [2, 4, 6, 10], dodge: [2, 4, 6, 10] }
  for (const [id, amounts] of Object.entries(tables)) {
    assert.deepEqual(rules.upgradeQualities.map(q => progression.fixedAmounts[id][q.id]), amounts)
  }
  const state = pendingReward(79, 60)
  for (const option of rules.upgradeChoices(state)) {
    if (['hp', 'def'].includes(option.id)) assert.ok(progression.units(state.progression)[option.id] < progression.fixedLimits[option.id])
  }
  const growth = progression.fresh()
  for (let i = 0; i < 20; i++) for (const id of ['hp', 'def']) progression.add(growth, { id, quality: 'legendary' })
  const result = progression.apply({ maxHp: 210, atk: 20, def: 8, spd: 1, crit: 7, dodge: 6 }, growth)
  assert.equal(result.maxHp, 410); assert.equal(result.def, 14)
  const { growthCardRects } = require('../games/textbattle/layout.js')
  const view = layout({ width: 320, height: 568, top: 44, bottom: 34 })
  assert.equal(growthCardRects(view, 1)[0].y, view.growthCards[1].y)
  assert.equal(growthCardRects(view, 2)[0].y + 82, growthCardRects(view, 2)[1].y)
})
test('frozen v9 saves resume exactly, retain earned bonuses and only add new fixed rewards after migration', () => {
  const fixture = require('./fixtures/textbattle-v9-growth.json')
  const source = structuredClone(fixture); const state = rules.restore(fixture)
  assert.deepEqual(state, fixture); rules.tick(state, 3000)
  assert.deepEqual(state, require('./fixtures/textbattle-v9-growth-after.json'))
  const before = { ...state.player.stats }; victory(state); assert.ok(rules.nextRound(state))
  assert.equal(state.combatVersion, 10); assert.equal(state.progression.version, 5)
  assert.deepEqual(state.player.stats, before)
  assert.deepEqual(state.progression.legacy, { ...source.progression, pending: false })
  const choices = rules.upgradeChoices(state); const item = choices[0]
  const key = item.id === 'hp' ? 'maxHp' : item.id
  const expected = rules.upgradePreview(state, item.id); const rng = state.rng
  assert.ok(rules.chooseUpgrade(state, item.id)); assert.equal(state.rng, rng)
  assert.deepEqual(state.player.stats, expected)
  assert.ok(Math.abs(state.player.stats[key] - before[key] - item.amount) < 1e-10)
  assert.ok(rules.restore(rules.snapshot(state)))
  for (const mutate of [s => { s.progression.legacy.counts.atk = 100 },
    s => { delete s.progression.legacy.counts }, s => { s.progression.legacy.pending = true },
    s => { s.progression.legacy.legacy = {} }, s => { s.progression.legacy.version = 5 }]) {
    const bad = rules.snapshot(state); mutate(bad); assert.equal(rules.restore(bad), null)
  }
  assert.deepEqual(fixture, source)
})
test('late epic critical damage stays bounded by target health and restores correctly', () => {
  const state = rules.initialState(12); state.round = 100; state.streak = 99
  state.progression.counts.atk = 99; state.progression.qualities.epic.atk = 99
  state.player.base.atk = 25; state.player.base.crit = 8; state.enemy.base.def = 4; state.enemy.base.maxHp = 260
  state.weapon = 'saber'; state.stance = 'strong'; state.enemy.weapon = 'sword'
  state.player.stats = rules.stats(state.player.base, state.weapon, state.stance, null, state.round, rules.weapons, state.progression)
  state.enemy.stats = rules.stats(state.enemy.base, state.enemy.weapon, 'strong', true, state.round, rules.weapons, state.progression)
  for (const actor of [state.player, state.enemy]) {
    actor.hp = actor.stats.maxHp; actor.cooldown = 1000 / actor.stats.spd
  }
  rules.startFight(state); state.player.combat.momentum = rules.momentum.max
  state.rng = 123456; state.player.cooldown = 0; state.enemy.cooldown = 1000 / state.enemy.stats.spd
  assert.ok(rules.restore(rules.snapshot(state)))
  const hp = state.enemy.hp
  assert.ok(rules.tick(state, 1000).some(event => event.damage === hp && event.critical && event.skill === 'saber-cleave'))
  assert.deepEqual(rules.restore(rules.snapshot(state)), state)
  const invalid = rules.snapshot(state)
  invalid.logs.find(event => event.side === 'player').damage = state.enemy.stats.maxHp + 1
  assert.equal(rules.restore(invalid), null)
})
test('victory offers three distinct, deterministic upgrades and blocks fighting until one is taken', () => {
  const state = rules.initialState(123); victory(state)
  assert.ok(rules.nextRound(state))
  const saved = rules.snapshot(state); const choices = rules.upgradeChoices(state)
  assert.equal(choices.length, 3); assert.equal(new Set(choices.map(item => item.id)).size, 3)
  assert.deepEqual(rules.upgradeChoices(rules.restore(saved)), choices)
  assert.equal(rules.startFight(state), false)
  assert.equal(rules.configure(state, 'stance', 'agile'), false)
  assert.equal(rules.nextRound(state), false)
  assert.equal(rules.chooseUpgrade(state, rules.upgrades.find(item => !choices.some(choice => choice.id === item.id)).id), false)
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
    assert.ok(choices.length >= 1 && choices.length <= 3)
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
    s => { s.progression.version = 6 }, s => { s.progression.counts.def = NaN },
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
    const rects = [...view.growthCards, ...view.growthOwned, view.growthHome, view.growthRestart, view.growthConfirm]
    for (const rect of rects) assert.ok(rect.x >= r.x && rect.x + rect.w <= r.x + r.w && rect.y >= r.y && rect.y + rect.h <= r.y + r.h)
    assert.equal(view.growthCards[0].w, view.growthCards[2].w)
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i]; const b = rects[j]
      assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y)
    }
  }
})

test('quality probabilities are stable across a large seed sample and never consume battle RNG', () => {
  const counts = Object.fromEntries(rules.upgradeQualities.map(item => [item.id, 0]))
  for (let seed = 1; seed <= 12000; seed++) {
    const state = rules.initialState(Math.imul(seed, 2654435761) >>> 0)
    victory(state); rules.nextRound(state)
    const rng = state.rng; const snapshot = rules.snapshot(state)
    const options = rules.upgradeChoices(state)
    assert.deepEqual(rules.upgradeChoices(rules.restore(snapshot)), options)
    assert.equal(state.rng, rng)
    assert.equal(new Set(options.map(item => item.id)).size, 3)
    for (const item of options) counts[item.quality]++
  }
  for (const quality of rules.upgradeOdds({ streak: 1, progression: { version: 3 } }).qualities) {
    assert.ok(Math.abs(counts[quality.id] / 36000 * 100 - quality.probability) < 1, JSON.stringify(counts))
  }
})

function pendingReward(seed, streak) {
  const state = rules.initialState(seed)
  for (let win = 1; win <= streak; win++) {
    victory(state); assert.ok(rules.nextRound(state))
    if (win < streak) {
      const options = rules.upgradeChoices(state)
      const chosen = options.find(item => ['spd', 'crit', 'dodge'].includes(item.id)) || options[0]
      assert.ok(rules.chooseUpgrade(state, chosen.id))
    }
  }
  return state
}

test('legendary natural odds grow monotonically, retain the standard ratio and stay below epic', () => {
  let previous = 0
  for (let streak = 1; streak <= 200; streak++) {
    const policy = rules.upgradeOdds({ streak, progression: { version: 3 } })
    const [normal, fine, epic, legendary] = policy.qualities.map(item => item.probability)
    assert.ok(legendary >= previous && legendary <= 3 && legendary < epic)
    assert.ok(Math.abs(normal + fine + epic + legendary - 100) < 1e-10)
    assert.ok(Math.abs(normal / fine - 70 / 25) < 1e-10)
    assert.ok(Math.abs(fine / epic - 25 / 5) < 1e-10)
    assert.equal(policy.guaranteed, streak % 5 === 0)
    previous = legendary
  }
  assert.equal(rules.upgradeOdds({ streak: 1 }).qualities[3].probability, .2)
  assert.equal(rules.upgradeOdds({ streak: 100 }).qualities[3].probability, 3)
})

test('strong-enemy rewards guarantee legendary with capped types excluded and cannot reroll or claim twice', () => {
  const slots = new Set()
  for (const streak of [5, 10, 95]) for (let seed = 1; seed <= 120; seed++) {
    const state = pendingReward(seed, streak)
    const before = rules.snapshot(state); const options = rules.upgradeChoices(state)
    const index = options.findIndex(item => item.quality === 'legendary')
    assert.ok(index >= 0, `${streak}/${seed}`); slots.add(index)
    assert.ok(options.length >= 1 && options.length <= 3); assert.equal(new Set(options.map(item => item.id)).size, options.length)
    for (const item of options) assert.ok(state.progression.counts[item.id] < rules.upgrades.find(upgrade => upgrade.id === item.id).cap)
    assert.deepEqual(rules.upgradeChoices(rules.restore(before)), options)
    assert.deepEqual(state, before)
    const expected = rules.upgradePreview(state, options[index].id)
    assert.ok(rules.chooseUpgrade(state, options[index].id))
    assert.deepEqual(state.player.stats, expected); assert.equal(state.rng, before.rng)
    assert.equal(rules.chooseUpgrade(state, options[index].id), false)
    assert.ok(rules.restore(rules.snapshot(state)))
    if (streak === 95) assert.ok(options.every(item => !['spd', 'crit', 'dodge'].includes(item.id)))
  }
  assert.equal(slots.size, 3, 'the guarantee must not always occupy the same card')
  for (const streak of [1, 4, 6, 99]) {
    assert.equal(rules.upgradeOdds(pendingReward(29, streak)).guaranteed, false)
  }
})

test('late natural legendary frequencies remain below epic outside strong-enemy guarantees', () => {
  const template = pendingReward(42, 99)
  const counts = Object.fromEntries(rules.upgradeQualities.map(item => [item.id, 0]))
  for (let seed = 1; seed <= 12000; seed++) {
    const state = { ...template, runId: Math.imul(seed, 2654435761) >>> 0 }
    for (const item of rules.upgradeChoices(state)) counts[item.quality]++
  }
  const policy = rules.upgradeOdds(template)
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
  for (const quality of policy.qualities) assert.ok(Math.abs(counts[quality.id] / total * 100 - quality.probability) < 1, JSON.stringify(counts))
  assert.ok(counts.legendary < counts.epic)
})

test('all 24 upgrade variants grant the advertised bonus, keep health full and survive reload', () => {
  const samples = new Map()
  for (let seed = 1; seed < 12000 && samples.size < 24; seed++) {
    const state = rules.initialState(seed); victory(state); rules.nextRound(state)
    for (const item of rules.upgradeChoices(state)) samples.set(`${item.id}/${item.quality}`, { state: rules.snapshot(state), item })
  }
  assert.equal(samples.size, 24)
  for (const { state, item } of samples.values()) {
    const before = { ...state.player.stats }; const preview = rules.upgradePreview(state, item.id)
    const rng = state.rng
    assert.ok(rules.chooseUpgrade(state, item.id))
    assert.equal(state.rng, rng); assert.equal(state.progression.qualities[item.quality][item.id], 1)
    assert.deepEqual(state.player.stats, preview); assert.equal(state.player.hp, preview.maxHp)
    const key = item.id === 'hp' ? 'maxHp' : item.id
    const actual = state.player.stats[key] - before[key]
    const weapon = rules.weapons.find(weapon => weapon.id === state.weapon)
    const stance = rules.stances.find(stance => stance.id === state.stance)
    const expected = item.amount
    assert.ok(Math.abs(actual - expected) < 1e-10, `${item.id}/${item.quality}`)
    const owned = rules.ownedUpgrades(state.progression)[0]
    assert.equal(owned.id, item.id); assert.equal(owned.quality, item.quality); assert.equal(owned.count, 1)
    assert.deepEqual(rules.restore(rules.snapshot(state)), state)
    assert.equal(rules.chooseUpgrade(state, item.id), false)
  }
})

test('quality totals, snapshot isolation, capped attributes and owned icon breakdown stay consistent', () => {
  const state = rules.initialState(28); victory(state); rules.nextRound(state)
  for (const corrupt of [s => { s.progression.qualities.fine.hp = 1 }, s => { s.progression.qualities.epic.atk = -1 },
    s => { s.progression.qualities.normal = null }, s => { delete s.progression.qualities.epic },
    s => { s.progression.qualities.normal.def = .5 }, s => { s.progression.qualities = [] },
    s => { delete s.progression.qualities.legendary }, s => { s.progression.qualities.legendary.hp = -1 },
    s => { s.progression.qualities.legendary.hp = 1 }]) {
    const save = rules.snapshot(state); corrupt(save); assert.equal(rules.restore(save), null)
  }
  const save = rules.snapshot(state); save.progression.qualities.normal.hp++
  assert.equal(state.progression.qualities.normal.hp, 0)
  const growth = progression.fresh()
  for (const quality of rules.upgradeQualities) progression.add(growth, { id: 'crit', quality: quality.id })
  const owned = rules.ownedUpgrades(growth)[0]
  assert.deepEqual(owned.breakdown, [1, 1, 1, 1]); assert.equal(owned.quality, 'legendary'); assert.equal(owned.count, 4)
  for (let i = 0; i < 8; i++) for (const id of ['spd', 'dodge']) progression.add(growth, { id, quality: 'epic' })
  const stats = progression.apply({ maxHp: 210, atk: 25, def: 15, spd: 3, crit: 55, dodge: 40 }, growth)
  assert.ok(Math.abs(stats.spd - 3.96) < 1e-10); assert.equal(stats.crit, 60); assert.equal(stats.dodge, 45)
})

test('fixed growth grants identical attack bonuses across weapons and caps defense while retaining stance differences', () => {
  const base = { maxHp: 210, atk: 20, def: 10, spd: 1.2, crit: 20, dodge: 12 }
  const growth = progression.fresh()
  for (let i = 0; i < 20; i++) for (const id of ['atk', 'def']) progression.add(growth, { id, quality: 'normal' })
  const strong = rules.stats(base, 'sword', 'strong', null, 41, undefined, growth)
  const guard = rules.stats(base, 'sword', 'guard', null, 41, undefined, growth)
  assert.ok(strong.atk > guard.atk)
  assert.equal(guard.def, Math.round(base.def * 1.6) + 6)
  assert.equal(strong.def, Math.round(base.def * .75) + 6)
  assert.equal(strong.maxHp, guard.maxHp)
  const extraOutput = weapon => {
    const before = rules.stats(base, weapon, 'strong', null)
    const after = rules.stats(base, weapon, 'strong', null, 41, undefined, growth)
    return after.atk - before.atk
  }
  assert.equal(extraOutput('dual'), extraOutput('saber'))
  const maxGrowth = progression.fresh()
  for (const id of ['spd', 'crit', 'dodge']) for (let i = 0; i < rules.upgrades.find(item => item.id === id).cap; i++) {
    progression.add(maxGrowth, { id, quality: 'epic' })
  }
  for (const weapon of rules.weapons) for (const stance of rules.stances) {
    const actor = rules.stats(base, weapon.id, stance.id, null, 1, undefined, maxGrowth)
    assert.ok(actor.spd <= 4); assert.ok(actor.crit <= 60); assert.ok(actor.dodge <= 45)
  }
})

test('saved v5 quality battles keep old equipment, stance, cooldowns and RNG until advancing to the new rules', () => {
  const fixture = require('./fixtures/textbattle-v5-quality-agile.json')
  const source = structuredClone(fixture)
  const restored = rules.restore(fixture); const control = structuredClone(fixture)
  assert.deepEqual(restored, control); assert.equal(restored.combatVersion, 5)
  assert.deepEqual(rules.tick(restored, 1000), rules.tick(control, 1000))
  assert.deepEqual(restored, control); assert.ok(rules.restore(rules.snapshot(restored)))
  victory(restored); rules.nextRound(restored)
  assert.equal(restored.combatVersion, 10)
  assert.deepEqual(restored.progression.counts, fixture.progression.counts)
  for (const id of ['normal', 'fine', 'epic']) assert.deepEqual(restored.progression.qualities[id], fixture.progression.qualities[id])
  assert.ok(Object.values(restored.progression.qualities.legendary).every(count => count === 0))
  assert.ok(restored.progression.pending)
  assert.ok(rules.restore(rules.snapshot(restored)))
  assert.deepEqual(fixture, source)
  const corrupt = rules.snapshot(restored); corrupt.combatVersion = 11
  assert.equal(rules.restore(corrupt), null)
  for (const status of ['prepare', 'won', 'lost']) {
    const save = structuredClone(fixture)
    save.status = status; save.streak = save.round - (status === 'won' ? 0 : 1)
    if (status === 'prepare') {
      save.logs = []; save.elapsedMs = 0; save.report = report.fresh()
      require('../games/textbattle/strategy.js').resetCombat(save)
      for (const actor of [save.player, save.enemy]) { actor.hp = actor.stats.maxHp; actor.cooldown = 1000 / actor.stats.spd }
    } else save[status === 'won' ? 'enemy' : 'player'].hp = 0
    assert.deepEqual(rules.restore(save), save)
  }
})

test('pending three-quality rewards keep their old distribution, then enable legendary on the next victory', () => {
  const pending = structuredClone(require('./fixtures/textbattle-v5-quality-agile.json'))
  pending.status = 'prepare'; pending.round++; pending.streak++; pending.progression.pending = true
  pending.elapsedMs = 0; pending.logs = []; pending.report = report.fresh()
  require('../games/textbattle/strategy.js').resetCombat(pending)
  for (const side of ['player', 'enemy']) {
    const actor = pending[side]
    actor.stats = rules.stats(actor.base, side === 'player' ? pending.weapon : actor.weapon,
      side === 'player' ? pending.stance : 'strong', side === 'enemy', pending.round, undefined, pending.progression, 5)
    actor.hp = actor.stats.maxHp; actor.cooldown = 1000 / actor.stats.spd
  }
  assert.deepEqual(rules.restore(pending), pending)
  const options = rules.upgradeChoices(pending)
  assert.ok(options.every(item => item.quality !== 'legendary'))
  assert.deepEqual(rules.upgradeOdds(pending).qualities.map(item => item.probability), [70, 25, 5])
  const poisoned = rules.snapshot(pending)
  poisoned.progression.qualities.legendary = Object.fromEntries(rules.upgrades.map(item => [item.id, 0]))
  assert.equal(rules.restore(poisoned), null)
  assert.ok(rules.chooseUpgrade(pending, options[0].id))
  assert.equal(pending.progression.version, 2); assert.ok(rules.restore(pending))
  const counts = { ...pending.progression.counts }
  victory(pending); rules.nextRound(pending)
  assert.equal(pending.progression.version, 5)
  assert.deepEqual(pending.progression.counts, counts)
  assert.ok(Object.values(pending.progression.qualities.legendary).every(count => count === 0))
  assert.ok(rules.restore(pending))
})

test('original single-quality v5 saves preserve agile stats and pending rewards before migrating', () => {
  // Frozen with the committed rules, rather than the implementation under test.
  const fixture = require('./fixtures/textbattle-v5-original-agile.json')
  const restored = rules.restore(fixture); const control = structuredClone(fixture)
  assert.deepEqual(restored, fixture)
  assert.deepEqual(rules.tick(restored, 1000), rules.tick(control, 1000))
  assert.deepEqual(restored, control)
  assert.deepEqual(restored, require('./fixtures/textbattle-v5-original-after.json'))
  assert.equal(rules.relation('saber', 'sword', restored.combatVersion, restored.progression.version).scale, 1.18)
  assert.ok(rules.restore(rules.snapshot(restored)))
  const reward = require('./fixtures/textbattle-v5-original-reward.json')
  const pending = rules.restore(reward)
  assert.deepEqual(pending, reward)
  assert.ok(rules.upgradeChoices(pending).every(item => item.quality === 'normal'))
  const choice = rules.upgradeChoices(pending)[0]
  const expected = rules.upgradePreview(pending, choice.id)
  assert.equal(rules.chooseUpgrade(pending, choice.id), true)
  assert.deepEqual(pending.player.stats, expected)
  assert.equal(pending.progression.version, 1)
  assert.equal(rules.configure(pending, 'stance', 'guard'), true)
  assert.equal(rules.configure(pending, 'stance', 'agile'), true)
  assert.equal(pending.player.stats.spd,
    rules.stats(pending.player.base, pending.weapon, 'agile', null, pending.round, undefined, pending.progression, 4).spd)
  assert.ok(rules.restore(rules.snapshot(pending)))
  victory(restored); rules.nextRound(restored)
  assert.equal(restored.combatVersion, 10); assert.equal(restored.progression.version, 5)
  assert.deepEqual(restored.progression.qualities.normal, fixture.progression.counts)
  assert.ok(rules.restore(rules.snapshot(restored)))
})

test('pre-quality growth saves keep exact stats, RNG and pending rewards until the next victory', () => {
  const state = rules.initialState(57)
  state.round = 6; state.streak = 5
  state.progression = { version: 1, pending: false, counts: { atk: 1, hp: 1, def: 1, spd: 1, crit: 1, dodge: 0 } }
  state.player.stats = rules.stats(state.player.base, state.weapon, state.stance, null, state.round, rules.weapons, state.progression)
  state.enemy.stats = rules.stats(state.enemy.base, state.enemy.weapon, 'strong', true, state.round, rules.weapons, state.progression)
  for (const side of ['player', 'enemy']) { state[side].hp = state[side].stats.maxHp; state[side].cooldown = 1000 / state[side].stats.spd }
  rules.startFight(state); rules.tick(state, 1000)
  const restored = rules.restore(rules.snapshot(state))
  assert.deepEqual(restored, state)
  assert.deepEqual(rules.tick(restored, 1000), rules.tick(state, 1000))
  victory(restored); rules.nextRound(restored)
  assert.equal(restored.progression.version, 5)
  assert.deepEqual(restored.progression.qualities.normal, state.progression.counts)
  assert.deepEqual(restored.player.stats, rules.stats(restored.player.base, restored.weapon, restored.stance,
    null, restored.round, undefined, restored.progression, 10))
  assert.equal(restored.player.stats.def, Math.round((state.player.base.def + 2) * 1.6))
  assert.ok(rules.restore(rules.snapshot(restored)))
  const pending = rules.snapshot(state)
  pending.status = 'prepare'; pending.progression.pending = true; pending.progression.counts.crit = 0
  pending.logs = []; pending.elapsedMs = 0; pending.report = report.fresh()
  require('../games/textbattle/strategy.js').resetCombat(pending)
  pending.player.stats = rules.stats(pending.player.base, pending.weapon, pending.stance, null, pending.round, rules.weapons, pending.progression)
  for (const side of ['player', 'enemy']) { pending[side].hp = pending[side].stats.maxHp; pending[side].cooldown = 1000 / pending[side].stats.spd }
  assert.ok(rules.restore(pending))
  assert.ok(rules.upgradeChoices(pending).every(item => item.quality === 'normal'))
  rules.chooseUpgrade(pending, rules.upgradeChoices(pending)[0].id)
  assert.equal(pending.progression.version, 1); assert.ok(rules.restore(pending))
})
