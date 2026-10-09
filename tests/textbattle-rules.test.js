const { test } = require('node:test')
const assert = require('node:assert/strict')
const rules = require('../games/textbattle/rules.js')
const { layout } = require('../games/textbattle/layout.js')
const { parts } = require('../games/textbattle/names.js')

test('imaginative names cover broad surnames and avoid recent surnames, given names and combinations', () => {
  const state = { rng: 173921 }
  const recent = []; const surnames = new Set(); const names = new Set()
  for (let i = 0; i < 3000; i++) {
    const name = rules.nickname(state, recent)
    const current = parts(name)
    assert.ok(name.length >= 3 && name.length <= 4)
    assert.ok(!recent.includes(name))
    assert.ok(!recent.slice(-8).some(value => parts(value).surname === current.surname))
    assert.ok(!recent.slice(-16).some(value => parts(value).given === current.given))
    surnames.add(current.surname); names.add(name)
    recent.push(name); if (recent.length > 64) recent.shift()
  }
  assert.ok(surnames.size >= 100)
  assert.ok(names.size >= 2800)
  assert.ok([...surnames].some(value => value.length === 2))
})

test('weapons and stances alter real combat stats and lock during fighting', () => {
  const state = rules.initialState(42)
  rules.configure(state, 'weapon', 'sword'); const sword = { ...state.player.stats }
  rules.configure(state, 'weapon', 'dual'); const dual = { ...state.player.stats }
  assert.ok(sword.atk > dual.atk); assert.ok(dual.spd > sword.spd)
  rules.configure(state, 'weapon', 'axe'); assert.equal(state.player.stats.pierce, .55)
  rules.configure(state, 'weapon', 'spear'); assert.equal(state.player.stats.pierce, .2)
  rules.configure(state, 'stance', 'strong'); const strong = { ...state.player.stats }
  rules.configure(state, 'stance', 'guard'); assert.ok(state.player.stats.def > strong.def)
  assert.ok(state.player.stats.atk < strong.atk)
  rules.startFight(state)
  assert.equal(rules.configure(state, 'weapon', 'saber'), false)
  assert.equal(rules.reroll(state), false)
})

test('six distinct weapon choices retain their intended combat differences', () => {
  assert.deepEqual(rules.weapons.map(item => item.name), ['长剑', '大刀', '长枪', '短双刃', '大斧', '戟'])
  const state = rules.initialState(42)
  const attributes = Object.fromEntries(rules.weapons.map(weapon => {
    rules.configure(state, 'weapon', weapon.id)
    return [weapon.id, { ...state.player.stats }]
  }))
  assert.ok(attributes.saber.atk > attributes.sword.atk)
  assert.ok(attributes.sword.spd > attributes.saber.spd)
  assert.ok(attributes.dual.spd > attributes.sword.spd)
  assert.ok(attributes.dual.dodge > attributes.sword.dodge)
  assert.ok(attributes.axe.pierce > attributes.halberd.pierce && attributes.halberd.pierce > attributes.spear.pierce)
  assert.ok(attributes.halberd.atk > attributes.spear.atk && attributes.halberd.spd < attributes.spear.spd)
  assert.equal(rules.configure(state, 'weapon', 'hammer'), false)
})

test('v2 hammer saves migrate both actors to axes without changing battle progress', () => {
  const legacy = require('./fixtures/textbattle-v2-hammer.json')
  const before = structuredClone(legacy)
  const restored = rules.restore(legacy)
  assert.ok(restored)
  assert.equal(restored.weapon, 'axe'); assert.equal(restored.enemy.weapon, 'axe')
  for (const side of ['player', 'enemy']) {
    for (const key of ['hp', 'cooldown', 'base', 'stats']) assert.deepEqual(restored[side][key], legacy[side][key])
    if (side === 'player') assert.equal(restored[side].name, legacy[side].name)
    else assert.ok(rules.enemyNames.includes(restored[side].name))
    assert.ok(['male', 'female'].includes(restored[side].gender))
  }
  for (const key of ['runId', 'rng', 'round', 'streak', 'status', 'elapsedMs', 'logs']) assert.deepEqual(restored[key], legacy[key])
  assert.deepEqual(legacy, before)
  assert.deepEqual(rules.restore(rules.snapshot(restored)), restored)
})

