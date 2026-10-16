const { test } = require('node:test')
const assert = require('node:assert/strict')
const rules = require('../games/textbattle/rules.js')
const { catalog: enemyCatalog } = require('../games/textbattle/enemy-names.js')

function duel(enemyWeapon, weapon = 'sword', combatVersion = 18) {
  let state
  for (let seed = 1; seed < 400; seed++) {
    state = rules.initialState(seed)
    if (state.enemy.weapon === enemyWeapon) break
  }
  assert.equal(state.enemy.weapon, enemyWeapon)
  rules.configure(state, 'weapon', weapon); rules.startFight(state)
  if (combatVersion !== 18) {
    state.combatVersion = combatVersion
    for (const side of ['player', 'enemy']) {
      const actor = state[side]
      actor.stats = rules.stats(actor.base, side === 'player' ? weapon : enemyWeapon,
        side === 'player' ? state.stance : 'strong', side === 'enemy', state.round, undefined, state.progression, combatVersion)
      actor.hp = actor.stats.maxHp; actor.cooldown = 1000 / actor.stats.spd
    }
  }
  return state
}
function strike(state, side) {
  const target = side === 'player' ? 'enemy' : 'player'
  state[target].cooldown = 1000 / state[target].stats.spd; state[side].cooldown = 0
  return rules.tick(state, 1)[0]
}
function oldBattle(version = 4, combatVersion = 3) {
  const state = rules.initialState(10)
  state.version = version; state.combatVersion = combatVersion
  const fixture = require('./fixtures/textbattle-v5-original-agile.json')
  for (const side of ['player', 'enemy']) state[side].base = { ...fixture[side].base }
  delete state.progression
  if (combatVersion === 2) state.skill = 'renew'
  state.status = 'fighting'; state.enemy.kind = 'brute'; state.enemy.name = '荒原力士'; state.enemy.weapon = 'axe'
  state.player.stats = rules.stats(state.player.base, state.weapon, state.stance, null, state.round, undefined, undefined, combatVersion)
  state.player.hp = state.player.stats.maxHp; state.player.cooldown = 1000 / state.player.stats.spd
  state.enemy.stats = rules.stats(state.enemy.base, 'axe', 'strong', 'brute', state.round, undefined, undefined, combatVersion)
  state.enemy.hp = state.enemy.stats.maxHp; state.enemy.cooldown = 1000 / state.enemy.stats.spd
  return state
}

test('legacy weapon ring has exactly one counter and one nemesis per weapon, with no reciprocal counters', () => {
  const expected = { sword: 'dual', dual: 'axe', axe: 'halberd', halberd: 'spear', spear: 'saber', saber: 'sword' }
  for (const weapon of rules.weapons) {
    let wins = 0; let losses = 0; let neutrals = 0
    for (const enemy of rules.weapons) {
      const match = rules.relation(weapon.id, enemy.id, 12)
      if (expected[weapon.id] === enemy.id) {
        wins++; assert.equal(match.counter, true); assert.equal(match.disadvantaged, false)
        assert.equal(match.name, '专属克制'); assert.equal(match.symbol, '→'); assert.equal(match.scale, 1.1)
      } else if (expected[enemy.id] === weapon.id) {
        losses++; assert.equal(match.counter, false); assert.equal(match.disadvantaged, true)
        assert.equal(match.name, '被克制'); assert.equal(match.symbol, '←'); assert.equal(match.scale, 1)
      } else {
        neutrals++; assert.equal(match.name, '势均力敌'); assert.equal(match.symbol, '=')
        assert.equal(match.counter, false); assert.equal(match.disadvantaged, false); assert.equal(match.scale, 1)
      }
    }
    assert.deepEqual([wins, losses, neutrals], [1, 1, 4])
  }
})

test('actual damage follows weapon matchups symmetrically without occupational modifiers', () => {
  for (const weapon of rules.weapons) for (const enemy of rules.weapons) for (const side of ['player', 'enemy']) {
    const state = duel(enemy.id, weapon.id)
    const target = side === 'player' ? 'enemy' : 'player'
    state[target].stats.dodge = 0; state[side].stats.crit = 0
    const attack = state[side].stats.atk
    const armor = state[target].stats.def
    const actual = strike(state, side)
    const match = rules.relation(side === 'player' ? weapon.id : enemy.id, side === 'player' ? enemy.id : weapon.id)
    assert.equal(actual.counter, false); assert.equal(match.scale, 1); assert.equal(actual.guarded, false); assert.equal(actual.trait, undefined)
    assert.equal(actual.damage, Math.max(1, Math.round(attack - armor)), `${weapon.id}/${enemy.id}/${side}`)
  }
})

test('all current weapon pairs are neutral, while v12 active saves retain their damage until the next fight', () => {
  for (const weapon of rules.weapons) for (const enemy of rules.weapons) {
    assert.equal(rules.counters(weapon.id, enemy.id), false)
    assert.deepEqual(rules.relation(weapon.id, enemy.id), {
      name: '势均力敌', symbol: '=', scale: 1, counter: false, disadvantaged: false
    })
  }
  const old = duel('dual', 'sword', 12)
  const saved = rules.snapshot(old); const restored = rules.restore(saved)
  assert.deepEqual(restored, saved)
  assert.deepEqual(rules.tick(restored, 3500), rules.tick(old, 3500))
  assert.deepEqual(restored, old); assert.equal(restored.combatVersion, 12)
  assert.ok(restored.logs.some(event => event.side === 'player' && event.counter))
  const prepared = duel('dual', 'sword', 12); prepared.status = 'prepare'
  const migrated = rules.restore(prepared)
  assert.equal(migrated.combatVersion, 18); assert.equal(migrated.rng, prepared.rng)
  assert.deepEqual(migrated.player.stats, prepared.player.stats)
  assert.equal(prepared.combatVersion, 12)
  restored.status = 'won'; restored.enemy.hp = 0; restored.streak = restored.round
  assert.ok(rules.nextRound(restored)); assert.equal(restored.combatVersion, 18)
  assert.ok(rules.chooseUpgrade(restored, rules.upgradeChoices(restored)[0].id))
  assert.ok(rules.startFight(restored)); assert.ok(rules.restore(restored))
  assert.ok(rules.tick(restored, 60000).every(event => !event.counter))
})

test('opponents use wuxia aliases with matching appearances, all weapons and no profession', () => {
  const names = new Set(); const weapons = new Set(); const genders = new Set()
  for (let seed = 1; seed <= 1500; seed++) {
    const state = rules.initialState(seed)
    assert.equal(state.enemy.kind, undefined)
    assert.ok(rules.enemyNames.includes(state.enemy.name))
    assert.equal(state.enemy.gender, enemyCatalog.find(item => item.name === state.enemy.name).gender)
    assert.deepEqual(state.enemy.stats, rules.stats(state.enemy.base, state.enemy.weapon, 'strong', true, 1))
    names.add(state.enemy.name); weapons.add(state.enemy.weapon); genders.add(state.enemy.gender)
    assert.deepEqual(rules.restore(rules.snapshot(state)), state)
  }
  assert.equal(names.size, 64); assert.equal(weapons.size, 6); assert.equal(genders.size, 2)
  const state = rules.initialState(481)
  for (let round = 1; round < 100; round++) {
    const name = state.enemy.name
    state.status = 'won'; state.enemy.hp = 0; state.streak = state.round
    assert.equal(rules.nextRound(state), true); assert.notEqual(state.enemy.name, name)
    assert.equal(rules.chooseUpgrade(state, rules.upgradeChoices(state)[0].id), true)
    assert.equal(state.enemy.kind, undefined); assert.ok(rules.restore(rules.snapshot(state)))
  }
})

