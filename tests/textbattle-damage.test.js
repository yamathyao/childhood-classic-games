const { test } = require('node:test')
const assert = require('node:assert/strict')
const rules = require('../games/textbattle/rules.js')
const progression = require('../games/textbattle/progression.js')
const report = require('../games/textbattle/report.js')
const strategy = require('../games/textbattle/strategy.js')

// Hand-set stats isolate damage arithmetic; these are not restorable saves.
function duel(weapon = 'sword', targetWeapon = weapon) {
  const state = rules.initialState(123456)
  state.weapon = weapon; state.enemy.weapon = targetWeapon; rules.startFight(state)
  state.player.stats = { maxHp: 200, atk: 30, def: 20, crit: 0, dodge: 0, spd: 1, pierce: 0 }
  state.enemy.stats = { ...state.player.stats }
  state.player.hp = state.enemy.hp = 200
  state.player.cooldown = 0; state.enemy.cooldown = 1000
  state.rng = 123456
  return state
}
const strike = state => rules.tick(state, 1)[0]
const nextRandom = seed => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0 }

test('frozen v8 battles resume exactly and convert only starting rates once on the next victory', () => {
  const fixture = require('./fixtures/textbattle-v8-rates.json')
  const source = structuredClone(fixture); const state = rules.restore(fixture)
  assert.deepEqual(state, fixture)
  rules.tick(state, 3000)
  assert.deepEqual(state, require('./fixtures/textbattle-v8-rates-after.json'))
  assert.deepEqual(rules.restore(rules.snapshot(state)), state)
  const base = { ...state.player.base }; const rng = state.rng
  state.status = 'won'; state.enemy.hp = 0; state.streak = state.round
  assert.ok(rules.nextRound(state)); assert.equal(state.combatVersion, 10)
  assert.deepEqual(state.player.base, { ...base,
    crit: Math.max(5, Math.min(8, 5 + (base.crit - 3) / .8 * .1)),
    dodge: Math.max(5, Math.min(7, 5 + (base.dodge - 2) / .6 * .07)),
    spd: Math.max(.6, Math.min(1.2, .6 + (base.spd - .8) / .022 * .016)) })
  let expectedRng = rng
  for (let i = 0; i < 8; i++) expectedRng = nextRandom(expectedRng)
  assert.equal(state.rng, expectedRng, 'conversion must not consume any extra randomness')
  assert.equal(state.player.name, source.player.name); assert.equal(state.weapon, source.weapon)
  assert.deepEqual(state.progression.counts, source.progression.counts)
  assert.deepEqual(state.progression.qualities, source.progression.qualities)
  assert.deepEqual(state.progression.legacy, { ...source.progression, pending: false })
  assert.ok(rules.restore(rules.snapshot(state)))
  const converted = { ...state.player.base }
  assert.ok(rules.chooseUpgrade(state, rules.upgradeChoices(state)[0].id))
  state.status = 'won'; state.enemy.hp = 0; state.streak = state.round
  assert.ok(rules.nextRound(state))
  assert.deepEqual(state.player.base, converted)
  assert.ok(rules.restore(rules.snapshot(state))); assert.deepEqual(fixture, source)
})