test('gender selection is cosmetic, saved and locked during combat; both enemy appearances occur', () => {
  const state = rules.initialState(56); const before = rules.snapshot(state)
  assert.equal(rules.configure(state, 'gender', 'female'), true)
  assert.deepEqual({ ...state, player: { ...state.player, gender: 'male' } }, before)
  assert.equal(rules.restore(rules.snapshot(state)).player.gender, 'female')
  const corrupt = rules.snapshot(state); corrupt.player.gender = 'unknown'
  assert.equal(rules.restore(corrupt), null)
  rules.startFight(state)
  assert.equal(rules.configure(state, 'gender', 'male'), false)
  assert.equal(new Set(Array.from({ length: 40 }, (_, i) => rules.initialState(i + 1).enemy.gender)).size, 2)
})

test('v1 saves migrate to new equipment without losing health, series, random state or attack progress', () => {
  const legacy = require('./fixtures/textbattle-v1.json')
  const before = structuredClone(legacy)
  const migrated = rules.restore(legacy)
  assert.ok(migrated); assert.equal(migrated.version, 5)
  for (const key of ['round', 'streak', 'elapsedMs', 'runId', 'rng', 'status', 'weapon']) assert.equal(migrated[key], legacy[key])
  assert.deepEqual(migrated.logs, legacy.logs)
  for (const side of ['player', 'enemy']) {
    assert.equal(migrated[side].hp, legacy[side].hp)
    assert.deepEqual(migrated[side].base, legacy[side].base)
    assert.ok(Math.abs(migrated[side].cooldown * migrated[side].stats.spd - legacy[side].cooldown * legacy[side].stats.spd) < .000001)
  }
  assert.deepEqual(rules.restore(rules.snapshot(migrated)), migrated)
  assert.deepEqual(legacy, before)
  const corrupt = structuredClone(legacy); corrupt.player.stats.atk++
  assert.equal(rules.restore(corrupt), null)
  const falseLegacy = rules.snapshot(rules.initialState(21))
  rules.configure(falseLegacy, 'weapon', 'spear'); falseLegacy.version = 1
  assert.equal(rules.restore(falseLegacy), null)
})
test('seeded combat gives the same attacks and health under different tick sizes', () => {
  const one = rules.initialState(128); const split = rules.initialState(128)
  rules.startFight(one); rules.startFight(split)
  const events = rules.tick(one, 10000)
  const divided = []
  for (let i = 0; i < 100; i++) divided.push(...rules.tick(split, 100))
  assert.deepEqual(events, divided)
  assert.equal(one.rng, split.rng); assert.equal(one.player.hp, split.player.hp); assert.equal(one.enemy.hp, split.enemy.hp)
  assert.ok(Math.abs(one.player.cooldown - split.player.cooldown) < .000001)
})
test('simultaneous lethal attacks choose either side fairly and never strike after death', () => {
  const winners = new Set()
  for (let seed = 1; seed <= 100; seed++) {
    const state = rules.initialState(seed)
    rules.startFight(state)
    state.player.hp = state.enemy.hp = 1
    state.player.stats.dodge = state.enemy.stats.dodge = 0
    state.player.cooldown = state.enemy.cooldown = 1
    const events = rules.tick(state, 100)
    assert.equal(events.length, 1); winners.add(state.status)
    assert.equal(rules.tick(state, 10000).length, 0)
  }
  assert.deepEqual([...winners].sort(), ['lost', 'won'])
})
test('winning advances the series, heals both fighters and locks the weapon while allowing stance changes', () => {
  const state = rules.initialState(10)
  rules.startFight(state); state.enemy.hp = 1; state.enemy.stats.dodge = 0
  state.player.cooldown = 0; state.enemy.cooldown = 500
  rules.tick(state, 1)
  assert.equal(state.status, 'won'); assert.equal(state.streak, 1)
  assert.ok(rules.nextRound(state)); assert.equal(state.round, 2)
  assert.equal(state.player.hp, state.player.stats.maxHp)
  assert.equal(state.enemy.hp, state.enemy.stats.maxHp)
  const before = rules.snapshot(state)
  for (const weapon of rules.weapons) assert.equal(rules.configure(state, 'weapon', weapon.id), false)
  assert.deepEqual(state, before)
  const restored = rules.restore(rules.snapshot(state))
  assert.equal(rules.configure(restored, 'weapon', 'axe'), false)
  assert.equal(restored.weapon, before.weapon)
  assert.equal(rules.configure(state, 'skill', 'focus'), false)
  rules.chooseUpgrade(state, rules.upgradeChoices(state)[0].id)
  assert.equal(rules.configure(state, 'stance', 'agile'), true)
  assert.ok(rules.restore(rules.snapshot(state)))
})
test('save restores exact ongoing combat; malformed saves cannot inject stats or invalid state', () => {
  const state = rules.initialState(9); rules.startFight(state); rules.tick(state, 5200)
  const restored = rules.restore(rules.snapshot(state)); assert.deepEqual(restored, state)
  rules.tick(state, 4000); rules.tick(restored, 4000); assert.deepEqual(restored, state)
  for (const corrupt of [save => { save.player.stats.atk = 999 }, save => { save.player.hp = -1 },
    save => { save.rng = 0 }, save => { save.weapon = 'invalid' }, save => { save.enemy.kind = 'invalid' },
    save => { save.streak = 1000 }, save => { save.logs = Array(81).fill({}) }, save => { save.player.cooldown = Infinity }]) {
    const save = rules.snapshot(state); corrupt(save); assert.equal(rules.restore(save), null)
  }
  const saved = rules.snapshot(state); saved.player.base.atk++
  assert.notEqual(saved.player.base.atk, state.player.base.atk)
})
test('all generated enemy weapons and all player weapon/stance combinations produce valid saves', () => {
  const kinds = new Set()
  for (let seed = 1; seed < 200; seed++) {
    const state = rules.initialState(seed); kinds.add(state.enemy.weapon); assert.equal(state.enemy.kind, undefined)
    for (const weapon of rules.weapons) for (const stance of rules.stances) {
      rules.configure(state, 'weapon', weapon.id); rules.configure(state, 'stance', stance.id)
      assert.ok(rules.restore(rules.snapshot(state)), `${seed}/${weapon.id}/${stance.id}`)
    }
  }
  assert.equal(kinds.size, 6)
})
test('portrait controls fit safe area and do not overlap at three mobile sizes', () => {
  for (const [width, height] of [[320, 568], [375, 667], [390, 844]]) {
    const view = layout({ width, height, top: 24, bottom: 16 })
    assert.equal(view.weapons.length, 6)
    const { player, enemy } = view.attributes
    assert.deepEqual([player.w, player.h, player.y], [enemy.w, enemy.h, enemy.y])
    assert.equal(player.x + player.w + 10, enemy.x)
    const rectangles = [view.home, view.restart, view.info, view.pause, view.arena, player, enemy, ...view.weapons, ...view.stances, view.action, view.name, view.randomName, view.reroll]
    assert.ok(view.log.h >= 20)
    for (const rect of rectangles) {
      assert.ok(rect.x >= 0 && rect.x + rect.w <= width)
      assert.ok(rect.y >= 24 && rect.y + rect.h <= height - 16)
    }
    for (let i = 0; i < rectangles.length; i++) for (let j = i + 1; j < rectangles.length; j++) {
      const a = rectangles[i]; const b = rectangles[j]
      assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y)
    }
  }
})

test('guide content and tabs stay above buttons inside compact phone safe areas', () => {
  for (const [width, height] of [[320, 568], [375, 667], [390, 844]]) {
    const view = layout({ width, height, top: 44, bottom: 34 })
    const r = view.guideDialog
    assert.ok(r.y >= 44 && r.y + r.h <= height - 34)
    assert.ok(r.y + 404 < view.guidePrimary.y)
    for (const rect of [...view.guideTabs, view.guidePrimary, view.guideSecondary]) {
      assert.ok(rect.x >= r.x && rect.x + rect.w <= r.x + r.w)
      assert.ok(rect.y >= r.y && rect.y + rect.h <= r.y + r.h)
    }
  }
})
