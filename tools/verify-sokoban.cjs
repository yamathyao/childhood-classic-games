// Verify the checked-in XSokoban catalogue without modifying runtime data.
// The old procedural generator was intentionally removed: running an authoring
// experiment must never overwrite the published XSokoban collection.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { levels, tutorials, originals } = require('../games/sokoban/levels.js')
const { create } = require('../games/sokoban/rules.js')

const solutions = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tests', 'sokoban-solutions.json'), 'utf8'))
const directions = { U: 'up', D: 'down', L: 'left', R: 'right' }
assert.equal(tutorials.length, 26, 'teaching catalogue must contain 26 levels')
assert.equal(originals.length, 20, 'XSokoban challenge catalogue must contain 20 levels')
assert.deepEqual(tutorials.slice(6).map(level => level.sourceOrder), [
  ...Array.from({ length: 17 }, (_, index) => index + 7), 25, 30, 31
])
assert.deepEqual(originals.map(level => level.sourceOrder), Array.from({ length: 20 }, (_, i) => i + 31))

for (const level of levels) {
  const rules = create(level)
  const state = rules.initialState()
  const solution = solutions[level.id]
  assert.equal(typeof solution, 'string', `missing solution: ${level.id}`)
  for (const step of solution) assert.equal(rules.move(state, directions[step]), true, `illegal ${step} in ${level.id}`)
  assert.equal(rules.isWon(state), true, `solution does not win: ${level.id}`)
  assert.equal(state.pushes, level.minimumPushes, `push count drift: ${level.id}`)
}

console.log(`verified ${tutorials.length} teaching levels and ${originals.length} selected XSokoban challenge levels with replay solutions`)