test('wuxia aliases have distinct original names and source records for four authors', () => {
  assert.equal(enemyCatalog.length, 64)
  assert.equal(new Set(enemyCatalog.map(item => item.name)).size, 64)
  assert.equal(new Set(enemyCatalog.map(item => item.original)).size, 64)
  assert.deepEqual([...new Set(enemyCatalog.map(item => item.author))].sort(), ['古龙', '梁羽生', '温瑞安', '金庸'])
  for (const item of enemyCatalog) {
    assert.notEqual(item.name, item.original)
    assert.ok(item.name.length >= 2 && item.name.length <= 5)
    assert.ok(item.book && ['male', 'female'].includes(item.gender))
  }
})

test('previous opponent names migrate in place without changing live combat, gender or source saves', () => {
  const previous = ['血煞魔君', '噬魂老祖', '幽冥鬼王', '赤焰邪尊', '九幽魔尊', '灭世狂徒',
    '罗刹妖王', '黑骨魔君', '修罗煞星', '断魂恶煞', '天煞魔主', '焚天邪皇',
    '玄冥老魔', '炼狱凶神', '蚀月魔尊', '夺魄妖姬', '赤血罗刹', '噬日凶王',
    '万劫魔君', '无相邪尊', '幽泉血魔', '千面鬼王', '孤煞魔头', '沉渊恶鬼']
  for (const combat of ['modern', 'legacy']) for (const gender of ['male', 'female']) for (const name of previous) {
    const state = combat === 'modern' ? duel('spear', 'dual') : rules.restore(oldBattle())
    rules.tick(state, 1500); state.enemy.name = name; state.enemy.gender = gender
    const original = rules.snapshot(state); const restored = rules.restore(state)
    assert.ok(restored)
    assert.ok(rules.enemyNames.includes(restored.enemy.name))
    assert.equal(enemyCatalog.find(item => item.name === restored.enemy.name).gender, gender)
    assert.deepEqual({ ...restored, enemy: { ...restored.enemy, name } }, original)
    assert.deepEqual(rules.restore(rules.snapshot(restored)), restored)
    assert.deepEqual(state, original)
    const control = rules.snapshot(state)
    assert.deepEqual(rules.tick(restored, 5000), rules.tick(control, 5000))
    assert.equal(restored.rng, control.rng)
  }
})

test('enemy name changes are cosmetic and persist without affecting combat RNG or outcome', () => {
  const state = duel('spear', 'dual'); const copy = rules.snapshot(state)
  copy.enemy.name = rules.enemyNames.find(name => name !== state.enemy.name)
  assert.ok(rules.restore(copy))
  const first = rules.tick(state, 60000); const second = rules.tick(copy, 60000)
  assert.deepEqual(first, second); assert.equal(state.rng, copy.rng); assert.equal(state.status, copy.status)
  assert.equal(state.player.hp, copy.player.hp); assert.equal(state.enemy.hp, copy.enemy.hp)
})

test('older active weapon battles retain third-attempt skills with no manual selection', () => {
  assert.equal(new Set(rules.weaponSkills.map(item => item.id)).size, 6)
  for (const weapon of rules.weapons) for (const side of ['player', 'enemy']) {
    const state = duel(weapon.id, weapon.id)
    state.combatVersion = 4
    state.player.stats.dodge = state.enemy.stats.dodge = 0
    assert.equal(strike(state, side).skill, undefined)
    assert.equal(strike(state, side).skill, undefined)
    assert.equal(strike(state, side).skill, rules.weaponSkill(weapon.id, 4).id)
    assert.equal(strike(state, side).skill, undefined)
  }
  const state = rules.initialState(10); const initial = rules.snapshot(state)
  assert.equal(rules.configure(state, 'skill', 'focus'), false)
  assert.deepEqual(state, initial); assert.equal(state.skill, undefined)
})

test('new skills wait for full momentum, release on the next strike and recharge from actual damage', () => {
  for (const weapon of rules.weapons) for (const side of ['player', 'enemy']) {
    const state = duel(weapon.id, weapon.id)
    const target = side === 'player' ? 'enemy' : 'player'
    state[target].stats.dodge = 0; state[side].stats.crit = 0
    state[side].combat.momentum = rules.momentum.max - 1
    const normal = strike(state, side)
    assert.equal(normal.skill, undefined)
    assert.equal(state[side].combat.momentum, rules.momentum.max)
    assert.equal(state.logs.length, 1)
    const charged = strike(state, side)
    assert.equal(charged.skill, rules.weaponSkill(weapon.id).id)
    assert.ok(state[side].combat.momentum > 0 && state[side].combat.momentum < rules.momentum.max)
    assert.equal(strike(state, side).skill, undefined)
  }
  const state = duel('axe', 'axe')
  state.rng = 1; state.enemy.stats.dodge = 45
  for (let index = 0; index < 3; index++) { state.rng = 1; assert.equal(strike(state, 'player').skill, undefined) }
  assert.equal(state.player.combat.attacks, 3)
  assert.equal(state.player.combat.momentum, 0)
  assert.equal(state.enemy.combat.momentum, 3 * rules.momentum.dodge)
})

test('momentum credits health-relative damage, damage received and a separate critical bonus for either side', () => {
  for (const side of ['player', 'enemy']) for (const critical of [false, true]) {
    const state = duel('saber', 'saber'); const target = side === 'player' ? 'enemy' : 'player'
    state[side].stats.crit = critical ? 100 : 0; state[target].stats.dodge = 0
    const event = strike(state, side)
    assert.equal(event.critical, critical)
    const ratio = event.damage / state[target].stats.maxHp
    assert.equal(state[side].combat.momentum, Math.round(ratio * rules.momentum.dealt * 100) + (critical ? rules.momentum.critical : 0))
    assert.equal(state[target].combat.momentum, Math.round(ratio * rules.momentum.taken * 100))
  }
})

test('dodge charges only the evader and a missed charged skill still spends its momentum', () => {
  for (const side of ['player', 'enemy']) {
    const state = duel('axe', 'axe'); const target = side === 'player' ? 'enemy' : 'player'
    state[target].stats.dodge = 45; state.rng = 1
    state[side].combat.momentum = rules.momentum.max
    state[target].combat.momentum = rules.momentum.max - 1
    const event = strike(state, side)
    assert.equal(event.dodged, true); assert.equal(event.damage, 0); assert.equal(event.critical, false)
    assert.equal(event.skill, 'axe-critical')
    assert.equal(state[side].combat.momentum, 0)
    assert.equal(state[target].combat.momentum, rules.momentum.max)
    state.rng = 1
    assert.equal(strike(state, side).skill, undefined)
    assert.equal(state[target].combat.momentum, rules.momentum.max)
  }
})

