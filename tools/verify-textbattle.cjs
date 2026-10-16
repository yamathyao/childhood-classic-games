const assert = require('node:assert/strict')
const rules = require('../games/textbattle/rules.js')

// Equal base stats isolate equipment, stance and momentum from character rolls.
function battle(seed, weapon, enemyWeapon, stance, round = 1) {
  const state = rules.initialState(seed)
  rules.configure(state, 'weapon', weapon); rules.configure(state, 'stance', stance)
  state.enemy.base = { ...state.player.base }; state.enemy.weapon = enemyWeapon
  state.round = round; state.streak = round - 1
  // This original check isolates momentum with the original enemy curve.
  delete state.progression
  state.enemy.stats = rules.stats(state.enemy.base, enemyWeapon, 'strong', true, round)
  state.enemy.hp = state.enemy.stats.maxHp; state.enemy.cooldown = 1000 / state.enemy.stats.spd
  rules.startFight(state)
  const events = rules.tick(state, 60000)
  assert.ok(['won', 'lost'].includes(state.status), 'battle must finish within a minute')
  assert.ok(rules.restore(rules.snapshot(state)), 'final state must remain restorable')
  for (const actor of [state.player, state.enemy]) assert.ok(actor.combat.momentum >= 0 && actor.combat.momentum <= rules.momentum.max)
  return { state, events }
}

function verify(samples = 100) {
  const totals = []
  for (const weapon of rules.weapons) {
    const result = { weapon: weapon.name, battles: 0, wins: 0, skills: 0, attacks: 0, firstAttacks: [], firstSeconds: [] }
    for (const enemy of rules.weapons) for (const stance of rules.stances) for (let seed = 1; seed <= samples; seed++) {
      const { state, events } = battle(seed * 2654435761 >>> 0, weapon.id, enemy.id, stance.id)
      result.battles++; result.wins += state.status === 'won'
      const own = events.filter(event => event.side === 'player')
      result.attacks += own.length; result.skills += own.filter(event => event.skill).length
      const first = own.findIndex(event => event.skill)
      if (first >= 0) { result.firstAttacks.push(first + 1); result.firstSeconds.push(own[first].time / 1000) }
    }
    const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length
    totals.push({ weapon: result.weapon, battles: result.battles,
      winPercent: +(result.wins / result.battles * 100).toFixed(1),
      skillsPerBattle: +(result.skills / result.battles).toFixed(2),
      attacksToFirstSkill: +mean(result.firstAttacks).toFixed(2),
      secondsToFirstSkill: +mean(result.firstSeconds).toFixed(2),
      skillPercentOfAttacks: +(result.skills / result.attacks * 100).toFixed(1),
      battlesWithSkillPercent: +(result.firstAttacks.length / result.battles * 100).toFixed(1) })
  }
  // Later-round scaling must not overflow charge or cause instant skill loops.
  for (const round of [10, 30, 60, 100]) for (const weapon of rules.weapons) for (const enemy of rules.weapons) {
    battle(42, weapon.id, enemy.id, 'guard', round)
  }
  return totals
}

// Both sides use strong stance. Average each ordered matchup with the reversed
// seating so simultaneous-attack priority does not favor a weapon's row.
function matchups(samples = 1000) {
  assert.ok(Number.isInteger(samples) && samples > 0)
  const wins = rules.weapons.map(() => rules.weapons.map(() => 0))
  for (let row = 0; row < rules.weapons.length; row++) for (let col = 0; col < rules.weapons.length; col++) {
    for (let seed = 1; seed <= samples; seed++) {
      const { state } = battle(seed * 2654435761 >>> 0, rules.weapons[row].id, rules.weapons[col].id, 'strong')
      wins[row][col] += state.status === 'won'
    }
  }
  const percentages = wins.map(() => [])
  for (let row = 0; row < rules.weapons.length; row++) for (let col = row; col < rules.weapons.length; col++) {
    const tenths = Math.round((wins[row][col] + samples - wins[col][row]) / (2 * samples) * 1000)
    percentages[row][col] = tenths / 10
    percentages[col][row] = (1000 - tenths) / 10
  }
  return {
    battles: rules.weapons.length ** 2 * samples, samples, stance: 'strong',
    swappedSides: true, weapons: rules.weapons.map(item => item.name),
    rows: rules.weapons.map((weapon, row) => {
      const rates = wins[row].map((value, col) => (value + samples - wins[col][row]) / (2 * samples) * 100)
      return { weapon: weapon.name, winPercents: percentages[row],
        averageVsOthers: +(rates.reduce((sum, value, col) => sum + (col === row ? 0 : value), 0) /
          (rules.weapons.length - 1)).toFixed(1) }
    })
  }
}

if (require.main === module) {
  console.log(JSON.stringify(process.argv.includes('--matchups') ? matchups() :
    { battles: 10800, momentum: rules.momentum, results: verify() }, null, 2))
}
module.exports = { battle, verify, matchups }
