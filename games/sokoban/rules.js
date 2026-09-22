const { defaultLevel } = require('./levels.js')

const directions = {
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 }
}

function parse(level) {
  const lines = level.map.split('\n')
  const width = lines[0].length
  const height = lines.length
  const walls = new Set(); const goals = new Set(); const boxes = []
  let player = -1; let players = 0
  if (!width || lines.some(line => line.length !== width)) throw new Error(`Non-rectangular map: ${level.id}`)
  lines.forEach((line, y) => Array.from(line).forEach((cell, x) => {
    if (!'# .$@*+'.includes(cell)) throw new Error(`Unknown cell: ${level.id}`)
    if ((x === 0 || y === 0 || x === width - 1 || y === height - 1) && cell !== '#') throw new Error(`Open boundary: ${level.id}`)
    const position = y * width + x
    if (cell === '#') walls.add(position)
    if ('.*+'.includes(cell)) goals.add(position)
    if ('$*'.includes(cell)) boxes.push(position)
    if ('@+'.includes(cell)) { player = position; players++ }
  }))
  if (players !== 1 || boxes.length === 0 || boxes.length !== goals.size) throw new Error(`Invalid map: ${level.id}`)
  const reachable = new Set([player]); const queue = [player]
  for (let index = 0; index < queue.length; index++) {
    const position = queue[index]; const x = position % width; const y = Math.floor(position / width)
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nextX = x + dx; const nextY = y + dy
      if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue
      const next = nextY * width + nextX
      if (walls.has(next) || reachable.has(next)) continue
      reachable.add(next); queue.push(next)
    }
  }
  const gemStyles = level.gemStyles ? [...level.gemStyles] : boxes.map((_, i) => i % 4)
  const goalStyles = new Map([...goals].map((p, i) => [p, level.goalStyles ? level.goalStyles[p] : i % 4]))
  const validStyle = style => Number.isInteger(style) && style >= 0 && style < 4
  if (gemStyles.length !== boxes.length || !gemStyles.every(validStyle)) throw new Error(`Invalid box styles: ${level.id}`)
  const floor = new Set(Array.from({ length: width * height }, (_, position) => position).filter(position => !walls.has(position)))
  const voids = new Set([...floor].filter(position => !reachable.has(position)))
  return { width, height, walls, goals, voids, goalStyles, initialPlayer: player, initialBoxes: boxes, initialStyles: gemStyles }
}