test('overkill never creates extra momentum and guarded hits charge from their reduced real damage', () => {
  const state = duel('axe', 'axe')
  state.enemy.hp = 1; state.enemy.stats.dodge = 0; state.player.stats.crit = 0
  const event = strike(state, 'player')
  assert.equal(event.damage, 1)
  assert.equal(state.player.combat.momentum, Math.round(1 / state.enemy.stats.maxHp * rules.momentum.dealt * 100))
  assert.equal(state.enemy.combat.momentum, Math.round(1 / state.enemy.stats.maxHp * rules.momentum.taken * 100))
  assert.equal(rules.tick(state, 60000).length, 0)
  const guarded = duel('sword', 'sword')
  guarded.enemy.combat.ward = true; guarded.enemy.stats.dodge = 0; guarded.player.stats.crit = 0
  const reduced = strike(guarded, 'player')
  assert.equal(reduced.guarded, true)
  assert.equal(guarded.enemy.combat.momentum, Math.round(reduced.damage / guarded.enemy.stats.maxHp * rules.momentum.taken * 100))
})

test('new saves validate momentum ranges, preserve fractional charge and reset both actors in a new battle', () => {
  const state = duel('axe', 'sword')
  state.player.combat.momentum = 9999; state.enemy.combat.momentum = rules.momentum.max
  assert.deepEqual(rules.restore(rules.snapshot(state)), state)
  for (const side of ['player', 'enemy']) for (const value of [-1, 10001, .5, NaN, Infinity, '100', undefined]) {
    const copy = rules.snapshot(state); copy[side].combat.momentum = value
    assert.equal(rules.restore(copy), null)
  }
  const copy = rules.snapshot(state); copy.status = 'prepare'
  assert.equal(rules.restore(copy), null)
  state.status = 'won'; state.enemy.hp = 0; state.streak = 1
  rules.nextRound(state)
  assert.deepEqual(state.player.combat, { attacks: 0, hitsTaken: 0, ward: false, momentum: 0 })
  assert.deepEqual(state.enemy.combat, state.player.combat)
  assert.equal(state.weapon, 'sword'); assert.equal(rules.configure(state, 'weapon', 'axe'), false)
  assert.ok(rules.restore(rules.snapshot(state)))
})

test('saved third-hit battles resume unchanged and adopt momentum only when entering a new battle', () => {
  const old = duel('spear', 'sword'); old.combatVersion = 4
  old.progression.version = 4
  const fixture = require('./fixtures/textbattle-v5-original-agile.json')
  for (const side of ['player', 'enemy']) {
    const actor = old[side]; delete actor.combat.momentum
    actor.base = { ...fixture[side].base }
    actor.stats = rules.stats(actor.base, side === 'player' ? old.weapon : actor.weapon,
      side === 'player' ? old.stance : 'strong', side === 'enemy', old.round, undefined, old.progression, 4)
    actor.hp = actor.stats.maxHp; actor.cooldown = 1000 / actor.stats.spd
  }
  old.player.combat.attacks = 2
  const stored = rules.snapshot(old)
  const restored = rules.restore(stored)
  assert.deepEqual(restored, stored)
  assert.equal(strike(restored, 'player').skill, 'sword-point')
  strike(old, 'player')
  assert.deepEqual(restored.logs, old.logs)
  assert.deepEqual(rules.restore(rules.snapshot(restored)), restored)
  restored.status = 'won'; restored.enemy.hp = 0; restored.streak = 1
  rules.nextRound(restored)
  assert.equal(restored.combatVersion, 18); assert.equal(restored.player.combat.momentum, 0)
  const prepared = rules.snapshot(stored); prepared.status = 'prepare'
  const migrated = rules.restore(prepared)
  assert.ok(migrated); assert.equal(migrated.combatVersion, 5)
  assert.equal(migrated.player.combat.momentum, 0); assert.equal(migrated.enemy.combat.momentum, 0)
  assert.deepEqual(prepared.player.combat, stored.player.combat)
})

test('balanced momentum keeps all six weapons near two skills per equal-base battle without fast-weapon loops', () => {
  const results = require('../tools/verify-textbattle.cjs').verify(40)
  for (const result of results) {
    assert.ok(result.skillsPerBattle >= 1.4 && result.skillsPerBattle <= 2.4, result.weapon)
    // Lower starting attack speed delays the first release, without reducing charges per battle.
    assert.ok(result.secondsToFirstSkill >= 5 && result.secondsToFirstSkill <= 7, result.weapon)
    assert.ok(result.battlesWithSkillPercent >= 95, result.weapon)
    assert.ok(result.winPercent > 30 && result.winPercent < 70, result.weapon)
  }
})

test('weapon comparison swaps sides, uses strong stance and reports complementary matchup percentages', () => {
  const comparison = require('../tools/verify-textbattle.cjs').matchups(3)
  assert.equal(comparison.battles, 108)
  assert.equal(comparison.stance, 'strong'); assert.equal(comparison.swappedSides, true)
  assert.deepEqual(comparison.weapons, rules.weapons.map(item => item.name))
  comparison.rows.forEach((row, index) => {
    assert.equal(row.winPercents[index], 50)
    row.winPercents.forEach((value, opponent) => {
      assert.ok(value >= 0 && value <= 100)
      assert.ok(Math.abs(value + comparison.rows[opponent].winPercents[index] - 100) < 1e-10)
    })
    const mean = row.winPercents.reduce((sum, value, opponent) => sum + (opponent === index ? 0 : value), 0) / 5
    assert.ok(Math.abs(row.averageVsOthers - mean) <= .1)
  })
})

test('legacy charged sword point is guaranteed to hit after missed attempts on either side', () => {
  for (const side of ['player', 'enemy']) {
    const state = duel('sword', 'sword'); const target = side === 'player' ? 'enemy' : 'player'
    state.combatVersion = 10
    state[target].stats.dodge = 45
    for (let index = 0; index < 3; index++) {
      if (index === 2) state[side].combat.momentum = rules.momentum.max
      state.rng = 1; const event = strike(state, side)
      assert.equal(event.dodged, index < 2)
      if (index === 2) { assert.equal(event.skill, 'sword-point'); assert.ok(event.damage > 0) }
    }
    assert.equal(state[side].combat.attacks, 3)
  }
})

test('legacy saber and dual skills increase attack before subtracting armor in a single resolved hit', () => {
  for (const [weapon, scale] of [['saber', 1.45], ['dual', 1.35]]) for (const side of ['player', 'enemy']) {
    const state = duel(weapon, weapon); const target = side === 'player' ? 'enemy' : 'player'
    state.combatVersion = 10
    state[side].combat.attacks = 2; state[side].combat.momentum = rules.momentum.max; state[target].stats.dodge = 0; state[side].stats.crit = 0
    const normal = rules.snapshot(state); normal[side].combat.momentum = 0
    const base = strike(normal, side); const special = strike(state, side)
    const attack = state[side].stats.atk; const defense = state[target].stats.def
    assert.equal(base.damage, Math.max(1, Math.round(attack - defense)))
    assert.equal(special.damage, Math.max(1, Math.round(attack * scale - defense)))
    assert.equal(state.logs.length, 1); assert.equal(state[side].combat.attacks, 3)
  }
})

