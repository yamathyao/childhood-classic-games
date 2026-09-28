const assert = require('node:assert/strict')
const { create } = require('../games/driller/rules.js')
const { levels } = require('../games/driller/levels.js')

function clone(state) {
  return { ...state, grid: [...state.grid], danger: [...state.danger], falling: [...state.falling], fallAges: { ...state.fallAges }, damage: { ...state.damage } }
}

function value(state, width) {
  const column = state.player % width
  const row = Math.floor(state.player / width)
  let airDistance = 24
  for (let offset = 0; offset <= 12; offset++) {
    for (let target = 1; target < width - 1; target++) {
      if (state.grid[(row + offset) * width + target] === 'O') airDistance = Math.min(airDistance, offset + Math.abs(target - column) * 1.4)
    }
  }
  return state.depth * 2 + state.oxygen * .65 + state.lives * 250 - airDistance * (state.oxygen < 75 ? 2 : .2) + state.score * .0001
}

function solve(level, seed = level.seed, maxActions = level.targetDepth * 8) {
  const rules = create(level)
  let state = rules.initialState(seed)
  const replay = []
  const visited = new Map()
  for (let count = 0; count < maxActions && !['won', 'lost'].includes(state.status); count++) {
    if (state.status === 'respawn') { rules.revive(state); replay.push('revive') }
    const choices = []
    for (const action of ['down', 'left', 'right', 'up']) {
      const candidate = clone(state)
      if (!rules.move(candidate, action).changed) continue
      for (let tick = 0; tick < 3; tick++) rules.tick(candidate, 50)
      const key = `${candidate.player}:${candidate.grid.slice(Math.max(0, candidate.player - rules.width * 2), candidate.player + rules.width * 4).join('')}`
      const penalty = (visited.get(key) || 0) * 20
      choices.push({ state: candidate, action, key, value: value(candidate, rules.width) - penalty })
    }
    choices.sort((first, second) => second.value - first.value)
    const choice = choices[0]
    if (!choice) { rules.tick(state, 150); replay.push('wait'); continue }
    visited.set(choice.key, (visited.get(choice.key) || 0) + 1)
    state = choice.state
    replay.push(choice.action)
  }
  return { state, replay }
}

if (require.main === module) {
  for (const level of levels) {
    const started = Date.now()
    const { state, replay } = solve(level)
    console.log(`${level.id}: ${state.status}, ${state.depth}m, air=${state.oxygen}, lives=${state.lives}, actions=${replay.length}, verify=${Date.now() - started}ms`)
    assert.equal(state.status, 'won')
  }
}

module.exports = { solve }
