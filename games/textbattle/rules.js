const strategy = require('./strategy.js')
const enemyNaming = require('./enemy-names.js')
const progression = require('./progression.js')
const report = require('./report.js')
const saveKey = 'textbattle.v5'
const previousSaveKey = 'textbattle.v4'
const strategySaveKey = 'textbattle.v3'
const equipmentSaveKey = 'textbattle.v2'
const legacySaveKey = 'textbattle.v1'
const bestKey = 'textbattle.records.v1'
const weapons = [
  { id: 'sword', name: '长剑', note: '均衡 · 迅捷', atk: 1.08, spd: 1.1, crit: 5, dodge: 0, pierce: 0 },
  { id: 'saber', name: '大刀', note: '高伤 · 暴击', atk: 1.42, spd: .82, crit: 8, dodge: 0, pierce: 0 },
  { id: 'spear', name: '长枪', note: '精准 · 穿甲', atk: 1.17, spd: .98, crit: 3, dodge: 0, pierce: .2 },
  { id: 'dual', name: '短双刃', note: '连击 · 灵巧', atk: .8, spd: 1.4, crit: 0, dodge: 4, pierce: 0 },
  { id: 'axe', name: '大斧', note: '破甲 · 重击', atk: 1.3, spd: .85, crit: 0, dodge: 0, pierce: .55 },
  { id: 'halberd', name: '戟', note: '威力 · 穿甲', atk: 1.25, spd: .9, crit: 4, dodge: 0, pierce: .35 }
]
// Only used to validate old saves before migrating their equipment stats.
const legacyWeapons = [
  { id: 'sword', atk: 1.42, spd: .82, crit: 3, dodge: 0, pierce: 0 },
  { id: 'saber', atk: 1.05, spd: 1, crit: 8, dodge: 0, pierce: 0 },
  { id: 'dual', atk: .8, spd: 1.4, crit: 0, dodge: 4, pierce: 0 },
  { id: 'hammer', atk: 1.3, spd: .85, crit: 0, dodge: 0, pierce: .55 }
]
const stances = [
  { id: 'strong', name: '强攻', note: '攻击↑ 防御↓', description: '强攻：提高攻击，以防御换伤害。', atk: 1.2, def: .75, spd: 1, dodge: 0 },
  { id: 'guard', name: '守御', note: '防御↑ 攻击↓', description: '守御：提高防御和闪避，攻击略降。', atk: .95, def: 2.5, spd: 1, dodge: 4 },
  { id: 'agile', name: '游斗', note: '速度↑ 闪避↑', description: '游斗：提高攻速和闪避，攻防略降。', atk: .9, def: .85, spd: 1.18, dodge: 8 }
]
// Used solely to validate and resume older saved battles.
const legacyEnemies = [
  { id: 'duelist', name: '流浪刀客', note: '均衡出招，擅长暴击', weapon: 'saber', atk: 1, def: 1, hp: 1, spd: 1, dodge: 0 },
  { id: 'guard', name: '铁甲卫士', note: '护甲厚重，试试大斧', weapon: 'sword', atk: .95, def: 1.9, hp: 1.1, spd: .85, dodge: 0 },
  { id: 'assassin', name: '疾风刺客', note: '出手迅速，闪避较高', weapon: 'dual', atk: 1, def: .7, hp: .85, spd: 1.15, dodge: 8 },
  { id: 'brute', name: '荒原力士', note: '生命充沛，重击破甲', weapon: 'axe', atk: 1.1, def: .9, hp: 1.35, spd: .9, dodge: 0 }
]
const enemyNames = enemyNaming.names
const find = (list, id) => list.find(item => item.id === id)
function random(state) {
  let value = state.rng >>> 0
  value ^= value << 13; value ^= value >>> 17; value ^= value << 5
  state.rng = value >>> 0
  return state.rng / 4294967296
}
function nickname(state, recent = []) {
  return require('./names.js').generate(() => random(state), recent)
}
function randomGender(state) { return random(state) < .5 ? 'male' : 'female' }
function rollBase(state) {
  const weights = Array.from({ length: 6 }, () => .7 + random(state) * .6)
  const sum = weights.reduce((a, b) => a + b, 0)
  const points = weights.map(value => value / sum * 120)
  return { maxHp: Math.round(150 + points[0] * 3), atk: Math.round(10 + points[1] * .4),
    def: Math.round(2 + points[2] * .35), crit: 3 + points[3] * .8,
    dodge: 2 + points[4] * .6, spd: .8 + points[5] * .022 }
}
function stats(base, weaponId, stanceId, kind, round = 1, catalog = weapons, growthState) {
  const weapon = find(catalog, weaponId)
  const stance = find(stances, stanceId)
  const enemy = typeof kind === 'string' ? find(legacyEnemies, kind) : { atk: 1, def: 1, hp: 1, spd: 1, dodge: 0 }
  const growth = kind ? 1 + Math.min(60, round - 1) * .025 : 1
  const curve = kind && growthState ? progression.enemyGrowth(round) : { hp: growth, atk: growth, def: growth }
  const attributes = { maxHp: Math.round(base.maxHp * enemy.hp * curve.hp), atk: Math.round(base.atk * weapon.atk * stance.atk * enemy.atk * curve.atk),
    def: Math.round(base.def * stance.def * enemy.def * curve.def),
    spd: Math.min(4, base.spd * weapon.spd * stance.spd * enemy.spd),
    crit: Math.min(60, base.crit + weapon.crit), dodge: Math.min(45, base.dodge + weapon.dodge + stance.dodge + enemy.dodge), pierce: weapon.pierce }
  return kind ? attributes : progression.apply(attributes, growthState)
}
function refreshPlayer(state) {
  state.player.stats = stats(state.player.base, state.weapon, state.stance, null, state.round, weapons, state.progression)
  state.player.hp = state.player.stats.maxHp
  state.player.cooldown = 1000 / state.player.stats.spd
}
function makeEnemy(state) {
  const weapon = weapons[Math.floor(random(state) * weapons.length)].id
  const choices = enemyNaming.catalog.filter(item => item.name !== (state.enemy && state.enemy.name))
  const identity = choices[Math.floor(random(state) * choices.length)]
  const base = rollBase(state)
  const attributes = stats(base, weapon, 'strong', true, state.round, weapons, state.progression)
  state.enemy = { name: identity.name, gender: identity.gender, weapon, base, stats: attributes,
    hp: attributes.maxHp, cooldown: 1000 / attributes.spd }
}
function initialState(seed = Date.now()) {
  const state = { version: 5, combatVersion: 5, runId: (seed >>> 0) || 1, rng: (seed >>> 0) || 1, round: 1, streak: 0, status: 'prepare',
    weapon: 'saber', stance: 'guard', elapsedMs: 0, logs: [], progression: progression.fresh(), report: report.fresh() }
  state.player = { name: nickname(state), gender: 'male', base: rollBase(state) }
  refreshPlayer(state); makeEnemy(state); strategy.resetCombat(state)
  return state
}
function configure(state, key, id) {
  if (state.status !== 'prepare' || (state.progression && state.progression.pending)) return false
  if (key === 'gender' && ['male', 'female'].includes(id)) { state.player.gender = id; return true }
  if (key === 'weapon' && state.round === 1 && find(weapons, id)) state.weapon = id
  else if (key === 'stance' && find(stances, id)) state.stance = id
  else return false
  refreshPlayer(state); return true
}
function reroll(state) {
  if (state.status !== 'prepare' || state.round !== 1) return false
  state.player.base = rollBase(state); refreshPlayer(state); return true
}
function startFight(state) {
  if (state.status !== 'prepare' || (state.progression && state.progression.pending)) return false
  state.combatVersion = 5; delete state.skill
  state.status = 'fighting'; state.logs = []; state.elapsedMs = 0
  strategy.resetCombat(state); state.report = report.fresh()
  return true
}
function nextRound(state) {
  if (state.status !== 'won' || state.round >= 100) return false
  if (!state.progression) state.progression = progression.migrate(state.round)
  state.round++; state.status = 'prepare'; state.logs = []; state.elapsedMs = 0
  state.progression.pending = true; state.report = report.fresh()
  state.combatVersion = 5; delete state.skill
  refreshPlayer(state); makeEnemy(state); strategy.resetCombat(state); return true
}
function chooseUpgrade(state, id) {
  if (state.status !== 'prepare' || !progression.candidates(state).some(item => item.id === id)) return false
  state.progression.counts[id]++; state.progression.pending = false
  refreshPlayer(state); return true
}
function upgradePreview(state, id) {
  const growth = progression.copy(state.progression); growth.counts[id]++
  return stats(state.player.base, state.weapon, state.stance, null, state.round, weapons, growth)
}
function attack(state, side) {
  const attacker = state[side]; const defender = state[side === 'player' ? 'enemy' : 'player']
  const tactical = state.combatVersion >= 2 ? strategy.modifiers(state, side) : null
  const dodged = random(state) * 100 < (tactical ? tactical.dodge : defender.stats.dodge)
  const critical = !dodged && random(state) * 100 < attacker.stats.crit
  const armor = defender.stats.def * (1 - (tactical ? tactical.pierce : attacker.stats.pierce))
  const rolledDamage = dodged ? 0 : Math.max(1, Math.round(attacker.stats.atk * (1 - armor / (armor + 50)) *
    (critical ? 1.8 : 1) * (.9 + random(state) * .2) * (tactical ? tactical.scale : 1)))
  // Overkill cannot contribute charge; older active battles retain their logs.
  const damage = state.combatVersion >= 5 ? Math.min(defender.hp, rolledDamage) : rolledDamage
  const actualDamage = Math.min(defender.hp, damage)
  defender.hp = Math.max(0, defender.hp - damage)
  const event = { side, damage, critical, dodged, time: Math.round(state.elapsedMs) }
  if (tactical) {
    if (tactical.skill) event.skill = tactical.skill
    if (tactical.trait) event.trait = tactical.trait
    event.counter = tactical.counter; event.guarded = tactical.guarded
    strategy.afterAttack(state, side, event)
  }
  if (!state.report) state.report = report.fromLogs(state.logs)
  report.record(state.report, event, actualDamage)
  state.logs.push(event)
  if (state.logs.length > 80) state.logs.shift()
  attacker.cooldown += 1000 / attacker.stats.spd
  if (defender.hp === 0) {
    state.status = side === 'player' ? 'won' : 'lost'
    if (side === 'player') state.streak++
  }
  return event
}
function tick(state, milliseconds) {
  if (state.status !== 'fighting' || !Number.isFinite(milliseconds) || milliseconds <= 0) return []
  let remaining = Math.min(milliseconds, 60000)
  const events = []
  while (state.status === 'fighting') {
    const delay = Math.min(state.player.cooldown, state.enemy.cooldown)
    const delta = Math.min(delay, remaining)
    state.player.cooldown = Math.max(0, state.player.cooldown - delta)
    state.enemy.cooldown = Math.max(0, state.enemy.cooldown - delta)
    state.elapsedMs += delta; remaining -= delta
    if (delay > delta + 1e-7) break
    const both = state.player.cooldown < 1e-7 && state.enemy.cooldown < 1e-7
    const first = both ? (random(state) < .5 ? 'player' : 'enemy') : state.player.cooldown < 1e-7 ? 'player' : 'enemy'
    events.push(attack(state, first))
    if (both && state.status === 'fighting') events.push(attack(state, first === 'player' ? 'enemy' : 'player'))
    if (remaining <= 1e-7) break
  }
  return events
}
function snapshot(state) {
  const actor = value => ({ ...value, base: { ...value.base }, stats: { ...value.stats },
    ...(value.combat ? { combat: { ...value.combat } } : {}) })
  return { ...state, player: actor(state.player), enemy: actor(state.enemy), logs: state.logs.map(item => ({ ...item })),
    ...(state.progression ? { progression: progression.copy(state.progression) } : {}),
    ...(state.report ? { report: report.copy(state.report) } : {}) }
}
const finite = (value, min, max) => Number.isFinite(value) && value >= min && value <= max
function validBase(base) {
  return base && finite(base.maxHp, 180, 260) && finite(base.atk, 13, 25) && finite(base.def, 4, 15) &&
    finite(base.crit, 5, 35) && finite(base.dodge, 4, 30) && finite(base.spd, .9, 1.6)
}
function restore(value) {
  const catalog = value && value.version === 1 ? legacyWeapons : [...weapons, legacyWeapons.find(item => item.id === 'hammer')]
  const normalizeWeapon = id => id === 'hammer' ? 'axe' : id
  if (!value || ![1, 2, 3, 4, 5].includes(value.version) || !Number.isInteger(value.runId) || !finite(value.runId, 1, 4294967295) || !Number.isInteger(value.rng) || !finite(value.rng, 1, 4294967295) ||
    !Number.isInteger(value.round) || !finite(value.round, 1, 100) || !Number.isInteger(value.streak) ||
    value.streak !== value.round - (value.status === 'won' ? 0 : 1) ||
    !['prepare', 'fighting', 'won', 'lost'].includes(value.status) || !find(catalog, value.weapon) || !find(stances, value.stance) ||
    !finite(value.elapsedMs, 0, 3600000) || !value.player || !value.enemy ||
    typeof value.player.name !== 'string' || !value.player.name.trim() || value.player.name.length > 8 ||
    !validBase(value.player.base) || !validBase(value.enemy.base) || !Array.isArray(value.logs) || value.logs.length > 80) return null
  const modern = value.version === 5 && value.combatVersion >= 4
  if (value.progression !== undefined && (!modern || !progression.valid(value.progression, value))) return null
  if (value.report !== undefined && (!report.valid(value.report) || (value.status === 'prepare' &&
    ['player', 'enemy'].some(side => value.report[side].attacks !== 0 || value.report[side].damage !== 0)))) return null
  if (modern) {
    if (value.enemy.kind !== undefined || !enemyNaming.valid(value.enemy.name) || !find(weapons, value.enemy.weapon)) return null
  } else {
    const legacyEnemy = find(legacyEnemies, value.enemy.kind)
    if (!legacyEnemy || normalizeWeapon(value.enemy.weapon) !== legacyEnemy.weapon ||
      !(value.enemy.name === legacyEnemy.name || (value.version === 5 && enemyNaming.valid(value.enemy.name)))) return null
  }
  if (value.version >= 3 && (!(value.version === 3 ? [1, 2] : value.version === 4 ? [1, 2, 3] : [1, 2, 3, 4, 5]).includes(value.combatVersion) ||
    (value.combatVersion < 3 ? !strategy.legacySkills.some(item => item.id === value.skill) : value.skill !== undefined) ||
    !strategy.validCombat(value.player.combat, value.combatVersion) || !strategy.validCombat(value.enemy.combat, value.combatVersion))) return null
  if (value.combatVersion >= 5 && value.status === 'prepare' &&
    ['player', 'enemy'].some(side => value[side].combat.momentum !== 0 || value[side].combat.attacks !== 0 || value[side].combat.hitsTaken !== 0 || value[side].combat.ward)) return null
  for (const side of ['player', 'enemy']) {
    const actor = value[side]
    if (!find(catalog, side === 'player' ? value.weapon : actor.weapon)) return null
    if (actor.gender !== undefined && !['male', 'female'].includes(actor.gender)) return null
    const enemyContext = side === 'enemy' ? (modern ? true : actor.kind) : null
    const expected = stats(actor.base, side === 'player' ? value.weapon : actor.weapon,
      side === 'player' ? value.stance : 'strong', enemyContext, value.round, catalog, value.progression)
    if (!actor.stats || Object.keys(expected).some(key => actor.stats[key] !== expected[key]) ||
      !Number.isInteger(actor.hp) || !finite(actor.hp, 0, expected.maxHp) || !finite(actor.cooldown, 0, 1000 / expected.spd + .001)) return null
  }
  if ((value.status === 'won' && (value.enemy.hp !== 0 || value.player.hp <= 0)) ||
    (value.status === 'lost' && (value.player.hp !== 0 || value.enemy.hp <= 0)) ||
    (['prepare', 'fighting'].includes(value.status) && (!value.player.hp || !value.enemy.hp)) ||
    (value.status === 'prepare' && (value.player.hp !== value.player.stats.maxHp || value.enemy.hp !== value.enemy.stats.maxHp))) return null
  if (value.logs.some(item => !item || !['player', 'enemy'].includes(item.side) || !Number.isInteger(item.damage) ||
    !finite(item.damage, 0, 1000) || typeof item.critical !== 'boolean' || typeof item.dodged !== 'boolean' ||
    !finite(item.time, 0, Math.ceil(value.elapsedMs)) || (item.dodged && (item.damage !== 0 || item.critical)) ||
    (value.version >= 3 && !strategy.validEvent(item, value)))) return null
  const restored = snapshot(value)
  if (!restored.report) restored.report = report.fromLogs(value.logs, value.status === 'prepare')
  restored.weapon = normalizeWeapon(restored.weapon)
  restored.enemy.weapon = normalizeWeapon(restored.enemy.weapon)
  restored.player.gender = restored.player.gender || 'male'
  restored.enemy.gender = restored.enemy.gender || (restored.rng % 2 ? 'female' : 'male')
  if (value.version === 1) {
    for (const side of ['player', 'enemy']) {
      const actor = restored[side]
      const previousSpeed = actor.stats.spd
      actor.stats = stats(actor.base, side === 'player' ? restored.weapon : actor.weapon,
        side === 'player' ? restored.stance : 'strong', side === 'enemy' ? actor.kind : null, restored.round)
      actor.cooldown *= previousSpeed / actor.stats.spd
    }
  }
  if (value.version < 3) {
    restored.skill = 'pierce'
    restored.combatVersion = value.status === 'prepare' ? 2 : 1
    restored.logs = restored.logs.map(({ side, damage, critical, dodged, time }) => ({ side, damage, critical, dodged, time }))
    strategy.resetCombat(restored)
  }
  restored.version = 5
  restored.enemy.name = enemyNaming.migrate(restored.enemy.name, restored.runId, restored.round, restored.enemy.gender)
  if (restored.status === 'prepare' && restored.combatVersion < 5) {
    restored.combatVersion = 5; delete restored.skill; delete restored.enemy.kind; restored.logs = []; restored.report = report.fresh()
    restored.enemy.stats = stats(restored.enemy.base, restored.enemy.weapon, 'strong', true, restored.round)
    restored.enemy.hp = restored.enemy.stats.maxHp; restored.enemy.cooldown = 1000 / restored.enemy.stats.spd
    strategy.resetCombat(restored)
  }
  return restored
}
function loadProgress(read) {
  for (const key of [saveKey, previousSaveKey, strategySaveKey, equipmentSaveKey, legacySaveKey]) {
    try { const state = restore(read(key)); if (state) return state } catch (error) {}
  }
  return null
}
module.exports = { weapons, stances, enemyNames, saveKey, previousSaveKey, strategySaveKey, equipmentSaveKey, legacySaveKey, bestKey, initialState, configure, reroll, nickname, randomGender,
  skills: strategy.skills, weaponSkills: strategy.weaponSkills, weaponSkill: strategy.weaponSkill, skill: strategy.skill, momentum: strategy.momentum,
  legacyTraits: strategy.legacyTraits, counters: strategy.counters, relation: strategy.relation, loadProgress,
  upgrades: progression.upgrades, upgradeChoices: progression.candidates, upgradePreview, chooseUpgrade,
  startFight, nextRound, tick, snapshot, restore, stats }
