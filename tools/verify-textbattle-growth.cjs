const assert = require('node:assert/strict')
const rules = require('../games/textbattle/rules.js')
const routes = {
  attack: ['atk', 'crit', 'spd', 'hp', 'def', 'dodge'],
  survival: ['hp', 'def', 'dodge', 'atk', 'spd', 'crit'],
  speed: ['spd', 'dodge', 'crit', 'atk', 'hp', 'def']
}
const rounds = [1, 5, 10, 20, 30, 60, 100]
function choose(state, route) {
  const options = rules.upgradeChoices(state)
  const choice = [...options].sort((a, b) => route.indexOf(a.id) - route.indexOf(b.id))[0]
  assert.ok(choice && rules.chooseUpgrade(state, choice.id))
}
// Isolated matchups compare characters who have legitimately taken N-1 rewards.
// They are not estimates of surviving an entire uninterrupted 100-battle run.
function verify(samples = 30) {
  const results = []; let battles = 0
  for (const [routeName, route] of Object.entries(routes)) {
    const groups = Object.fromEntries(rounds.map(round => [round, { wins: 0, battles: 0, duration: 0, longest: 0, weapons: {} }]))
    for (const weapon of rules.weapons) for (let seed = 1; seed <= samples; seed++) {
      const training = rules.initialState(Math.imul(seed, 2654435761) >>> 0)
      rules.configure(training, 'weapon', weapon.id)
      for (let round = 1; round <= 100; round++) {
        if (rounds.includes(round)) for (const enemy of rules.weapons) {
          const state = rules.snapshot(training)
          state.enemy.weapon = enemy.id
          state.enemy.stats = rules.stats(state.enemy.base, enemy.id, 'strong', true, round, rules.weapons, state.progression)
          state.enemy.hp = state.enemy.stats.maxHp; state.enemy.cooldown = 1000 / state.enemy.stats.spd
          rules.startFight(state); rules.tick(state, 60000); rules.tick(state, 60000)
          assert.ok(['won', 'lost'].includes(state.status), 'Combat must finish within 120 seconds')
          assert.ok(rules.restore(rules.snapshot(state)), `${routeName}/${round}/${weapon.id}`)
          const row = groups[round]; const win = Number(state.status === 'won')
          row.wins += win; row.battles++; row.duration += state.elapsedMs
          row.longest = Math.max(row.longest, state.elapsedMs); battles++
          const w = row.weapons[weapon.name] || (row.weapons[weapon.name] = { wins: 0, battles: 0 })
          w.wins += win; w.battles++
        }
        if (round < 100) {
          training.status = 'won'; training.enemy.hp = 0; training.streak = round
          assert.ok(rules.nextRound(training)); choose(training, route)
        }
      }
    }
    for (const round of rounds) {
      const row = groups[round]
      results.push({ route: routeName, round, wins: +(row.wins / row.battles * 100).toFixed(1),
        meanSeconds: +(row.duration / row.battles / 1000).toFixed(1), longestSeconds: +(row.longest / 1000).toFixed(1),
        weapons: Object.fromEntries(Object.entries(row.weapons).map(([name, r]) => [name, +(r.wins / r.battles * 100).toFixed(1)])) })
    }
  }
  return { battles, results }
}
if (require.main === module) console.log(JSON.stringify(verify(), null, 2))
module.exports = { verify, choose, routes }