test('legacy spear and axe skills bypass defense only on release and retain the normal dodge chance', () => {
  for (const weapon of ['spear', 'axe']) for (const side of ['player', 'enemy']) {
    const state = duel(weapon, weapon); const target = side === 'player' ? 'enemy' : 'player'
    state.combatVersion = 10
    state[side].combat.attacks = 2; state[side].combat.momentum = rules.momentum.max; state[target].stats.dodge = 0; state[side].stats.crit = 0
    const normal = rules.snapshot(state); normal[side].combat.momentum = 0
    const base = strike(normal, side); const special = strike(state, side)
    assert.equal(special.skill, rules.weaponSkill(weapon, 10).id); assert.equal(special.guarded, false)
    assert.ok(special.damage > base.damage)
  }
  const state = duel('saber', 'spear')
  state.player.combat.momentum = rules.momentum.max; state.rng = 5000; state.enemy.stats.dodge = 45
  const normal = rules.snapshot(state); normal.player.combat.momentum = 0
  assert.equal(strike(normal, 'player').dodged, true); assert.equal(strike(state, 'player').dodged, true)
  assert.equal(state.player.combat.momentum, 0)
})

test('legacy halberd wards work for both sides, do not heal or stack, and only spend on a landed opposing hit', () => {
  for (const side of ['player', 'enemy']) {
    const target = side === 'player' ? 'enemy' : 'player'; const state = duel('halberd', 'halberd')
    state.combatVersion = 10
    state[side].combat.momentum = rules.momentum.max; state[side].hp -= 40
    const hp = state[side].hp; const event = strike(state, side)
    assert.equal(event.skill, 'halberd-ward'); assert.equal(event.healed, undefined)
    assert.equal(state[side].hp, hp); assert.equal(state[side].combat.ward, true)
    state[side].combat.momentum = rules.momentum.max; strike(state, side)
    state.rng = 1; state[side].stats.dodge = 45
    assert.equal(strike(state, target).dodged, true); assert.equal(state[side].combat.ward, true)
    state[side].stats.dodge = 0; state[target].stats.crit = 0; state[target].combat.momentum = 0
    const unprotected = rules.snapshot(state); unprotected[side].combat.ward = false
    const normal = strike(unprotected, target); const protectedHit = strike(state, target)
    assert.equal(protectedHit.guarded, true); assert.ok(Math.abs(protectedHit.damage - normal.damage * .75) <= 1)
    assert.equal(state[side].combat.ward, false)
  }
})

test('all 36 matchups and all stances preserve skills, health and RNG across tick sizes and save restoration', () => {
  for (const enemy of rules.weapons) for (const weapon of rules.weapons) for (const stance of rules.stances) {
    const full = duel(enemy.id, weapon.id)
    full.status = 'prepare'; rules.configure(full, 'stance', stance.id); rules.startFight(full)
    let split = rules.snapshot(full); rules.tick(full, 60000)
    for (let index = 0; index < 90 && split.status === 'fighting'; index++) {
      rules.tick(split, 700)
      const saved = rules.snapshot(split); const restored = rules.restore(saved)
      assert.ok(restored, `${enemy.id}/${weapon.id}/${stance.id}`); assert.deepEqual(restored, split)
      saved.player.combat.attacks++; assert.notEqual(saved.player.combat.attacks, split.player.combat.attacks)
      split = restored
    }
    assert.equal(split.status, full.status); assert.equal(split.rng, full.rng); assert.deepEqual(split.logs, full.logs)
    for (const side of ['player', 'enemy']) {
      assert.equal(split[side].hp, full[side].hp); assert.deepEqual(split[side].combat, full[side].combat)
    }
  }
})

test('sword arms one capped retaliation, retains it through dodges and cannot recursively reflect', () => {
  for (const side of ['player', 'enemy']) {
    const target = side === 'player' ? 'enemy' : 'player'; const state = duel('sword', 'sword')
    state[side].combat.momentum = rules.momentum.max; state[target].stats.dodge = 100
    assert.equal(strike(state, side).skill, 'sword-counter')
    assert.equal(state[side].combat.reflect, true)
    state[side].stats.dodge = 100
    assert.equal(strike(state, target).reflected, undefined)
    assert.equal(state[side].combat.reflect, true)
    state[side].stats.dodge = 0; state[target].stats.crit = 0; state[target].combat.momentum = 0
    state[target].combat.reflect = true
    const hp = state[target].hp; const reportBefore = state.report[side].damage
    const momentum = state[side].combat.momentum
    const event = strike(state, target)
    assert.equal(event.reflected, Math.min(state[side].stats.atk, Math.round(event.damage * .8)))
    assert.equal(state[target].hp, hp - event.reflected)
    assert.equal(state.report[side].damage, reportBefore + event.reflected)
    assert.equal(state[side].combat.momentum, momentum + Math.round(event.damage / state[side].stats.maxHp * 11000))
    assert.equal(state[target].combat.reflect, true, 'reflection must not consume the opponent counter')
    assert.equal(state[side].combat.reflect, undefined)
    assert.equal(strike(state, target).reflected, undefined)
  }
})

test('reflection caps at own attack, credits only actual health loss and resolves lethal blows once', () => {
  for (const side of ['player', 'enemy']) for (const lethal of ['incoming', 'reflected', 'capped']) {
    const target = side === 'player' ? 'enemy' : 'player'; const state = duel('sword', 'sword')
    state[side].combat.reflect = true; state[side].stats.dodge = 0; state[target].stats.crit = 0
    state[target].stats.atk = 100; state[target].combat.reflect = true
    if (lethal === 'incoming') state[side].hp = 1
    if (lethal === 'reflected') state[target].hp = 1
    const hp = state[target].hp; const event = strike(state, target)
    if (lethal === 'incoming') {
      assert.equal(event.reflected, undefined); assert.equal(state[target].hp, hp)
      assert.equal(state.status, side === 'player' ? 'lost' : 'won')
    } else {
      assert.equal(event.reflected, lethal === 'reflected' ? 1 : state[side].stats.atk)
      assert.equal(state.report[side].damage, event.reflected)
      if (lethal === 'reflected') {
        assert.equal(state.status, side === 'player' ? 'won' : 'lost')
        assert.equal(rules.tick(state, 60000).length, 0)
      }
    }
  }
})

test('spear ignores all defense and adds thirty percent attack; saber retains its forty-five percent', () => {
  for (const [weapon, scale] of [['spear', 1.3], ['saber', 1.45]]) for (const side of ['player', 'enemy']) {
    const state = duel(weapon, weapon); const target = side === 'player' ? 'enemy' : 'player'
    state[side].combat.momentum = rules.momentum.max
    state[target].stats.dodge = 0; state[side].stats.crit = 0; state[target].stats.def = 99
    const event = strike(state, side)
    assert.equal(event.damage, Math.max(1, Math.round(state[side].stats.atk * scale - (weapon === 'spear' ? 0 : 99))))
    assert.equal(state[target].stats.def, 99)
    assert.equal(strike(state, side).damage, 1)
  }
})

