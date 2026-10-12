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
const previousWeapons = [
  { id: 'sword', name: '长剑', note: '均衡 · 迅捷', atk: 1.08, spd: 1.1, crit: 5, dodge: 0, pierce: 0 },
  { id: 'saber', name: '大刀', note: '高伤 · 暴击', atk: 1.42, spd: .82, crit: 8, dodge: 0, pierce: 0 },
  { id: 'spear', name: '长枪', note: '精准 · 穿甲', atk: 1.17, spd: .98, crit: 3, dodge: 0, pierce: .2 },
  { id: 'dual', name: '短双刃', note: '连击 · 灵巧', atk: .8, spd: 1.4, crit: 0, dodge: 4, pierce: 0 },
  { id: 'axe', name: '大斧', note: '破甲 · 重击', atk: 1.3, spd: .85, crit: 0, dodge: 0, pierce: .55 },
  { id: 'halberd', name: '戟', note: '威力 · 穿甲', atk: 1.25, spd: .9, crit: 4, dodge: 0, pierce: .35 }
]
const multiplicativeWeapons = previousWeapons.map(item => ({ ...item,
  atk: ({ saber: 1.34, spear: 1.19, dual: .85, halberd: 1.22 })[item.id] || item.atk }))
const subtractiveWeapons = multiplicativeWeapons.map(item => ({ ...item,
  atk: ({ sword: 1.12, saber: 1.36, spear: 1.24, dual: .94, halberd: 1.2 })[item.id] || item.atk }))
const simpleWeapons = subtractiveWeapons.map(item => ({ ...item, pierce: 0,
  atk: ({ spear: 1.3, axe: 1.44, halberd: 1.32 })[item.id] || item.atk,
  note: ({ spear: '长杆 · 贯击', axe: '重击 · 裂甲', halberd: '威力 · 护身' })[item.id] || item.note }))
const weapons = simpleWeapons.map(item => ({ ...item,
  atk: ({ sword: 1.18, saber: 1.42, dual: .98, axe: 1.40 })[item.id] || item.atk,
  crit: ({ sword: 1, saber: 2, spear: .5, halberd: 1 })[item.id] || 0,
  dodge: item.id === 'dual' ? 1 : 0 }))
// Only used to validate old saves before migrating their equipment stats.
const legacyWeapons = [
  { id: 'sword', atk: 1.42, spd: .82, crit: 3, dodge: 0, pierce: 0 },
  { id: 'saber', atk: 1.05, spd: 1, crit: 8, dodge: 0, pierce: 0 },
  { id: 'dual', atk: .8, spd: 1.4, crit: 0, dodge: 4, pierce: 0 },
  { id: 'hammer', atk: 1.3, spd: .85, crit: 0, dodge: 0, pierce: .55 }
]
const previousStances = [
  { id: 'strong', name: '强攻', note: '攻击↑ 防御↓', description: '强攻：提高攻击，以防御换伤害。', atk: 1.2, def: .75, spd: 1, dodge: 0 },
  { id: 'guard', name: '守御', note: '防御↑ 攻击↓', description: '守御：提高防御和闪避，攻击略降。', atk: .95, def: 2.5, spd: 1, dodge: 4 },
  { id: 'agile', name: '游斗', note: '速度↑ 闪避↑', description: '游斗：攻击略降，攻速与闪避提高，以机动换取容错。', atk: .94, def: .85, spd: 1.22, dodge: 8 }
]
const multiplicativeStances = previousStances.map(item => ({ ...item, ...(item.id === 'guard' ? {
  atk: .95, def: 2.1, description: '守御：提高防御与闪避，牺牲部分输出。'
} : item.id === 'agile' ? { atk: .92, spd: 1.2 } : {}) }))
const subtractiveStances = multiplicativeStances.map(item => ({ ...item, ...(item.id === 'guard' ? { def: 1.6 } : {}) }))
const stances = subtractiveStances.map(item => ({ ...item, dodge: ({ guard: 1, agile: 2 })[item.id] || 0,
  ...(item.id === 'agile' ? { atk: .98 } : {}) }))
