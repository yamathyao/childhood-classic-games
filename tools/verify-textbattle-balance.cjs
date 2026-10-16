const assert = require('node:assert/strict')
const rules = require('../games/textbattle/rules.js')
const { routes, choose } = require('./verify-textbattle-growth.cjs')
const rounds = [1, 5, 10, 20, 30, 60, 100]
function random(state) {
  let value = state.rng >>> 0
  value ^= value << 13; value ^= value >>> 17; value ^= value << 5
  state.rng = value >>> 0
  return state.rng / 4294967296
}
// Reproduce the v9 allocation and enemy rolls before comparing its growth
// curve with v10 fixed rewards and five-fight cycles. Preserve RNG draw order.
function oldBase(state) {
  const weights = Array.from({ length: 6 }, () => .7 + random(state) * .6)
  const sum = weights.reduce((a, b) => a + b, 0)
  const points = weights.map(w => w / sum * 120)
  return { maxHp: Math.round(150 + points[0] * 3), atk: Math.round(10 + points[1] * .4),
    def: Math.round(2 + points[2] * .25), crit: Math.min(8, 5 + points[3] * .1),
    dodge: Math.min(7, 5 + points[4] * .07), spd: Math.min(1.2, .6 + points[5] * .016) }
}
function assertSameAllocation(old, current) {
  for (const key of ['maxHp', 'atk', 'def']) assert.equal(old[key], current[key])
}
function refresh(state) {
  for (const side of ['player', 'enemy']) {
    const actor = state[side]
    actor.stats = rules.stats(actor.base, side === 'player' ? state.weapon : actor.weapon,
      side === 'player' ? state.stance : 'strong', side === 'enemy', state.round, undefined, state.progression, state.combatVersion)
    actor.hp = actor.stats.maxHp; actor.cooldown = 1000 / actor.stats.spd
  }
}
// Paired seeds compare the old and new rules; every sample uses legitimately
// earned growth. These independent duels are not consecutive-run success rates.
function verify(samples = 10) {
  let battles = 0; const results = []
  for (const combatVersion of [9, 10]) for (const [route, priorities] of Object.entries(routes)) {
    const groups = Object.fromEntries(rounds.map(round => [round, { stances: {}, weapons: {}, hits: 0, floorHits: 0, longestFloorRun: 0, longest: 0 }]))
    for (const weapon of rules.weapons) for (let seed = 1; seed <= samples; seed++) {
      const runSeed = Math.imul(seed, 2654435761) >>> 0
      const training = rules.initialState(runSeed)
      training.progression.version = combatVersion === 9 ? 4 : 6
      if (combatVersion === 9) {
        const allocation = { rng: runSeed }; rules.nickname(allocation)
        const playerBase = oldBase(allocation)
        random(allocation); random(allocation)
        const enemyBase = oldBase(allocation)
        assertSameAllocation(playerBase, training.player.base)
        assert.equal(allocation.rng, training.rng)
        training.player.base = playerBase; training.enemy.base = enemyBase
      }
      // Same allocation and growth odds compare the complete rate/balance change.
      training.combatVersion = combatVersion; training.weapon = weapon.id; refresh(training)
      for (let round = 1; round <= 100; round++) {
        if (rounds.includes(round)) for (const enemy of rules.weapons) for (const stance of rules.stances) {
          const state = rules.snapshot(training)
          state.enemy.weapon = enemy.id; state.stance = stance.id; refresh(state)
          rules.startFight(state)
          const events = [...rules.tick(state, 60000), ...rules.tick(state, 60000)]
          assert.ok(['won', 'lost'].includes(state.status), 'combat must finish within 120 seconds')
          assert.ok(rules.restore(rules.snapshot(state)), `${combatVersion}/${route}/${round}/${weapon.id}/${stance.id}`)
          const group = groups[round]; const floorRun = { player: 0, enemy: 0 }
          group.longest = Math.max(group.longest, state.elapsedMs)
          for (const event of events) {
            if (!event.dodged) { group.hits++; group.floorHits += event.damage === 1 }
            floorRun[event.side] = event.damage === 1 ? floorRun[event.side] + 1 : 0
            group.longestFloorRun = Math.max(group.longestFloorRun, floorRun[event.side])
          }
          for (const [collection, name] of [[groups[round].stances, stance.name], [groups[round].weapons, weapon.name]]) {
            const row = collection[name] || (collection[name] = { wins: 0, battles: 0, duration: 0 })
            row.wins += state.status === 'won'; row.battles++; row.duration += state.elapsedMs
          }
          battles++
        }
        if (round < 100) {
          training.status = 'won'; training.enemy.hp = 0; training.streak = round
          const savedBase = { ...training.player.base }; const allocation = { rng: training.rng }
          assert.ok(rules.nextRound(training)); training.combatVersion = combatVersion
          if (combatVersion === 9) {
            training.player.base = savedBase
            random(allocation); random(allocation)
            const enemyBase = oldBase(allocation)
            assert.equal(allocation.rng, training.rng)
            training.enemy.base = enemyBase
          }
          training.progression.version = combatVersion === 9 ? 4 : 6
          if (combatVersion === 9) delete training.progression.legacy
          refresh(training)
          choose(training, priorities, route === 'quality')
        }
      }
    }
    const summarize = collection => Object.fromEntries(Object.entries(collection).map(([name, row]) => [name, {
      wins: +(row.wins / row.battles * 100).toFixed(1), seconds: +(row.duration / row.battles / 1000).toFixed(1)
    }]))
    for (const round of rounds) results.push({ combatVersion, route, round,
      longestSeconds: +(groups[round].longest / 1000).toFixed(1),
      floorHitPercent: +(groups[round].floorHits / groups[round].hits * 100).toFixed(1),
      longestFloorRun: groups[round].longestFloorRun,
      stances: summarize(groups[round].stances), weapons: summarize(groups[round].weapons) })
  }
  return { battles, samples, results }
}
if (require.main === module) console.log(JSON.stringify(verify(), null, 2))
module.exports = { verify }
