const { test } = require('node:test')
const assert = require('node:assert/strict')
const rules = require('../games/textbattle/rules.js')
const { catalog: enemyCatalog } = require('../games/textbattle/enemy-names.js')

function duel(enemyWeapon, weapon = 'sword') {
  let state
  for (let seed = 1; seed < 400; seed++) {
    state = rules.initialState(seed)
    if (state.enemy.weapon === enemyWeapon) break
  }
  assert.equal(state.enemy.weapon, enemyWeapon)
  rules.configure(state, 'weapon', weapon); rules.startFight(state)
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
  delete state.progression
  if (combatVersion === 2) state.skill = 'renew'
  state.status = 'fighting'; state.enemy.kind = 'brute'; state.enemy.name = '荒原力士'; state.enemy.weapon = 'axe'
  state.enemy.stats = rules.stats(state.enemy.base, 'axe', 'strong', 'brute', state.round)
  state.enemy.hp = state.enemy.stats.maxHp; state.enemy.cooldown = 1000 / state.enemy.stats.spd
  return state
}

test('weapon ring has exactly one counter and one nemesis per weapon, with no reciprocal counters', () => {
  const expected = { sword: 'dual', dual: 'axe', axe: 'halberd', halberd: 'spear', spear: 'saber', saber: 'sword' }
  for (const weapon of rules.weapons) {
    let wins = 0; let losses = 0; let neutrals = 0
    for (const enemy of rules.weapons) {
      const match = rules.relation(weapon.id, enemy.id)
      if (expected[weapon.id] === enemy.id) {
        wins++; assert.equal(match.counter, true); assert.equal(match.disadvantaged, false)
        assert.equal(match.name, '专属克制'); assert.equal(match.symbol, '→'); assert.equal(match.scale, 1.18)
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
    const classic = rules.snapshot(state); classic.combatVersion = 1
    const base = strike(classic, side); const actual = strike(state, side)
    const match = rules.relation(side === 'player' ? weapon.id : enemy.id, side === 'player' ? enemy.id : weapon.id)
    assert.equal(actual.counter, match.counter); assert.equal(actual.guarded, false); assert.equal(actual.trait, undefined)
    assert.ok(Math.abs(actual.damage - base.damage * match.scale) <= 1, `${weapon.id}/${enemy.id}/${side}`)
    assert.deepEqual(state[side].stats, classic[side].stats)
  }
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
    assert.equal(strike(state, side).skill, rules.weaponSkill(weapon.id).id)
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
    assert.equal(event.skill, 'axe-break')
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
  for (const actor of [old.player, old.enemy]) delete actor.combat.momentum
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
  assert.equal(restored.combatVersion, 5); assert.equal(restored.player.combat.momentum, 0)
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
    assert.ok(result.secondsToFirstSkill >= 3 && result.secondsToFirstSkill <= 5, result.weapon)
    assert.ok(result.battlesWithSkillPercent >= 95, result.weapon)
    assert.ok(result.winPercent > 30 && result.winPercent < 70, result.weapon)
  }
})

test('charged sword point is guaranteed to hit after missed attempts on either side', () => {
  for (const side of ['player', 'enemy']) {
    const state = duel('sword', 'sword'); const target = side === 'player' ? 'enemy' : 'player'
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

test('saber and dual skills apply their advertised damage to a single resolved attack', () => {
  for (const [weapon, scale] of [['saber', 1.45], ['dual', 1.35]]) for (const side of ['player', 'enemy']) {
    const state = duel(weapon, weapon); const target = side === 'player' ? 'enemy' : 'player'
    state[side].combat.attacks = 2; state[side].combat.momentum = rules.momentum.max; state[target].stats.dodge = 0; state[side].stats.crit = 0
    const normal = rules.snapshot(state); normal[side].combat.momentum = 0
    const base = strike(normal, side); const special = strike(state, side)
    assert.ok(Math.abs(special.damage - base.damage * scale) <= 1)
    assert.equal(state.logs.length, 1); assert.equal(state[side].combat.attacks, 3)
  }
})

test('spear and axe skills bypass defense; spear skill halves dodge without extra matchup precision', () => {
  for (const weapon of ['spear', 'axe']) for (const side of ['player', 'enemy']) {
    const state = duel(weapon, weapon); const target = side === 'player' ? 'enemy' : 'player'
    state[side].combat.attacks = 2; state[side].combat.momentum = rules.momentum.max; state[target].stats.dodge = 0; state[side].stats.crit = 0
    const normal = rules.snapshot(state); normal[side].combat.momentum = 0
    const base = strike(normal, side); const special = strike(state, side)
    assert.equal(special.skill, rules.weaponSkill(weapon).id); assert.equal(special.guarded, false)
    assert.ok(special.damage > base.damage)
  }
  const state = duel('saber', 'spear')
  state.player.combat.momentum = rules.momentum.max; state.rng = 5000; state.enemy.stats.dodge = 45
  const normal = rules.snapshot(state); normal.player.combat.momentum = 0
  assert.equal(strike(normal, 'player').dodged, true); assert.equal(strike(state, 'player').dodged, false)
})

test('halberd wards work for both sides, do not heal or stack, and only spend on a landed opposing hit', () => {
  for (const side of ['player', 'enemy']) {
    const target = side === 'player' ? 'enemy' : 'player'; const state = duel('halberd', 'halberd')
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
    assert.equal(rules.nextRound(restored), true); assert.equal(restored.combatVersion, 5)
    assert.equal(restored.enemy.kind, undefined); assert.equal(restored.skill, undefined)
    assert.ok(rules.restore(rules.snapshot(restored)))
    const prepared = rules.snapshot(unchanged); prepared.status = 'prepare'
    const migrated = rules.restore(prepared); assert.ok(migrated)
    assert.equal(migrated.combatVersion, 5); assert.equal(migrated.enemy.kind, undefined)
    assert.equal(migrated.enemy.weapon, prepared.enemy.weapon); assert.equal(migrated.skill, undefined)
    assert.deepEqual(migrated.enemy.stats, rules.stats(prepared.enemy.base, prepared.enemy.weapon, 'strong', true, prepared.round))
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
    assert.equal(rules.nextRound(state), true); assert.equal(state.combatVersion, 5)
    assert.equal(state.enemy.kind, undefined); assert.deepEqual(legacy, oldCopy)
  }
})

test('new saves reject professions, unrecognized names, mismatched weapon skills, traits and malformed combat', () => {
  const state = duel('dual', 'sword'); rules.tick(state, 4500)
  for (const mutate of [save => { save.skill = 'missing' }, save => { save.combatVersion = 10 },
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