function stanceCatalog(combatVersion, growthVersion = 2) {
  if (combatVersion >= 9) return stances
  if (combatVersion >= 7) return subtractiveStances
  if (combatVersion === 6) return multiplicativeStances
  // Single-quality saves predate the first agile adjustment, despite sharing
  // combat version 5. Keep their original stance while the battle resumes.
  return combatVersion === 5 && growthVersion >= 2 ? previousStances : previousStances.map(item => item.id === 'agile' ? { ...item, atk: .9, spd: 1.18 } : item)
}
const weaponCatalog = combatVersion => combatVersion >= 9 ? weapons : combatVersion === 8 ? simpleWeapons : combatVersion === 7 ? subtractiveWeapons : combatVersion === 6 ? multiplicativeWeapons : previousWeapons
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
function startingRates(critPoints, dodgePoints, speedPoints) {
  return { crit: Math.max(5, Math.min(8, 5 + critPoints * .1)),
    dodge: Math.max(5, Math.min(7, 5 + dodgePoints * .07)),
    spd: Math.max(.6, Math.min(1.2, .6 + speedPoints * .016)) }
}
function rollBase(state) {
  const weights = Array.from({ length: 6 }, () => .7 + random(state) * .6)
  const sum = weights.reduce((a, b) => a + b, 0)
  const points = weights.map(value => value / sum * 120)
  const rates = state.combatVersion >= 9 ? startingRates(points[3], points[4], points[5]) :
    { crit: 3 + points[3] * .8, dodge: 2 + points[4] * .6, spd: .8 + points[5] * .022 }
  return { maxHp: Math.round(150 + points[0] * 3), atk: Math.round(10 + points[1] * .4),
    def: Math.round(2 + points[2] * (state.combatVersion >= 7 ? .25 : .35)), ...rates }
}
function stats(base, weaponId, stanceId, kind, round = 1, catalog, growthState, combatVersion = 10) {
  catalog = catalog || weaponCatalog(combatVersion)
  const weapon = find(catalog, weaponId)
  const stance = find(stanceCatalog(combatVersion, growthState ? growthState.version : 1), stanceId)
  const enemy = typeof kind === 'string' ? find(legacyEnemies, kind) : { atk: 1, def: 1, hp: 1, spd: 1, dodge: 0 }
  if (combatVersion >= 10) {
    const legacy = growthState && growthState.legacy && (!kind || round % 5 === 0) ? progression.apply(base, growthState.legacy) : base
    base = legacy
    const attributes = { maxHp: base.maxHp, atk: Math.round(base.atk * weapon.atk * stance.atk),
      def: Math.round(base.def * stance.def), spd: Math.min(4, base.spd * weapon.spd * stance.spd),
      crit: Math.min(60, base.crit + weapon.crit), dodge: Math.min(45, base.dodge + weapon.dodge + stance.dodge), pierce: 0 }
    // Fixed rewards are added after equipment, so they are never multiplied.
    return !kind || round % 5 === 0 ? progression.apply(attributes, growthState) : attributes
  }
  const growth = kind ? 1 + Math.min(60, round - 1) * .025 : 1
  const curve = kind && growthState ? progression.enemyGrowth(round, growthState.version) : { hp: growth, atk: growth, def: growth }
  if (combatVersion >= 6) {
    // Growth augments the character before weapon and stance multipliers, so
    // fast weapons cannot get more attack growth merely by attacking faster.
    const grown = kind ? base : progression.apply(base, growthState)
    return { maxHp: Math.round(grown.maxHp * enemy.hp * curve.hp),
      atk: Math.round(grown.atk * weapon.atk * stance.atk * enemy.atk * curve.atk),
      def: Math.round(grown.def * stance.def * enemy.def * curve.def),
      spd: Math.min(4, grown.spd * weapon.spd * stance.spd * enemy.spd),
      crit: Math.min(60, grown.crit + weapon.crit), dodge: Math.min(45, grown.dodge + weapon.dodge + stance.dodge + enemy.dodge), pierce: weapon.pierce }
  }
  const attributes = { maxHp: Math.round(base.maxHp * enemy.hp * curve.hp), atk: Math.round(base.atk * weapon.atk * stance.atk * enemy.atk * curve.atk),
    def: Math.round(base.def * stance.def * enemy.def * curve.def), spd: Math.min(4, base.spd * weapon.spd * stance.spd * enemy.spd),
    crit: Math.min(60, base.crit + weapon.crit), dodge: Math.min(45, base.dodge + weapon.dodge + stance.dodge + enemy.dodge), pierce: weapon.pierce }
  return kind ? attributes : progression.apply(attributes, growthState)
}

