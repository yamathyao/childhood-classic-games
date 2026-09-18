const { classic } = require('./levels.js')

function create(level = classic) {
  const width = level.width || 4
  const height = level.height || 5
  const goal = level.goal || { id: 'cao', x: 1, y: height - 2 }
  const area = level.pieces.reduce((sum, piece) => sum + piece.w * piece.h, 0)
  function initialState() { return { level: level.id, pieces: level.pieces.map(piece => ({ ...piece })), history: [], steps: 0, elapsedMs: 0 } }
  function isValid(pieces) {
    if (!Array.isArray(pieces) || pieces.length !== level.pieces.length) return false
    const occupied = new Set(); const ids = new Set()
    for (const piece of pieces) {
      if (!piece || ids.has(piece.id)) return false
      const template = level.pieces.find(candidate => candidate.id === piece.id)
      if (!template || piece.w !== template.w || piece.h !== template.h) return false
      if (!Number.isInteger(piece.x) || !Number.isInteger(piece.y) || piece.x < 0 || piece.y < 0 || piece.x + piece.w > width || piece.y + piece.h > height) return false
      ids.add(piece.id)
      for (let y = piece.y; y < piece.y + piece.h; y++) for (let x = piece.x; x < piece.x + piece.w; x++) {
        const key = y * width + x; if (occupied.has(key)) return false; occupied.add(key)
      }
    }
    return occupied.size === area
  }
  function isWon(pieces) { const piece = pieces.find(candidate => candidate.id === goal.id); return Boolean(piece && piece.x === goal.x && piece.y === goal.y) }
  function canPlace(pieces, piece, x, y) {
    return x >= 0 && y >= 0 && x + piece.w <= width && y + piece.h <= height && !pieces.some(candidate => candidate.id !== piece.id && x < candidate.x + candidate.w && x + piece.w > candidate.x && y < candidate.y + candidate.h && y + piece.h > candidate.y)
  }
  function canMove(pieces, id, axis, delta) {
    if (!['x', 'y'].includes(axis) || !Number.isInteger(delta) || delta === 0) return false
    const piece = pieces.find(candidate => candidate.id === id); if (!piece || Math.abs(delta) > Math.max(width, height)) return false
    for (let distance = 1; distance <= Math.abs(delta); distance++) { const offset = Math.sign(delta) * distance; if (!canPlace(pieces, piece, piece.x + (axis === 'x' ? offset : 0), piece.y + (axis === 'y' ? offset : 0))) return false }
    return true
  }
  function moveRange(pieces, id, axis) { let min = 0; let max = 0; while (canMove(pieces, id, axis, min - 1)) min--; while (canMove(pieces, id, axis, max + 1)) max++; return { min, max } }
  function move(state, id, axis, delta) {
    if (isWon(state.pieces) || !canMove(state.pieces, id, axis, delta)) return false
    state.history.push({ id, axis, delta }); state.pieces.find(piece => piece.id === id)[axis] += delta; state.steps = state.history.length; return true
  }
  function undo(state) { const previous = state.history.pop(); if (!previous) return false; state.pieces.find(piece => piece.id === previous.id)[previous.axis] -= previous.delta; state.steps = state.history.length; return true }
  function restore(saved) {
    const state = initialState(); if (!saved || saved.version !== 1 || saved.level !== level.id || !Array.isArray(saved.history)) return state
    for (const entry of saved.history) if (!entry || !move(state, entry.id, entry.axis, entry.delta)) return initialState()
    if (Number.isFinite(saved.elapsedMs) && saved.elapsedMs >= 0) state.elapsedMs = Math.floor(saved.elapsedMs); return state
  }
  function snapshot(state) { return { version: 1, level: level.id, history: state.history.map(entry => ({ ...entry })), elapsedMs: Number.isFinite(state.elapsedMs) && state.elapsedMs >= 0 ? Math.floor(state.elapsedMs) : 0 } }
  return { level, initialState, isValid, isWon, canMove, moveRange, move, undo, restore, snapshot }
}

const bound = create(classic)
module.exports = { create, ...bound }