test('normal and critical hits subtract armor after applying the attack multiplier', () => {
  assert.equal(strike(duel()).damage, 10)
  const critical = duel(); critical.player.stats.crit = 100
  const event = strike(critical)
  assert.equal(event.critical, true); assert.equal(event.damage, 34)
  for (const weapon of rules.weapons) assert.equal(strike(duel(weapon.id)).damage, 10)
})
test('high armor has a one-point damage floor while a dodge deals zero', () => {
  const armored = duel(); armored.enemy.stats.def = 100
  assert.equal(strike(armored).damage, 1)
  armored.player.cooldown = 0; armored.enemy.combat.ward = true
  assert.equal(strike(armored).damage, 1)
  const dodged = duel(); dodged.enemy.stats.dodge = 100
  const event = strike(dodged)
  assert.deepEqual([event.damage, event.critical, event.dodged], [0, false, true])
  assert.equal(dodged.enemy.hp, 200)
})
test('landed hits use two random draws and no damage variance; dodges use only one', () => {
  for (const seed of [1, 5000, 123456, 4294967295]) {
    const state = duel(); state.rng = seed
    assert.equal(strike(state).damage, 10)
    assert.equal(state.rng, nextRandom(nextRandom(seed)))
    const missed = duel(); missed.rng = seed; missed.enemy.stats.dodge = 100
    assert.equal(strike(missed).damage, 0)
    assert.equal(missed.rng, nextRandom(seed))
  }
})
test('counter and weapon skill boosts apply to attack; ward reduces the resulting damage', () => {
  const counter = duel('saber', 'sword')
  assert.equal(strike(counter).damage, 13)
  const skill = duel('saber', 'sword'); skill.player.combat.momentum = rules.momentum.max
  assert.equal(strike(skill).damage, Math.round(30 * 1.1 * 1.45 - 20))
  const ward = duel(); ward.enemy.combat.ward = true
  assert.equal(strike(ward).damage, Math.round(10 * .75))
  assert.equal(ward.enemy.combat.ward, false)
})
test('charged skills combine guaranteed hit, critical attack and armor bypass as advertised', () => {
  const sword = duel(); sword.enemy.stats.dodge = 100; sword.player.stats.crit = 100
  sword.player.combat.momentum = rules.momentum.max
  const event = strike(sword)
  assert.equal(event.dodged, false); assert.equal(event.critical, true)
  assert.equal(event.damage, Math.round(30 * 1.8 * 1.15 - 20))
  const axe = duel('axe'); axe.player.stats.crit = 100; axe.enemy.stats.def = 100
  axe.player.combat.momentum = rules.momentum.max
  assert.equal(strike(axe).damage, Math.round(30 * 1.8 * 1.2))
})
test('overkill caps actual damage, battle report and momentum at remaining health', () => {
  const state = duel(); state.enemy.hp = 7
  assert.equal(strike(state).damage, 7)
  assert.equal(state.report.player.damage, 7)
  assert.equal(state.player.combat.momentum, Math.round(7 / 200 * 16000))
  assert.equal(state.enemy.combat.momentum, Math.round(7 / 200 * 11000))
  assert.equal(state.status, 'won'); assert.equal(rules.tick(state, 60000).length, 0)
})
test('frozen v6 battle resumes exactly before migrating its acquired rewards to the current rules', () => {
  const fixture = require('./fixtures/textbattle-v6-growth.json')
  const before = structuredClone(fixture); const state = rules.restore(fixture)
  assert.deepEqual(state, fixture)
  rules.tick(state, 3000)
  assert.deepEqual(state, require('./fixtures/textbattle-v6-growth-after.json'))
  assert.deepEqual(rules.restore(rules.snapshot(state)), state)
  state.status = 'won'; state.enemy.hp = 0; state.streak = state.round
  assert.equal(rules.nextRound(state), true)
  assert.equal(state.combatVersion, 10); assert.equal(state.progression.version, 5)
  assert.deepEqual(state.progression.counts, fixture.progression.counts)
  assert.deepEqual(state.progression.qualities, fixture.progression.qualities)
  assert.ok(rules.restore(rules.snapshot(state)))
  assert.deepEqual(fixture, before)
})
test('v6 pending defense rewards retain their value including legendary strong-enemy guarantees', () => {
  let checked = false; let checkedGuaranteedDefense = false
  for (let seed = 1; seed <= 300 && !checkedGuaranteedDefense; seed++) {
    const state = rules.initialState(seed)
    state.combatVersion = 6; state.progression.version = 3; state.round = 6; state.streak = 5
    const fixture = require('./fixtures/textbattle-v6-growth.json')
    for (const side of ['player', 'enemy']) state[side].base = { ...fixture[side].base }
    for (let n = 0; n < 4; n++) progression.add(state.progression, { id: 'hp', quality: 'normal' })
    state.progression.pending = true; state.report = report.fresh(); strategy.resetCombat(state)
    for (const side of ['player', 'enemy']) {
      const actor = state[side]
      actor.stats = rules.stats(actor.base, side === 'player' ? state.weapon : actor.weapon,
        side === 'player' ? state.stance : 'strong', side === 'enemy', state.round, undefined, state.progression, 6)
      actor.hp = actor.stats.maxHp; actor.cooldown = 1000 / actor.stats.spd
    }
    const restored = rules.restore(rules.snapshot(state)); assert.ok(restored)
    const defense = rules.upgradeChoices(restored).find(item => item.id === 'def')
    if (!defense) continue
    checked = true
    assert.equal(defense.amount, 2 * defense.multiplier)
    checkedGuaranteedDefense ||= defense.quality === 'legendary'
    const before = progression.apply(restored.player.base, restored.progression).def
    const preview = rules.upgradePreview(restored, 'def')
    assert.ok(rules.chooseUpgrade(restored, 'def'))
    assert.equal(progression.apply(restored.player.base, restored.progression).def - before, defense.amount)
    assert.deepEqual(restored.player.stats, preview); assert.ok(rules.restore(rules.snapshot(restored)))
  }
  assert.ok(checked); assert.ok(checkedGuaranteedDefense)
})
test('weapon skill descriptions match the damage rules of current and legacy battles', () => {
  assert.equal(rules.weaponSkill('saber', 7).description, '攻击+45%。')
  assert.equal(rules.weaponSkill('saber', 6).description, '伤害+45%。')
  assert.equal(rules.weaponSkill('spear', 8).description, '本次不减对方防御。')
  assert.ok(rules.weaponSkill('spear', 7).description.includes('闪避判定减半'))
})
test('every weapon skill affects a single attack, leaves defense intact and can charge again', () => {
  for (const weapon of rules.weapons) {
    const state = duel(weapon.id); state.player.combat.momentum = rules.momentum.max
    const special = strike(state)
    assert.equal(special.skill, rules.weaponSkill(weapon.id).id)
    assert.equal(state.enemy.stats.def, 20)
    assert.ok(state.player.combat.momentum < rules.momentum.max)
    state.player.cooldown = 0
    const normal = strike(state)
    assert.equal(normal.skill, undefined); assert.equal(normal.damage, 10)
    assert.equal(state.enemy.stats.def, 20)
    assert.equal(state.enemy.hp, 200 - special.damage - normal.damage)
    state.player.combat.momentum = rules.momentum.max; state.player.cooldown = 0
    assert.equal(strike(state).skill, special.skill)
  }
})
test('frozen v7 spear combat keeps passive pierce, skill precision and RNG until the next round', () => {
  const fixture = require('./fixtures/textbattle-v7-spear.json')
  const source = structuredClone(fixture); const state = rules.restore(fixture)
  assert.deepEqual(state, fixture); assert.equal(state.player.stats.pierce, .2)
  rules.tick(state, 3000)
  assert.deepEqual(state, require('./fixtures/textbattle-v7-spear-after.json'))
  assert.ok(rules.restore(rules.snapshot(state)))
  state.status = 'won'; state.enemy.hp = 0; state.streak = state.round
  assert.ok(rules.nextRound(state))
  assert.equal(state.combatVersion, 10)
  assert.equal(state.player.stats.pierce, 0); assert.equal(state.enemy.stats.pierce, 0)
  assert.deepEqual(state.progression.counts, source.progression.counts)
  assert.deepEqual(state.progression.qualities, source.progression.qualities)
  assert.deepEqual(state.progression.legacy, { ...source.progression, pending: false })
  assert.ok(rules.restore(rules.snapshot(state)))
  assert.deepEqual(fixture, source)
})
