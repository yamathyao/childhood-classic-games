const rulesApi = require('../../games/klotski/rules.js')
const { initialState, canMove, isWon } = rulesApi

// Equal-size pieces are interchangeable for search; IDs are preserved in the returned path.
function key(pieces) {
  return pieces.map(piece => `${piece.w}x${piece.h}@${piece.x},${piece.y}`).sort().join('|')
}

function solveLevel(level) {
  const rules = level ? rulesApi.create(level) : rulesApi
  const root = rules.initialState().pieces
  const queue = [{ pieces: root, parent: -1 }]
  const visited = new Set([key(root)])
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const node = queue[cursor]
      if (rules.isWon(node.pieces)) {
      const result = []
      let index = cursor
      while (queue[index].parent !== -1) {
        result.push(queue[index].action)
        index = queue[index].parent
      }
      return result.reverse()
    }
    for (const piece of node.pieces) for (const axis of ['x', 'y']) for (const delta of [-1, 1]) {
      if (!rules.canMove(node.pieces, piece.id, axis, delta)) continue
      const pieces = node.pieces.map(p => ({ ...p }))
      pieces.find(p => p.id === piece.id)[axis] += delta
      const signature = key(pieces)
      if (!visited.has(signature)) {
        visited.add(signature)
        queue.push({ pieces, parent: cursor, action: { id: piece.id, axis, delta } })
      }
    }
    if (queue.length > 100000) throw new Error('Search exceeded bounded classic state space')
  }
  throw new Error('Classic level has no solution')
}

function solve() { return solveLevel() }
module.exports = { solve, solveLevel }