function refreshPlayer(state) {
  state.player.stats = stats(state.player.base, state.weapon, state.stance, null, state.round, undefined, state.progression, state.combatVersion)
  state.player.hp = state.player.stats.maxHp
  state.player.cooldown = 1000 / state.player.stats.spd
}
function makeEnemy(state) {
  const weapon = weapons[Math.floor(random(state) * weapons.length)].id
  const choices = enemyNaming.catalog.filter(item => item.name !== (state.enemy && state.enemy.name))
  const identity = choices[Math.floor(random(state) * choices.length)]
  const rolled = rollBase(state)
  const base = state.combatVersion >= 10 ? nearbyEnemyBase(rolled, state.player.base) : rolled
  const attributes = stats(base, weapon, 'strong', true, state.round, undefined, state.progression, state.combatVersion)
  state.enemy = { name: identity.name, gender: identity.gender, weapon, base, stats: attributes,
    hp: attributes.maxHp, cooldown: 1000 / attributes.spd }
}
function nearbyEnemyBase(base, reference) {
  // Reuse allocation randomness for a bounded ±8% variation.
  for (const key of ['maxHp', 'atk', 'def', 'spd', 'crit', 'dodge']) {
    const factor = .92 + .16 * Math.max(0, Math.min(1, (base[key] / reference[key] - .7) / .6))
    base[key] = reference[key] * factor
  }
  base.maxHp = Math.max(180, Math.min(260, Math.round(base.maxHp)))
  base.atk = Math.max(13, Math.min(25, Math.round(base.atk))); base.def = Math.max(4, Math.min(15, Math.round(base.def)))
  base.crit = Math.max(5, Math.min(8, base.crit)); base.dodge = Math.max(5, Math.min(7, base.dodge)); base.spd = Math.max(.6, Math.min(1.2, base.spd))
  return base
}
function refreshEnemy(state) {
  state.enemy.stats = stats(state.enemy.base, state.enemy.weapon, 'strong', true, state.round, undefined, state.progression, state.combatVersion)
  state.enemy.hp = state.enemy.stats.maxHp; state.enemy.cooldown = 1000 / state.enemy.stats.spd
}
function initialState(seed = Date.now()) {
  const state = { version: 5, combatVersion: 10, runId: (seed >>> 0) || 1, rng: (seed >>> 0) || 1, round: 1, streak: 0, status: 'prepare',
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
  state.player.base = rollBase(state); refreshPlayer(state)
  if (state.combatVersion >= 10) {
    state.enemy.base = nearbyEnemyBase(rollBase(state), state.player.base)
    refreshEnemy(state)
  }
  return true
}
function startFight(state) {
  if (state.status !== 'prepare' || (state.progression && state.progression.pending)) return false
  state.combatVersion = Math.max(5, state.combatVersion); delete state.skill
  state.status = 'fighting'; state.logs = []; state.elapsedMs = 0
  strategy.resetCombat(state); state.report = report.fresh()
  return true
}
function nextRound(state) {
  if (state.status !== 'won' || state.round >= 100) return false
  if (!state.progression) state.progression = progression.migrate(state.round)
  else state.progression = progression.promote(state.progression)
  state.round++; state.status = 'prepare'; state.logs = []; state.elapsedMs = 0
  state.progression.pending = true; state.report = report.fresh()
  if (state.combatVersion < 9) {
    const base = state.player.base
    // Reuse the old allocation without rerolling the character or combat RNG.
    state.player.base = { ...base, ...startingRates((base.crit - 3) / .8, (base.dodge - 2) / .6, (base.spd - .8) / .022) }
  }
  state.combatVersion = 10; delete state.skill
  refreshPlayer(state); makeEnemy(state); strategy.resetCombat(state); return true
}
function chooseUpgrade(state, id) {
  const item = progression.candidates(state).find(item => item.id === id)
  if (state.status !== 'prepare' || !item) return false
  progression.add(state.progression, item); state.progression.pending = false
  refreshPlayer(state)
  if (state.combatVersion >= 10 && state.round % 5 === 0) {
    refreshEnemy(state)
  }
  return true
}
function upgradePreview(state, id) {
  const item = progression.candidates(state).find(item => item.id === id)
  if (!item) return { ...state.player.stats }
  const growth = progression.copy(state.progression); progression.add(growth, item)
  return stats(state.player.base, state.weapon, state.stance, null, state.round, undefined, growth, state.combatVersion)
}
function attack(state, side) {
  const attacker = state[side]; const defender = state[side === 'player' ? 'enemy' : 'player']
  const tactical = state.combatVersion >= 2 ? strategy.modifiers(state, side) : null
  const dodged = random(state) * 100 < (tactical ? tactical.dodge : defender.stats.dodge)
  const critical = !dodged && random(state) * 100 < attacker.stats.crit
  let rolledDamage = 0
  if (!dodged) {
    if (state.combatVersion >= 7) {
      const attackValue = attacker.stats.atk * (critical ? 1.8 : 1) * (tactical ? tactical.scale : 1)
      const defense = state.combatVersion >= 8 ? (tactical && tactical.ignoreDefense ? 0 : defender.stats.def) :
        defender.stats.def * (1 - tactical.pierce)
      rolledDamage = Math.max(1, Math.round((attackValue - defense) * (tactical && tactical.guarded ? .75 : 1)))
    } else {
      // Saved battles retain their defense curve and random-number consumption.
      const armor = defender.stats.def * (1 - (tactical ? tactical.pierce : attacker.stats.pierce))
      rolledDamage = Math.max(1, Math.round(attacker.stats.atk * (1 - armor / (armor + 50)) *
        (critical ? 1.8 : 1) * (.9 + random(state) * .2) * (tactical ? tactical.scale : 1)))
    }
  }
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
function validBase(base, combatVersion) {
  return base && finite(base.maxHp, 180, 260) && finite(base.atk, 13, 25) && finite(base.def, 4, 15) &&
    (combatVersion >= 9 ? finite(base.crit, 5, 8) && finite(base.dodge, 5, 7) && finite(base.spd, .6, 1.2) :
      finite(base.crit, 5, 35) && finite(base.dodge, 4, 30) && finite(base.spd, .9, 1.6))
}
function restore(value) {
  const catalog = value && value.version === 1 ? legacyWeapons : [...weaponCatalog(value && value.combatVersion), legacyWeapons.find(item => item.id === 'hammer')]
  const normalizeWeapon = id => id === 'hammer' ? 'axe' : id
  if (!value || ![1, 2, 3, 4, 5].includes(value.version) || !Number.isInteger(value.runId) || !finite(value.runId, 1, 4294967295) || !Number.isInteger(value.rng) || !finite(value.rng, 1, 4294967295) ||
    !Number.isInteger(value.round) || !finite(value.round, 1, 100) || !Number.isInteger(value.streak) ||
    value.streak !== value.round - (value.status === 'won' ? 0 : 1) ||
    !['prepare', 'fighting', 'won', 'lost'].includes(value.status) || !find(catalog, value.weapon) || !find(stances, value.stance) ||
    !finite(value.elapsedMs, 0, 3600000) || !value.player || !value.enemy ||
    typeof value.player.name !== 'string' || !value.player.name.trim() || value.player.name.length > 8 ||
    !validBase(value.player.base, value.combatVersion) || !validBase(value.enemy.base, value.combatVersion) || !Array.isArray(value.logs) || value.logs.length > 80) return null
  const modern = value.version === 5 && value.combatVersion >= 4
  if (value.progression && value.progression.version === 5 && value.combatVersion < 10) return null
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
  if (value.version >= 3 && (!(value.version === 3 ? [1, 2] : value.version === 4 ? [1, 2, 3] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).includes(value.combatVersion) ||
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
      side === 'player' ? value.stance : 'strong', enemyContext, value.round, catalog, value.progression, value.combatVersion || 1)
    if (!actor.stats || Object.keys(expected).some(key => actor.stats[key] !== expected[key]) ||
      !Number.isInteger(actor.hp) || !finite(actor.hp, 0, expected.maxHp) || !finite(actor.cooldown, 0, 1000 / expected.spd + .001)) return null
  }
  if ((value.status === 'won' && (value.enemy.hp !== 0 || value.player.hp <= 0)) ||
    (value.status === 'lost' && (value.player.hp !== 0 || value.enemy.hp <= 0)) ||
    (['prepare', 'fighting'].includes(value.status) && (!value.player.hp || !value.enemy.hp)) ||
    (value.status === 'prepare' && (value.player.hp !== value.player.stats.maxHp || value.enemy.hp !== value.enemy.stats.maxHp))) return null
  if (value.logs.some(item => !item || !['player', 'enemy'].includes(item.side) || !Number.isInteger(item.damage) ||
    !finite(item.damage, 0, value.combatVersion >= 5 ? value[item.side === 'player' ? 'enemy' : 'player'].stats.maxHp : 1000) ||
    typeof item.critical !== 'boolean' || typeof item.dodged !== 'boolean' ||
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
        side === 'player' ? restored.stance : 'strong', side === 'enemy' ? actor.kind : null, restored.round, undefined, undefined, 1)
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
    refreshPlayer(restored)
    restored.enemy.stats = stats(restored.enemy.base, restored.enemy.weapon, 'strong', true, restored.round, undefined, restored.progression, 5)
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
module.exports = { weapons, stances, stanceCatalog, enemyNames, saveKey, previousSaveKey, strategySaveKey, equipmentSaveKey, legacySaveKey, bestKey, initialState, configure, reroll, nickname, randomGender,
  skills: strategy.skills, weaponSkills: strategy.weaponSkills, weaponSkill: strategy.weaponSkill, skill: strategy.skill, momentum: strategy.momentum,
  legacyTraits: strategy.legacyTraits, counters: strategy.counters, relation: strategy.relation, loadProgress,
  upgrades: progression.upgrades, upgradeQualities: progression.qualities, upgradeOdds: progression.odds, ownedUpgrades: progression.owned, upgradeChoices: progression.candidates, upgradePreview, chooseUpgrade,
  startFight, nextRound, tick, snapshot, restore, stats }