test('v13 saber speed and spear skill resume exactly; preparation and next fight adopt current balance', () => {
  assert.equal(rules.weapons.find(item => item.id === 'saber').spd, .895)
  assert.equal(rules.weaponSkill('spear').description, '本次无视防御，攻击+30%。')
  assert.equal(rules.weaponSkill('spear', 13).description, '本次无视防御，攻击+15%。')
  for (const weapon of ['saber', 'spear']) {
    const old = duel(weapon, weapon, 13)
    const current = duel(weapon, weapon)
    if (weapon === 'saber') for (const side of ['player', 'enemy']) {
      assert.ok(Math.abs(current[side].stats.spd / old[side].stats.spd - .895 / .82) < 1e-12)
    }
    old.player.combat.momentum = rules.momentum.max
    const saved = rules.snapshot(old); const restored = rules.restore(saved)
    assert.deepEqual(restored, saved)
    assert.deepEqual(rules.tick(restored, 2500), rules.tick(old, 2500))
    assert.deepEqual(restored, old); assert.equal(restored.combatVersion, 13)
    const prepared = duel(weapon, weapon, 13); prepared.status = 'prepare'
    const migrated = rules.restore(prepared)
    assert.equal(migrated.combatVersion, 18); assert.equal(migrated.rng, prepared.rng)
    assert.deepEqual(migrated.player.stats, current.player.stats)
    assert.deepEqual(migrated.enemy.stats, current.enemy.stats)
    assert.ok(rules.startFight(prepared)); assert.equal(prepared.combatVersion, 18)
    assert.deepEqual(prepared.player.stats, current.player.stats)
    restored.status = 'won'; restored.enemy.hp = 0; restored.streak = restored.round
    assert.ok(rules.nextRound(restored)); assert.equal(restored.combatVersion, 18)
    assert.ok(rules.restore(restored))
  }
  for (const side of ['player', 'enemy']) for (const version of [13, 14]) {
    const state = duel('spear', 'spear', version)
    const target = side === 'player' ? 'enemy' : 'player'
    state[side].stats.atk = 30; state[side].stats.crit = 0
    state[target].stats.dodge = 0; state[target].stats.def = 99
    state[side].combat.momentum = rules.momentum.max
    assert.equal(strike(state, side).damage, version === 13 ? 35 : 41)
  }
})

test('current rules reduce dual and saber speed while v14 live battles retain exact stats, cooldowns and RNG', () => {
  assert.equal(rules.weapons.find(item => item.id === 'dual').spd, 1.32)
  assert.equal(rules.weapons.find(item => item.id === 'saber').spd, .895)
  assert.ok(rules.weapons.every(item => item.spd <= 1.32))
  for (const weapon of ['dual', 'saber']) for (const stance of rules.stances) {
    const old = duel(weapon, weapon, 14); old.status = 'prepare'
    rules.configure(old, 'stance', stance.id)
    const saved = rules.snapshot(old); const migrated = rules.restore(saved)
    assert.equal(migrated.combatVersion, 18); assert.equal(migrated.rng, saved.rng)
    for (const side of ['player', 'enemy']) {
      const before = saved[side].stats; const after = migrated[side].stats
      const ratio = weapon === 'dual' ? 1.32 / 1.4 : .895 / .9
      assert.ok(Math.abs(after.spd / before.spd - ratio) < 1e-12)
      assert.deepEqual({ ...after, spd: before.spd }, before)
      assert.equal(migrated[side].cooldown, 1000 / after.spd)
    }
    assert.deepEqual(old, saved); assert.deepEqual(rules.restore(migrated), migrated)
    const live = rules.snapshot(saved); live.status = 'fighting'
    live.player.combat.momentum = rules.momentum.max
    rules.tick(live, 400)
    const restored = rules.restore(rules.snapshot(live))
    assert.deepEqual(restored, live)
    assert.deepEqual(rules.tick(restored, 3000), rules.tick(live, 3000))
    assert.deepEqual(restored, live); assert.equal(restored.combatVersion, 14)
    assert.ok(rules.startFight(old)); assert.equal(old.combatVersion, 18)
    assert.deepEqual(old.player.stats, migrated.player.stats)
    restored.status = 'won'; restored.enemy.hp = 0; restored.streak = restored.round
    assert.ok(rules.nextRound(restored)); assert.equal(restored.combatVersion, 18)
    assert.ok(rules.restore(restored))
  }
})

test('v15 dual saves preserve 1.36 speed until the next fight adopts current speed without changing other weapon stats', () => {
  for (const weapon of rules.weapons) for (const stance of rules.stances) {
    const base = rules.initialState(42).player.base
    const before = rules.stats(base, weapon.id, stance.id, null, 1, undefined, undefined, 15)
    const after = rules.stats(base, weapon.id, stance.id)
    if (weapon.id === 'dual') {
      assert.ok(Math.abs(after.spd / before.spd - 1.32 / 1.36) < 1e-12)
      assert.deepEqual({ ...after, spd: before.spd }, before)
    } else assert.deepEqual(after, before)
  }
  const old = duel('dual', 'dual', 15)
  rules.tick(old, 400)
  const saved = rules.snapshot(old); const resumed = rules.restore(saved)
  assert.deepEqual(resumed, saved)
  assert.deepEqual(rules.tick(resumed, 3000), rules.tick(old, 3000))
  assert.deepEqual(resumed, old); assert.equal(resumed.combatVersion, 15)
  const prepared = duel('dual', 'dual', 15); prepared.status = 'prepare'
  const migrated = rules.restore(prepared)
  assert.equal(migrated.combatVersion, 18); assert.equal(migrated.rng, prepared.rng)
  const current = duel('dual', 'dual')
  assert.deepEqual(migrated.player.stats, current.player.stats)
  assert.deepEqual(migrated.enemy.stats, current.enemy.stats)
  assert.ok(rules.startFight(prepared)); assert.equal(prepared.combatVersion, 18)
  assert.deepEqual(prepared.player.stats, current.player.stats)
  resumed.status = 'won'; resumed.enemy.hp = 0; resumed.streak = resumed.round
  assert.ok(rules.nextRound(resumed)); assert.equal(resumed.combatVersion, 18)
  assert.ok(rules.restore(resumed))
})

