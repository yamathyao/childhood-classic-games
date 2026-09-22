const WIDTH = 10
const HEIGHT = 20
const PIECES = ['I', 'J', 'L', 'O', 'S', 'T', 'Z']
const VERSION = 1

// Each rotation is expressed as four cells in a 4×4 local box. Keeping the
// coordinates explicit makes collision and replay deterministic on every JS
// runtime used by the mini game.
const SHAPES = {
  I: [
    [[0, 1], [1, 1], [2, 1], [3, 1]],
    [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    [[1, 0], [1, 1], [1, 2], [1, 3]]
  ],
  J: [
    [[0, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [0, 2], [1, 2]]
  ],
  L: [
    [[2, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 1], [0, 2]],
    [[0, 0], [1, 0], [1, 1], [1, 2]]
  ],
  O: [
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]]
  ],
  S: [
    [[1, 0], [2, 0], [0, 1], [1, 1]],
    [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[1, 1], [2, 1], [0, 2], [1, 2]],
    [[0, 0], [0, 1], [1, 1], [1, 2]]
  ],
  T: [
    [[1, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [1, 2]],
    [[1, 0], [0, 1], [1, 1], [1, 2]]
  ],
  Z: [
    [[0, 0], [1, 0], [1, 1], [2, 1]],
    [[2, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 2]],
    [[1, 0], [0, 1], [1, 1], [0, 2]]
  ]
}

const KICKS = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1], [0, 1]]
const LINE_POINTS = [0, 100, 300, 500, 800]

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function cellsFor(active) {
  const shape = SHAPES[active.type] && SHAPES[active.type][active.rotation % 4]
  if (!shape) return []
  return shape.map(([x, y]) => [active.x + x, active.y + y])
}

function shuffle(values, random) {
  const result = values.slice()
  for (let i = result.length - 1; i > 0; i--) {
    const value = Number(random())
    const normalized = Number.isFinite(value) ? Math.max(0, Math.min(.999999, value)) : 0
    const j = Math.floor(normalized * (i + 1))
    const tmp = result[i]
    result[i] = result[j]
    result[j] = tmp
  }
  return result
}