function create(level = defaultLevel) {
  const board = parse(level)
  const { width, height, walls, goals, goalStyles } = board
  const source = JSON.stringify([level.map, board.initialStyles])
  let hash = 2166136261
  for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619)
  const revision = (hash >>> 0).toString(16)
  const saveKey = `sokoban.${level.id}.v3.${revision}`
  const bestKey = `${saveKey}.best`
  const floor = position => Number.isInteger(position) && position >= 0 && position < width * height && !walls.has(position)
  function neighbor(position, vector) {
    const x = position % width + vector.x; const y = Math.floor(position / width) + vector.y
    return x >= 0 && x < width && y >= 0 && y < height ? y * width + x : -1
  }
  function initialState() {
    return { level: level.id, player: board.initialPlayer, boxes: [...board.initialBoxes], gemStyles: [...board.initialStyles], history: [], steps: 0, pushes: 0, elapsedMs: 0 }
  }
  function coords(position) { return { x: position % width, y: Math.floor(position / width) } }
  function isValid(state) {
    if (!state || state.level !== level.id || !floor(state.player) || !Array.isArray(state.boxes) || !Array.isArray(state.gemStyles)) return false
    const occupied = new Set()
    return state.boxes.length === board.initialBoxes.length && state.gemStyles.length === state.boxes.length &&
      state.gemStyles.every(style => Number.isInteger(style) && style >= 0 && style < 4) &&
      state.boxes.every(position => {
        if (!floor(position) || occupied.has(position)) return false
        occupied.add(position); return true
      }) && !occupied.has(state.player)
  }
  function isMatched(state, index) { return goals.has(state.boxes[index]) }
  function isWon(state) { return isValid(state) && state.boxes.every(position => goals.has(position)) }
  function relocate(state, index, destination) {
    const paired = state.boxes.map((position, i) => ({ position: i === index ? destination : position, style: state.gemStyles[i] }))
    paired.sort((a, b) => a.position - b.position)
    state.boxes = paired.map(item => item.position)
    state.gemStyles = paired.map(item => item.style)
  }
  function move(state, direction) {
    const vector = directions[direction]
    if (!vector || !isValid(state) || isWon(state)) return false
    const next = neighbor(state.player, vector)
    if (!floor(next)) return false
    const boxIndex = state.boxes.indexOf(next)
    const destination = boxIndex >= 0 ? neighbor(next, vector) : next
    if (boxIndex >= 0) {
      if (!floor(destination) || state.boxes.includes(destination)) return false
      relocate(state, boxIndex, destination)
    }
    state.history.push({ direction, from: state.player, to: next, pushedFrom: boxIndex >= 0 ? next : null, pushedTo: boxIndex >= 0 ? destination : null })
    state.player = next
    state.steps += 1
    if (boxIndex >= 0) state.pushes += 1
    return true
  }
  function undo(state) {
    const action = state.history[state.history.length - 1]
    if (!action) return false
    if (action.pushedFrom !== null) {
      const index = state.boxes.indexOf(action.pushedTo)
      if (index < 0) return false
      relocate(state, index, action.pushedFrom)
      state.pushes -= 1
    }
    state.history.pop(); state.player = action.from; state.steps -= 1
    return true
  }
  // Static dead-square detection for classic Sokoban. A reverse pull path to
  // any goal is enough; box identity and color have no gameplay meaning.
  const reachableGoals = new Set()
  for (const goal of goals) {
    const queue = [goal]; reachableGoals.add(goal)
    for (let i = 0; i < queue.length; i++) for (const vector of Object.values(directions)) {
      const next = neighbor(queue[i], vector); const stand = neighbor(next, vector)
      if (!floor(next) || !floor(stand) || reachableGoals.has(next)) continue
      reachableGoals.add(next); queue.push(next)
    }
  }
  function deadlockReason(state) {
    if (state.boxes.some(p => !reachableGoals.has(p))) return '木箱已困在死角 · 可悔棋'
    const occupied = new Set(state.boxes)
    for (const box of state.boxes) for (const p of [box, box - 1, box - width, box - width - 1]) {
      if (p < 0 || p % width === width - 1 || p + width + 1 >= width * height) continue
      const block = [p, p + 1, p + width, p + width + 1]
      if (block.every(cell => walls.has(cell) || occupied.has(cell)) &&
          block.some(cell => occupied.has(cell) && !isMatched(state, state.boxes.indexOf(cell)))) return '木箱互相卡住了 · 悔棋腾出回身空间'
    }
    return null
  }
  function snapshot(state) {
    return { version: 3, revision, level: level.id, history: state.history.map(action => ({ ...action })), elapsedMs: Number.isFinite(state.elapsedMs) ? Math.max(0, Math.floor(state.elapsedMs)) : 0 }
  }
  function restore(saved) {
    const state = initialState()
    if (!saved || saved.version !== 3 || saved.revision !== revision || saved.level !== level.id || !Array.isArray(saved.history)) return state
    for (const action of saved.history) if (!action || !move(state, action.direction)) return initialState()
    if (Number.isFinite(saved.elapsedMs) && saved.elapsedMs >= 0) state.elapsedMs = Math.floor(saved.elapsedMs)
    return state
  }
  return { level, board, directions, saveKey, bestKey, initialState, coords, isValid, isMatched, isWon, move, undo, snapshot, restore, deadlockReason }
}

const bound = create(defaultLevel)
module.exports = { create, directions, ...bound }