test('v16 dual speed and spear boost resume exactly and migrate only before a new fight', () => {
  for (const weapon of ['dual', 'spear']) {
    const old = duel(weapon, weapon, 16)
    old.player.combat.momentum = rules.momentum.max
    const saved = rules.snapshot(old); const resumed = rules.restore(saved)
    assert.deepEqual(resumed, saved)
    assert.deepEqual(rules.tick(resumed, 3000), rules.tick(old, 3000))
    assert.deepEqual(resumed, old); assert.equal(resumed.combatVersion, 16)
    const prepared = duel(weapon, weapon, 16); prepared.status = 'prepare'
    const migrated = rules.restore(prepared); const current = duel(weapon, weapon)
    assert.equal(migrated.combatVersion, 18); assert.equal(migrated.rng, prepared.rng)
    assert.deepEqual(migrated.player.stats, current.player.stats)
    assert.deepEqual(migrated.enemy.stats, current.enemy.stats)
    assert.ok(rules.startFight(prepared)); assert.equal(prepared.combatVersion, 18)
    assert.deepEqual(prepared.player.stats, current.player.stats)
    resumed.status = 'won'; resumed.enemy.hp = 0; resumed.streak = resumed.round
    assert.ok(rules.nextRound(resumed)); assert.equal(resumed.combatVersion, 18)
    assert.ok(rules.restore(resumed))
  }
  const base = rules.initialState(42).player.base
  const oldSpeed = rules.stats(base, 'dual', 'strong', null, 1, undefined, undefined, 16).spd
  assert.ok(Math.abs(rules.stats(base, 'dual', 'strong').spd / oldSpeed - 1.32 / 1.3) < 1e-12)
  assert.equal(rules.weaponSkill('spear', 16).description, '本次无视防御，攻击+35%。')
  for (const side of ['player', 'enemy']) for (const version of [16, 17]) for (const critical of [false, true]) {
    const state = duel('spear', 'spear', version)
    const target = side === 'player' ? 'enemy' : 'player'
    state[side].stats.atk = 30; state[side].stats.crit = critical ? 100 : 0
    state[target].stats.def = 99; state[target].stats.dodge = 0
    state[side].combat.momentum = rules.momentum.max
    assert.equal(strike(state, side).damage, Math.round(30 * (critical ? 1.8 : 1) * (version === 16 ? 1.35 : 1.3)))
    assert.equal(state[target].stats.def, 99)
    state[side].stats.crit = 0
    assert.equal(strike(state, side).damage, 1)
  }
})

test('dual releases two independent full hits with one skill and one cooldown, including independent dodge and crit rolls', () => {
  for (const side of ['player', 'enemy']) {
    const state = duel('dual', 'dual'); const target = side === 'player' ? 'enemy' : 'player'
    state[side].combat.momentum = rules.momentum.max; state[target].stats.dodge = 0; state[side].stats.crit = 0
    const hp = state[target].hp; const first = strike(state, side); const second = state.logs.at(-1)
    const damage = Math.max(1, Math.round(state[side].stats.atk - state[target].stats.def))
    assert.equal(first.skill, 'dual-flurry'); assert.equal(second.skill, undefined); assert.equal(second.followup, true)
    assert.equal(first.damage, damage); assert.equal(second.damage, damage)
    assert.equal(state[target].hp, hp - damage * 2); assert.equal(first.time, second.time)
    assert.equal(state[side].combat.attacks, 2); assert.equal(state.report[side].attacks, 2); assert.equal(state.report[side].skills, 1)
    assert.ok(Math.abs(state[side].cooldown - (1000 / state[side].stats.spd - 1)) < .0001)
    let mixedDodge = false; let mixedCrit = false
    for (let seed = 1; seed < 500 && (!mixedDodge || !mixedCrit); seed++) {
      const copy = rules.snapshot(state); copy.logs = []; copy.rng = seed * 2654435761 >>> 0; copy[side].combat.momentum = rules.momentum.max
      copy[target].stats.dodge = 40; copy[side].stats.crit = 50
      strike(copy, side)
      mixedDodge ||= copy.logs[0].dodged !== copy.logs[1].dodged
      mixedCrit ||= !copy.logs[0].dodged && !copy.logs[1].dodged && copy.logs[0].critical !== copy.logs[1].critical
    }
    assert.ok(mixedDodge && mixedCrit)
  }
})

test('dual stops after the first lethal hit or a lethal counter and cannot release a second skill in its followup', () => {
  for (const side of ['player', 'enemy']) for (const lethal of ['first', 'second', 'reflect']) {
    const target = side === 'player' ? 'enemy' : 'player'; const state = duel('sword', 'dual')
    state.weapon = state.enemy.weapon = 'dual'
    state[side].combat.momentum = rules.momentum.max; state[target].stats.dodge = 0; state[side].stats.crit = 0
    const damage = state[side].stats.atk - state[target].stats.def
    state[target].hp = lethal === 'first' ? 1 : lethal === 'second' ? damage + 1 : state[target].hp
    if (lethal === 'reflect') { state[target].combat.reflect = true; state[side].hp = 1 }
    strike(state, side)
    assert.equal(state.logs.length, lethal === 'second' ? 2 : 1)
    assert.equal(state.logs.filter(event => event.skill).length, 1)
    assert.notEqual(state.status, 'fighting')
  }
})

test('axe grants exactly the following attempt a guaranteed critical and still subtracts defense', () => {
  for (const side of ['player', 'enemy']) for (const miss of [false, true]) {
    const target = side === 'player' ? 'enemy' : 'player'; const state = duel('axe', 'axe')
    state[side].combat.momentum = rules.momentum.max; state[target].stats.dodge = 0; state[side].stats.crit = 0
    const release = strike(state, side)
    assert.equal(release.skill, 'axe-critical'); assert.equal(release.critical, false)
    assert.equal(state[side].combat.guaranteedCritical, true)
    const damage = Math.max(1, Math.round(state[side].stats.atk * 1.8 - state[target].stats.def))
    state[target].stats.dodge = miss ? 100 : 0
    const next = strike(state, side)
    assert.equal(next.critical, !miss); assert.equal(next.damage, miss ? 0 : damage)
    assert.equal(state[side].combat.guaranteedCritical, undefined)
    state[target].stats.dodge = 0
    assert.equal(strike(state, side).critical, false)
  }
})

test('halberd reduces only one landed hit by eighty percent, does not stack or boost attack, and double strikes spend one ward', () => {
  for (const side of ['player', 'enemy']) {
    const target = side === 'player' ? 'enemy' : 'player'; const state = duel('halberd', 'halberd')
    state[side].combat.momentum = rules.momentum.max; state[target].stats.dodge = 0; state[side].stats.crit = 0
    const release = strike(state, side)
    assert.equal(release.skill, 'halberd-block'); assert.equal(release.damage, state[side].stats.atk - state[target].stats.def)
    state[side].combat.momentum = rules.momentum.max; strike(state, side)
    state[side].stats.dodge = 100
    assert.equal(strike(state, target).dodged, true); assert.equal(state[side].combat.ward, true)
    state[side].stats.dodge = 0; state[target].stats.crit = 0; state[target].combat.momentum = 0
    state[side].combat.momentum = 0
    const unprotected = rules.snapshot(state); unprotected[side].combat.ward = false
    const ordinary = strike(unprotected, target)
    const hp = state[side].hp; const blocked = strike(state, target)
    assert.equal(blocked.guarded, true); assert.equal(blocked.damage, Math.max(1, Math.round(ordinary.damage * .2)))
    assert.equal(state[side].hp, hp - blocked.damage); assert.equal(state[side].combat.ward, false)
    assert.equal(state[side].combat.momentum, Math.round(blocked.damage / state[side].stats.maxHp * rules.momentum.taken * 100))
    assert.equal(state[target].combat.momentum, Math.round(blocked.damage / state[side].stats.maxHp * rules.momentum.dealt * 100))
    assert.ok(strike(state, target).damage > 0)
    state[side].combat.ward = true
    if (target === 'player') state.weapon = 'dual'; else state.enemy.weapon = 'dual'
    state[target].combat.momentum = rules.momentum.max
    state[side].hp = state[side].stats.maxHp
    strike(state, target)
    const first = state.logs.at(-2); const second = state.logs.at(-1)
    assert.equal(first.damage, Math.max(1, Math.round(second.damage * .2)))
    assert.equal(first.guarded, true); assert.equal(second.guarded, false)
  }
})

