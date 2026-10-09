// Kept only for resuming battles saved before weapon-bound skills.
const legacySkills = [
  { id: 'pierce', name: '破甲突袭', short: '破甲', note: '第三次出招穿甲增伤',
    description: '每3次出招：无视防御，伤害+40%。' },
  { id: 'focus', name: '凝神一击', short: '凝神', note: '第三次出招必中重击',
    description: '每3次出招：必中，伤害+40%。' },
  { id: 'renew', name: '回风护体', short: '护体', note: '第三次出招回血护身',
    description: '每3次出招：回血3%，下次受击减伤25%。' }
]
const weaponSkills = [
  { id: 'sword-point', weapon: 'sword', name: '点锋', short: '点锋', note: '精准刺击', description: '必中，伤害+15%。' },
  { id: 'saber-cleave', weapon: 'saber', name: '重斩', short: '重斩', note: '蓄势劈斩', description: '伤害+45%。' },
  { id: 'spear-thrust', weapon: 'spear', name: '贯甲', short: '贯甲', note: '长枪直刺', description: '无视防御，闪避判定减半。' },
  { id: 'dual-flurry', weapon: 'dual', name: '双袭', short: '双袭', note: '双刃合击', description: '两刃合击，伤害+35%。' },
  { id: 'axe-break', weapon: 'axe', name: '裂甲', short: '裂甲', note: '重斧破甲', description: '无视防御，伤害+20%。' },
  { id: 'halberd-ward', weapon: 'halberd', name: '架势', short: '架势', note: '挥戟护身', description: '伤害+20%，下次受击减伤25%。' }
]
const skills = [...legacySkills, ...weaponSkills]
// Old active battles retain these modifiers until the next round.
const legacyTraits = {
  duelist: { name: '刀势', note: '第三次出招伤害 +25%', counters: ['sword', 'dual'] },
  guard: { name: '铁壁', note: '前两次受击减伤 30%', counters: ['axe', 'halberd'] },
  assassin: { name: '影袭', note: '首击伤害 +25%，善于闪避', counters: ['spear'] },
  brute: { name: '蓄力', note: '第三次出招伤害 +35%', counters: ['saber'] }
}
const skill = id => skills.find(item => item.id === id)
const weaponSkill = weapon => weaponSkills.find(item => item.weapon === weapon)
// Hundredths of a point keep saves and split-time combat exactly reproducible.
const momentum = { max: 10000, dealt: 160, taken: 110, critical: 600, dodge: 800 }
const counterTargets = { sword: 'dual', dual: 'axe', axe: 'halberd', halberd: 'spear', spear: 'saber', saber: 'sword' }
const legacyCounters = (weapon, kind) => !!legacyTraits[kind] && legacyTraits[kind].counters.includes(weapon)
const counters = (weapon, target) => !!counterTargets[weapon] && counterTargets[weapon] === target
function relation(weapon, target) {
  if (counters(weapon, target)) return { name: '专属克制', symbol: '→', scale: 1.18, counter: true, disadvantaged: false }
  if (counters(target, weapon)) return { name: '被克制', symbol: '←', scale: 1, counter: false, disadvantaged: true }
  return { name: '势均力敌', symbol: '=', scale: 1, counter: false, disadvantaged: false }
}
const freshCombat = () => ({ attacks: 0, hitsTaken: 0, ward: false })
function resetCombat(state) {
  state.player.combat = freshCombat(); state.enemy.combat = freshCombat()
  if (state.combatVersion >= 5) {
    state.player.combat.momentum = 0; state.enemy.combat.momentum = 0
  }
}
function legacyModifiers(state, side) {
  const attacker = state[side]
  const defender = state[side === 'player' ? 'enemy' : 'player']
  attacker.combat.attacks++
  const result = { scale: 1, pierce: attacker.stats.pierce, dodge: defender.stats.dodge,
    counter: false, skill: null, trait: null, guarded: false }
  if (side === 'player') {
    result.counter = legacyCounters(state.weapon, state.enemy.kind)
    if (result.counter) {
      result.scale *= 1.18
      if (state.weapon === 'spear') result.dodge *= .45
    }
    if (attacker.combat.attacks % 3 === 0) {
      result.skill = state.combatVersion === 2 ? state.skill : weaponSkill(state.weapon).id
      if (result.skill === 'pierce') { result.pierce = 1; result.scale *= 1.4 }
      else if (result.skill === 'focus') { result.dodge = 0; result.scale *= 1.4 }
      else if (result.skill === 'sword-point') { result.dodge = 0; result.scale *= 1.15 }
      else if (result.skill === 'saber-cleave') result.scale *= 1.45
      else if (result.skill === 'spear-thrust') { result.pierce = 1; result.dodge *= .5 }
      else if (result.skill === 'dual-flurry') result.scale *= 1.35
      else if (result.skill === 'axe-break') { result.pierce = 1; result.scale *= 1.2 }
      else if (result.skill === 'halberd-ward') result.scale *= 1.2
    }
    if (state.enemy.kind === 'guard' && defender.combat.hitsTaken < 2) {
      if (!result.counter && result.pierce !== 1) { result.scale *= .7; result.guarded = true }
    }
  } else {
    const kind = state.enemy.kind
    if ((kind === 'duelist' || kind === 'brute') && attacker.combat.attacks % 3 === 0) {
      result.trait = kind; result.scale *= kind === 'brute' ? 1.35 : 1.25
    } else if (kind === 'assassin' && attacker.combat.attacks === 1) {
      result.trait = kind; result.scale *= 1.25
    }
    if (defender.combat.ward) { result.scale *= .75; result.guarded = true }
  }
  return result
}
function modifiers(state, side) {
  if (state.combatVersion < 4) return legacyModifiers(state, side)
  const attacker = state[side]; const defender = state[side === 'player' ? 'enemy' : 'player']
  const weapon = side === 'player' ? state.weapon : state.enemy.weapon
  const target = side === 'player' ? state.enemy.weapon : state.weapon
  const match = relation(weapon, target)
  attacker.combat.attacks++
  const result = { scale: match.scale, pierce: attacker.stats.pierce, dodge: defender.stats.dodge,
    counter: match.counter, skill: null, trait: null, guarded: false }
  const ready = state.combatVersion >= 5 ? attacker.combat.momentum >= momentum.max : attacker.combat.attacks % 3 === 0
  if (ready) {
    if (state.combatVersion >= 5) attacker.combat.momentum = 0
    result.skill = weaponSkill(weapon).id
    if (weapon === 'sword') { result.dodge = 0; result.scale *= 1.15 }
    else if (weapon === 'saber') result.scale *= 1.45
    else if (weapon === 'spear') { result.pierce = 1; result.dodge *= .5 }
    else if (weapon === 'dual') result.scale *= 1.35
    else if (weapon === 'axe') { result.pierce = 1; result.scale *= 1.2 }
    else if (weapon === 'halberd') result.scale *= 1.2
  }
  if (defender.combat.ward) { result.scale *= .75; result.guarded = true }
  return result
}
function afterAttack(state, side, event) {
  const defender = state[side === 'player' ? 'enemy' : 'player']
  if (!event.dodged) {
    defender.combat.hitsTaken++
    if (state.combatVersion >= 4 || side === 'enemy') defender.combat.ward = false
  }
  if (side === 'player' && event.skill === 'renew') {
    const player = state.player
    const healed = Math.min(player.stats.maxHp - player.hp, Math.round(player.stats.maxHp * .03))
    player.hp += healed; player.combat.ward = true; event.healed = healed
  }
  if (event.skill === 'halberd-ward' && (state.combatVersion >= 4 || side === 'player')) state[side].combat.ward = true
  if (state.combatVersion >= 5) {
    const attacker = state[side]
    const gain = (actor, amount) => { actor.combat.momentum = Math.min(momentum.max, actor.combat.momentum + amount) }
    if (event.dodged) gain(defender, momentum.dodge)
    else {
      gain(attacker, Math.round(event.damage / defender.stats.maxHp * momentum.dealt * 100) + (event.critical ? momentum.critical : 0))
      gain(defender, Math.round(event.damage / defender.stats.maxHp * momentum.taken * 100))
    }
  }
}
function validCombat(value, combatVersion) {
  return value && Number.isInteger(value.attacks) && value.attacks >= 0 && value.attacks <= 20000 &&
    Number.isInteger(value.hitsTaken) && value.hitsTaken >= 0 && value.hitsTaken <= 20000 && typeof value.ward === 'boolean' &&
    (combatVersion < 5 || (Number.isInteger(value.momentum) && value.momentum >= 0 && value.momentum <= momentum.max))
}
function validEvent(event, state) {
  const actorWeapon = event.side === 'player' ? state.weapon : state.enemy.weapon
  const allowedSkill = state.combatVersion >= 3 ? event.skill === weaponSkill(actorWeapon).id : legacySkills.some(item => item.id === event.skill)
  return (event.skill === undefined || (allowedSkill && (state.combatVersion >= 4 || event.side === 'player'))) &&
    (event.trait === undefined || (state.combatVersion < 4 && event.side === 'enemy' && event.trait === state.enemy.kind && !!legacyTraits[event.trait])) &&
    (event.counter === undefined || typeof event.counter === 'boolean') &&
    (event.guarded === undefined || typeof event.guarded === 'boolean') &&
    (event.healed === undefined || (event.skill === 'renew' && Number.isInteger(event.healed) && event.healed >= 0 &&
      event.healed <= Math.round(state.player.stats.maxHp * .03)))
}
module.exports = { skills, legacySkills, weaponSkills, skill, weaponSkill, momentum, legacyTraits, counters, relation, freshCombat, resetCombat, modifiers, afterAttack, validCombat, validEvent }