function createRules(random = Math.random) {
  function nextBag() { return shuffle(PIECES, random) }

  function spawn(type) {
    return { type, rotation: 0, x: 3, y: 0 }
  }

  function fillQueue(state) {
    while (state.queue.length < 5) {
      if (!state.bag.length) state.bag = nextBag()
      state.queue.push(state.bag.shift())
    }
  }

  function initialState() {
    const state = {
      version: VERSION,
      board: Array(WIDTH * HEIGHT).fill(null),
      active: null,
      queue: [],
      bag: nextBag(),
      score: 0,
      best: 0,
      lines: 0,
      level: 1,
      combo: 0,
      elapsedMs: 0,
      fallMs: 0,
      started: false,
      gameOver: false
    }
    state.active = spawn(state.bag.shift())
    fillQueue(state)
    return state
  }

  function canPlace(state, active) {
    for (const [x, y] of cellsFor(active)) {
      if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return false
      if (state.board[y * WIDTH + x]) return false
    }
    return true
  }

  function markChanged(state) {
    state.started = true
    return { changed: true, lines: 0, locked: false, score: 0 }
  }

  function scoreFor(lines, level, combo = 0) {
    const lineCount = Math.max(0, Math.min(4, Math.floor(lines)))
    const multiplier = Math.max(1, Math.floor(level) || 1)
    const streak = Math.max(0, Math.floor(combo) - 1)
    return LINE_POINTS[lineCount] * multiplier + (lineCount > 0 ? streak * 50 * multiplier : 0)
  }

  function fallInterval(level) {
    const current = Math.max(1, Math.floor(level) || 1)
    return Math.max(70, Math.round(900 * Math.pow(.84, current - 1)))
  }

  function clearLines(state) {
    const remaining = []
    let cleared = 0
    for (let y = HEIGHT - 1; y >= 0; y--) {
      const row = state.board.slice(y * WIDTH, (y + 1) * WIDTH)
      if (row.every(Boolean)) cleared++
      else remaining.unshift(...row)
    }
    while (remaining.length < WIDTH * HEIGHT) remaining.unshift(...Array(WIDTH).fill(null))
    state.board = remaining
    return cleared
  }

  function lock(state) {
    let overflow = false
    for (const [x, y] of cellsFor(state.active)) {
      if (x < 0 || x >= WIDTH || y < 0) { overflow = true; continue }
      if (y >= HEIGHT) { overflow = true; continue }
      state.board[y * WIDTH + x] = state.active.type
    }
    if (overflow) {
      state.gameOver = true
      return { changed: true, lines: 0, locked: true, gameOver: true, score: 0 }
    }
    const lines = clearLines(state)
    if (lines) {
      state.combo += 1
      state.lines += lines
      state.level = Math.floor(state.lines / 10) + 1
    } else state.combo = 0
    const points = scoreFor(lines, state.level, state.combo)
    state.score += points
    state.best = Math.max(state.best, state.score)
    const next = state.queue.shift()
    fillQueue(state)
    state.active = spawn(next)
    state.fallMs = 0
    if (!canPlace(state, state.active)) state.gameOver = true
    return { changed: true, lines, locked: true, gameOver: state.gameOver, score: points }
  }

  function move(state, action) {
    if (!state || state.gameOver || !state.active) return { changed: false, lines: 0, locked: false, score: 0 }
    const dx = action === 'left' ? -1 : action === 'right' ? 1 : 0
    if (action === 'softDrop') {
      const candidate = { ...state.active, y: state.active.y + 1 }
      if (canPlace(state, candidate)) {
        state.active = candidate
        state.score += 1
        state.best = Math.max(state.best, state.score)
        state.started = true
        return { changed: true, lines: 0, locked: false, score: 1 }
      }
      state.started = true
      return lock(state)
    }
    if (!dx) return { changed: false, lines: 0, locked: false, score: 0 }
    const candidate = { ...state.active, x: state.active.x + dx }
    if (!canPlace(state, candidate)) return { changed: false, lines: 0, locked: false, score: 0 }
    state.active = candidate
    return markChanged(state)
  }

  function rotate(state) {
    if (!state || state.gameOver || !state.active) return { changed: false, lines: 0, locked: false, score: 0 }
    const nextRotation = (state.active.rotation + 1) % 4
    for (const [dx, dy] of KICKS) {
      const candidate = { ...state.active, rotation: nextRotation, x: state.active.x + dx, y: state.active.y + dy }
      if (canPlace(state, candidate)) {
        state.active = candidate
        return markChanged(state)
      }
    }
    return { changed: false, lines: 0, locked: false, score: 0 }
  }

  function hardDrop(state) {
    if (!state || state.gameOver || !state.active) return { changed: false, lines: 0, locked: false, score: 0 }
    let distance = 0
    while (canPlace(state, { ...state.active, y: state.active.y + 1 })) {
      state.active = { ...state.active, y: state.active.y + 1 }
      distance++
    }
    state.started = true
    const dropScore = distance * 2
    state.score += dropScore
    state.best = Math.max(state.best, state.score)
    const result = lock(state)
    result.score += dropScore
    return result
  }

  function tick(state, deltaMs) {
    if (!state || state.gameOver || !state.started) return { changed: false, lines: 0, locked: false, score: 0 }
    const elapsed = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0
    state.fallMs += elapsed
    let result = { changed: false, lines: 0, locked: false, score: 0 }
    while (!state.gameOver && state.fallMs >= fallInterval(state.level)) {
      state.fallMs -= fallInterval(state.level)
      const candidate = { ...state.active, y: state.active.y + 1 }
      if (canPlace(state, candidate)) {
        state.active = candidate
        result = { changed: true, lines: 0, locked: false, score: 0 }
      } else {
        const locked = lock(state)
        result = { changed: true, lines: result.lines + locked.lines, locked: true, gameOver: locked.gameOver, score: result.score + locked.score }
      }
    }
    return result
  }

  function validActive(active) {
    return active && PIECES.includes(active.type) && Number.isInteger(active.rotation) && active.rotation >= 0 && active.rotation < 4 &&
      Number.isInteger(active.x) && Number.isInteger(active.y)
  }

  function restore(value) {
    if (!value || value.version !== VERSION || !Array.isArray(value.board) || value.board.length !== WIDTH * HEIGHT ||
      value.board.some(cell => cell !== null && !PIECES.includes(cell)) || !validActive(value.active) ||
      !Array.isArray(value.queue) || value.queue.length < 1 || value.queue.length > 5 || value.queue.some(type => !PIECES.includes(type)) ||
      !Array.isArray(value.bag) || value.bag.some(type => !PIECES.includes(type)) ||
      !Number.isFinite(value.score) || value.score < 0 || !Number.isFinite(value.best) || value.best < 0 ||
      !Number.isInteger(value.lines) || value.lines < 0 || !Number.isInteger(value.level) || value.level < 1 ||
      !Number.isInteger(value.combo) || value.combo < 0 || !Number.isFinite(value.elapsedMs) || value.elapsedMs < 0 ||
      !Number.isFinite(value.fallMs) || value.fallMs < 0 || typeof value.started !== 'boolean' || typeof value.gameOver !== 'boolean') return initialState()
    return clone(value)
  }

  function snapshot(state) { return clone(state) }

  return { initialState, move, rotate, hardDrop, tick, snapshot, restore, isGameOver: state => Boolean(state && state.gameOver), fallInterval, scoreFor, canPlace }
}

module.exports = { WIDTH, HEIGHT, PIECES, SHAPES, cellsFor, createRules }