test('halberd reduction applies after defense, critical and skill damage, before overkill, with a one-point floor', () => {
  for (const side of ['player', 'enemy']) for (const [weapon, critical, armor, expected] of [
    ['sword', false, 20, 2], ['sword', true, 20, 7],
    ['saber', false, 20, 5], ['spear', false, 99, 8],
    ['spear', true, 99, 14], ['sword', false, 100, 1]
  ]) {
    const state = duel('halberd', 'halberd'); const target = side === 'player' ? 'enemy' : 'player'
    if (side === 'player') state.weapon = weapon; else state.enemy.weapon = weapon
    state[side].stats.atk = 30; state[side].stats.crit = critical ? 100 : 0
    state[target].stats.def = armor; state[target].stats.dodge = 0
    state[target].combat.ward = true
    if (weapon === 'spear' || weapon === 'saber') state[side].combat.momentum = rules.momentum.max
    const event = strike(state, side)
    assert.equal(event.damage, expected, `${side}/${weapon}/${critical}/${armor}`)
    assert.equal(event.guarded, true); assert.equal(state[target].combat.ward, false)
    assert.equal(state.report[side].damage, expected)
  }
  const lethal = duel('halberd', 'sword')
  lethal.player.stats.atk = 100; lethal.player.stats.crit = 0
  lethal.enemy.stats.def = 0; lethal.enemy.stats.dodge = 0; lethal.enemy.hp = 3
  lethal.enemy.combat.ward = true
  assert.equal(strike(lethal, 'player').damage, 3)
  assert.equal(lethal.status, 'won'); assert.equal(lethal.report.player.damage, 3)
})

test('v17 full blocks remain intact on resume; prepared and next-round saves adopt eighty-percent reduction', () => {
  assert.equal(rules.weaponSkill('halberd', 17).description, '完全格挡下一次命中的攻击。')
  assert.equal(rules.weaponSkill('halberd').description, '下一次命中受击减伤80%。')
  for (const side of ['player', 'enemy']) {
    const target = side === 'player' ? 'enemy' : 'player'
    const old = duel('halberd', 'halberd', 17)
    old[side].combat.momentum = rules.momentum.max
    strike(old, side); assert.equal(old[side].combat.ward, true)
    const saved = rules.snapshot(old); const restored = rules.restore(saved)
    assert.deepEqual(restored, saved)
    restored[side].stats.dodge = old[side].stats.dodge = 0
    const blocked = strike(restored, target)
    assert.equal(blocked.damage, 0); assert.equal(blocked.guarded, true)
    assert.deepEqual(blocked, strike(old, target)); assert.deepEqual(restored, old)
    assert.equal(restored.combatVersion, 17)
    const prepared = duel('halberd', 'halberd', 17); prepared.status = 'prepare'
    const migrated = rules.restore(prepared)
    assert.equal(migrated.combatVersion, 18); assert.equal(migrated.rng, prepared.rng)
    assert.ok(rules.startFight(prepared)); assert.equal(prepared.combatVersion, 18)
    restored.status = 'won'; restored.enemy.hp = 0; restored.streak = restored.round
    assert.ok(rules.nextRound(restored)); assert.equal(restored.combatVersion, 18)
    assert.ok(rules.restore(restored))
  }
})

test('new pending effects survive restoration, reject wrong weapons and clear between battles; v10 skills resume until advancing', () => {
  for (const [weapon, flag] of [['sword', 'reflect'], ['axe', 'guaranteedCritical'], ['halberd', 'ward']]) {
    const state = duel(weapon, weapon); state.player.combat.momentum = rules.momentum.max
    strike(state, 'player'); assert.equal(state.player.combat[flag], true)
    assert.deepEqual(rules.restore(rules.snapshot(state)), state)
    const invalid = rules.snapshot(state); invalid.player.combat[flag] = 'true'
    assert.equal(rules.restore(invalid), null)
    if (flag !== 'ward') {
      const wrongWeapon = rules.snapshot(state); wrongWeapon.enemy.combat[flag] = true
      // A matching opponent may carry the effect, but another weapon cannot.
      wrongWeapon.enemy.weapon = 'saber'
      wrongWeapon.enemy.stats = rules.stats(wrongWeapon.enemy.base, 'saber', 'strong', true, state.round, undefined, state.progression)
      wrongWeapon.enemy.hp = wrongWeapon.enemy.stats.maxHp; wrongWeapon.enemy.cooldown = 1000 / wrongWeapon.enemy.stats.spd
      assert.equal(rules.restore(wrongWeapon), null)
    }
    state.enemy.hp = 0; state.status = 'won'; state.streak = state.round
    rules.nextRound(state)
    assert.ok(!state.player.combat[flag]); assert.ok(rules.restore(state))
  }
  for (const weapon of rules.weapons) {
    const state = duel(weapon.id, weapon.id, 10)
    state.player.combat.momentum = rules.momentum.max
    const save = rules.snapshot(state); const restored = rules.restore(save)
    assert.deepEqual(restored, save)
    assert.equal(strike(restored, 'player').skill, rules.weaponSkill(weapon.id, 10).id)
    strike(state, 'player'); assert.deepEqual(restored, state)
    state.enemy.hp = 0; state.status = 'won'; state.streak = state.round
    rules.nextRound(state); assert.equal(state.combatVersion, 18)
    const prepared = duel(weapon.id, weapon.id, 10); prepared.status = 'prepare'
    const migrated = rules.restore(prepared)
    assert.equal(migrated.combatVersion, 18); assert.equal(migrated.rng, prepared.rng)
  }
})

test('axe speed is 0.90 while v11 live saves retain 0.85 and adopt new equipment only when preparing or advancing', () => {
  assert.equal(rules.weapons.find(item => item.id === 'axe').spd, .9)
  for (const stance of rules.stances) {
    const current = duel('axe', 'axe'); const old = duel('axe', 'axe', 11)
    const base = current.player.base
    const before = rules.stats(base, 'axe', stance.id, null, 1, undefined, current.progression, 11)
    const after = rules.stats(base, 'axe', stance.id, null, 1, undefined, current.progression, 12)
    assert.ok(Math.abs(after.spd / before.spd - .9 / .85) < 1e-12)
    assert.deepEqual({ ...after, spd: before.spd }, before)
    old.player.combat.momentum = rules.momentum.max
    rules.tick(old, 350)
    const saved = rules.snapshot(old); const restored = rules.restore(saved)
    assert.deepEqual(restored, saved)
    assert.deepEqual(rules.tick(restored, 2500), rules.tick(old, 2500))
    assert.deepEqual(restored, old)
    assert.equal(restored.combatVersion, 11)
    const prepared = duel('axe', 'axe', 11); prepared.status = 'prepare'
    const original = rules.snapshot(prepared); const migrated = rules.restore(prepared)
    assert.equal(migrated.combatVersion, 18); assert.equal(migrated.rng, original.rng)
    for (const side of ['player', 'enemy']) {
      assert.equal(migrated[side].stats.spd, current[side].stats.spd)
      assert.equal(migrated[side].cooldown, 1000 / migrated[side].stats.spd)
      assert.equal(migrated[side].hp, migrated[side].stats.maxHp)
    }
    assert.deepEqual(prepared, original); assert.deepEqual(rules.restore(migrated), migrated)
    assert.ok(rules.startFight(prepared)); assert.equal(prepared.combatVersion, 18)
    assert.equal(prepared.player.stats.spd, current.player.stats.spd)
    restored.status = 'won'; restored.enemy.hp = 0; restored.streak = restored.round
    assert.ok(rules.nextRound(restored)); assert.equal(restored.combatVersion, 18)
    assert.equal(restored.player.stats.spd, current.player.stats.spd)
    assert.ok(rules.restore(restored))
  }
})

test('v3 and v4 live battles retain exact combat, migrate display names, and next battle removes all occupational data', () => {
  for (const [version, combatVersion] of [[3, 2], [4, 3]]) {
    const old = oldBattle(version, combatVersion); const unchanged = rules.snapshot(old)
    old.player.combat.attacks = 2; old.player.hp -= 40
    const restored = rules.restore(old); assert.ok(restored)
    assert.equal(restored.version, 5); assert.equal(restored.combatVersion, combatVersion)
    assert.ok(rules.enemyNames.includes(restored.enemy.name)); assert.equal(restored.rng, old.rng)
    assert.deepEqual(restored.player, old.player)
    const control = rules.snapshot(old)
    assert.deepEqual(rules.tick(restored, 3000), rules.tick(control, 3000))
    assert.deepEqual(restored.player, control.player); assert.equal(restored.enemy.hp, control.enemy.hp)
    assert.deepEqual(rules.restore(rules.snapshot(restored)), restored)
    restored.enemy.hp = 0; restored.status = 'won'; restored.streak = 1
    assert.equal(rules.nextRound(restored), true); assert.equal(restored.combatVersion, 18)
    assert.equal(restored.enemy.kind, undefined); assert.equal(restored.skill, undefined)
    assert.ok(rules.restore(rules.snapshot(restored)))
    const prepared = rules.snapshot(unchanged); prepared.status = 'prepare'
    const migrated = rules.restore(prepared); assert.ok(migrated)
    assert.equal(migrated.combatVersion, 5); assert.equal(migrated.enemy.kind, undefined)
    assert.equal(migrated.enemy.weapon, prepared.enemy.weapon); assert.equal(migrated.skill, undefined)
    assert.deepEqual(migrated.enemy.stats, rules.stats(prepared.enemy.base, prepared.enemy.weapon, 'strong', true, prepared.round, undefined, undefined, 5))
    assert.equal(migrated.enemy.hp, migrated.enemy.stats.maxHp); assert.equal(migrated.rng, prepared.rng)
    assert.deepEqual(migrated.player.combat, { attacks: 0, hitsTaken: 0, ward: false, momentum: 0 })
    assert.equal(old.version, version); assert.equal(old.enemy.name, '荒原力士')
  }
})

test('v1 and v2 saves retain battle progress and RNG; next round activates weapon-only combat', () => {
  for (const fixture of ['textbattle-v1.json', 'textbattle-v2-hammer.json']) {
    const legacy = require('./fixtures/' + fixture); const oldCopy = structuredClone(legacy)
    const state = rules.restore(legacy)
    assert.equal(state.version, 5); assert.equal(state.combatVersion, 1)
    assert.equal(state.rng, legacy.rng); assert.equal(state.player.hp, legacy.player.hp)
    rules.tick(state, 1000)
    assert.ok(state.logs.every(event => event.skill === undefined && event.trait === undefined))
    assert.equal(state.player.combat.attacks, 0)
    state.enemy.hp = 1; state.enemy.stats.dodge = 0; state.player.cooldown = 0; state.enemy.cooldown = 1000
    rules.tick(state, 1); assert.equal(state.status, 'won')
    assert.equal(rules.nextRound(state), true); assert.equal(state.combatVersion, 18)
    assert.equal(state.enemy.kind, undefined); assert.deepEqual(legacy, oldCopy)
  }
})

test('new saves reject professions, unrecognized names, mismatched weapon skills, traits and malformed combat', () => {
  const state = duel('dual', 'sword'); rules.tick(state, 4500)
  for (const mutate of [save => { save.skill = 'missing' }, save => { save.combatVersion = 19 },
    save => { save.enemy.kind = 'brute' }, save => { save.enemy.name = 'unknown' },
    save => { save.player.combat.ward = 3 }, save => { save.player.combat.attacks = -1 },
    save => { save.enemy.combat.hitsTaken = 1.5 }, save => { delete save.enemy.combat },
    save => { save.logs[0].healed = 999 }, save => { save.logs[0].counter = 'true' },
    save => { save.logs[0].trait = 'brute' }, save => { save.logs[0].skill = 'unknown' },
    save => { save.logs[0].skill = 'axe-break' }]) {
    const copy = rules.snapshot(state); mutate(copy); assert.equal(rules.restore(copy), null)
  }
})

test('loading falls back through v4, v3, v2 and v1 while preserving previous saves', () => {
  const sources = [[rules.previousSaveKey, oldBattle()], [rules.strategySaveKey, oldBattle(3, 2)],
    [rules.equipmentSaveKey, require('./fixtures/textbattle-v2-hammer.json')],
    [rules.legacySaveKey, require('./fixtures/textbattle-v1.json')]]
  for (const [key, old] of sources) {
    const next = rules.initialState(48); const oldCopy = rules.snapshot(old)
    const stored = new Map([[key, old], [rules.saveKey, next]])
    assert.deepEqual(rules.loadProgress(name => stored.get(name)), next)
    stored.set(rules.saveKey, { corrupt: true })
    const fallback = rules.loadProgress(name => stored.get(name))
    assert.equal(fallback.runId, old.runId); assert.ok(rules.enemyNames.includes(fallback.enemy.name))
    assert.deepEqual(stored.get(key), oldCopy)
  }
  assert.equal(rules.loadProgress(() => { throw new Error('unavailable') }), null)
})

test('migration removes unsupported tactical annotations from old logs before rendering or saving', () => {
  const old = structuredClone(require('./fixtures/textbattle-v2-hammer.json'))
  Object.assign(old.logs[0], { skill: 'unknown', trait: 'unknown', healed: 999, counter: 'unknown' })
  const state = rules.restore(old); assert.ok(state)
  assert.equal(state.logs[0].skill, undefined); assert.equal(state.logs[0].trait, undefined)
  assert.deepEqual(rules.restore(rules.snapshot(state)), state)
})
