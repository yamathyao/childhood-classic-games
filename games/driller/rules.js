const COLORS = 'ABCD'
const DIRECTIONS = { left: [-1, 0], right: [1, 0], down: [0, 1], up: [0, -1] }
const STEP_MS = 50

function create(level) {
  const rows = level.rows
  const width = rows && rows[0] && rows[0].length
  const height = rows && rows.length
  if (!width || !height || rows.some(row => row.length !== width || /[^#.ABCDXOP]/.test(row))) throw new Error('Invalid driller map')
  const original = rows.join('').split('')
  const spawn = original.indexOf('P')
  if (spawn < 0 || original.lastIndexOf('P') !== spawn) throw new Error('Invalid driller spawn')
  const spawnRow = Math.floor(spawn / width)
  const targetRow = level.targetDepth + spawnRow
  if (!Number.isInteger(level.targetDepth) || targetRow >= height - 1 || level.targetDepth <= 0) throw new Error('Invalid driller depth')
  const settings = { maxOxygen: 100, airRestore: 20, hardHits: 5, hardCost: 20, lives: 3, oxygenPeriod: 1000, warningMs: 500, fallMs: 100, ...level }
  if (!['maxOxygen', 'airRestore', 'hardHits', 'hardCost', 'lives', 'oxygenPeriod', 'warningMs', 'fallMs'].every(key => Number.isInteger(settings[key]) && settings[key] > 0)) throw new Error('Invalid driller configuration')
  const caches = new WeakMap()
  const neighbors = position => [position % width > 0 ? position - 1 : -1, position % width < width - 1 ? position + 1 : -1, position - width, position + width].filter(next => next >= 0 && next < original.length)
  const isBlock = color => COLORS.includes(color) || color === 'X'
  const mobile = color => isBlock(color) || color === 'O'

  function clusters(state) {
    const cached = caches.get(state)
    if (cached) return cached
    const visited = new Uint8Array(state.grid.length)
    const groups = []
    const owners = new Int32Array(state.grid.length).fill(-1)
    state.grid.forEach((color, position) => {
      if (!mobile(color) || visited[position]) return
      const cells = [position]
      visited[position] = 1
      for (let cursor = 0; cursor < cells.length; cursor++) {
        if (color === 'O') break
        neighbors(cells[cursor]).forEach(next => {
          if (!visited[next] && state.grid[next] === color) { visited[next] = 1; cells.push(next) }
        })
      }
      cells.forEach(cell => { owners[cell] = groups.length })
      groups.push({ color, cells })
    })
    const supported = new Set()
    const above = groups.map(() => new Set())
    groups.forEach((group, index) => group.cells.forEach(position => {
      const below = position + width
      if (below >= state.grid.length || state.grid[below] === '#') supported.add(index)
      else if (owners[below] >= 0 && owners[below] !== index) above[owners[below]].add(index)
    }))
    const queue = [...supported]
    for (let cursor = 0; cursor < queue.length; cursor++) {
      for (const index of above[queue[cursor]]) if (!supported.has(index)) { supported.add(index); queue.push(index) }
    }
    const value = { groups, supported, owners }
    caches.set(state, value)
    return value
  }

  function updateDanger(state) {
    const { groups, supported } = clusters(state)
    state.danger = groups.flatMap((group, index) => supported.has(index) ? [] : group.cells)
    const danger = new Set(state.danger)
    for (const position of Object.keys(state.fallAges)) if (!danger.has(Number(position))) delete state.fallAges[position]
  }

  function initialState(seed = level.seed || 1) {
    const grid = level.makeRows ? level.makeRows(seed).join('').split('') : [...original]
    grid[spawn] = '.'
    const state = { seed: seed >>> 0, grid, player: spawn, oxygen: settings.maxOxygen, maxOxygen: settings.maxOxygen,
      depth: 0, score: 0, combo: 0, steps: 0, status: 'playing', reason: null, lives: settings.lives,
      started: false, elapsedMs: 0, remainderMs: 0, oxygenClock: 0, invincibleMs: 0,
      danger: [], fallAges: {}, falling: [], damage: {} }
    updateDanger(state)
    return state
  }

  function clearCells(state, cells, color, events, chain = false) {
    cells.forEach(position => { state.grid[position] = '.'; delete state.damage[position]; delete state.fallAges[position] })
    state.falling = state.falling.filter(position => mobile(state.grid[position]))
    state.score += cells.length * (chain ? 20 * Math.max(1, state.combo) : 10)
    caches.delete(state)
    events.push({ type: 'clear', cells: [...cells], color, combo: state.combo })
  }

  function collect(state, position, events) {
    state.grid[position] = '.'
    caches.delete(state)
    state.oxygen = Math.min(settings.maxOxygen, state.oxygen + settings.airRestore)
    state.score += 50
    events.push({ type: 'air', position })
  }

  function loseLife(state, reason, events) {
    if (state.status !== 'playing') return
    state.lives--
    state.reason = reason
    state.status = state.lives > 0 ? 'respawn' : 'lost'
    events.push({ type: 'death', reason })
  }

  function settlePlayer(state, events) {
    if (state.status !== 'playing') return
    if (state.grid[state.player] === 'O') collect(state, state.player, events)
    while (state.player + width < state.grid.length && ['.', 'O'].includes(state.grid[state.player + width])) {
      state.player += width
      if (state.grid[state.player] === 'O') collect(state, state.player, events)
    }
    state.depth = Math.max(state.depth, Math.floor(state.player / width) - spawnRow)
  }

  function checkWin(state) {
    if (state.status === 'playing' && state.depth >= level.targetDepth) state.status = 'won'
  }

  function physics(state, events) {
    const { groups, supported, owners } = clusters(state)
    if (supported.size === groups.length && !state.falling.length) {
      settlePlayer(state, events)
      state.combo = 0
      checkWin(state)
      return
    }
    const previousFalling = new Set(state.falling)
    const landed = groups.filter((group, index) => supported.has(index) && group.cells.some(position => previousFalling.has(position)))
    const chains = landed.filter(group => group.color !== 'O' && group.cells.length >= 4)
    if (chains.length) {
      state.combo++
      chains.forEach(group => clearCells(state, group.cells, group.color, events, true))
      state.falling = state.falling.filter(position => mobile(state.grid[position]))
      updateDanger(state)
      settlePlayer(state, events)
      checkWin(state)
      return
    }
    const ready = new Set()
    const stillFalling = []
    groups.forEach((group, index) => {
      if (supported.has(index)) return
      const age = Math.max(0, ...group.cells.map(position => state.fallAges[position] || 0)) + STEP_MS
      group.cells.forEach(position => { state.fallAges[position] = Math.min(Math.max(settings.warningMs, settings.fallMs), age) })
      const inFlight = group.cells.some(position => previousFalling.has(position))
      const threshold = inFlight ? settings.fallMs : settings.warningMs
      if (age >= threshold) ready.add(index)
      else if (inFlight) stillFalling.push(...group.cells)
    })
    let blocked = true
    while (blocked) {
      blocked = false
      for (const index of ready) {
        if (groups[index].cells.some(position => owners[position + width] >= 0 && owners[position + width] !== index && !ready.has(owners[position + width]))) {
          ready.delete(index); blocked = true
          if (groups[index].cells.some(position => previousFalling.has(position))) stillFalling.push(...groups[index].cells)
        }
      }
    }
    const entries = [...ready].flatMap(index => groups[index].cells.map(position => ({ position, color: groups[index].color, damage: state.damage[position] || 0 })))
    entries.forEach(entry => { state.grid[entry.position] = '.'; delete state.damage[entry.position]; delete state.fallAges[entry.position] })
    for (const entry of entries) {
      const target = entry.position + width
      if (target === state.player && entry.color === 'O') { collect(state, target, events); continue }
      if (target === state.player && state.invincibleMs > 0) continue
      state.grid[target] = entry.color
      if (entry.damage) state.damage[target] = entry.damage
      state.fallAges[target] = 0
      stillFalling.push(target)
      events.push({ type: 'fall', from: entry.position, to: target, color: entry.color })
      if (target === state.player) loseLife(state, 'crushed', events)
    }
    state.falling = stillFalling
    if (entries.length) caches.delete(state)
    settlePlayer(state, events)
    updateDanger(state)
    if (!state.danger.length && !state.falling.length) state.combo = 0
    checkWin(state)
  }

  function move(state, action) {
    if (state.status !== 'playing' || typeof action !== 'string' || !Object.prototype.hasOwnProperty.call(DIRECTIONS, action)) return { changed: false, events: [] }
    const [deltaX, deltaY] = DIRECTIONS[action]
    const column = state.player % width + deltaX
    const target = state.player + deltaX + deltaY * width
    if (column < 0 || column >= width || target < 0 || target >= state.grid.length || state.grid[target] === '#') return { changed: false, events: [] }
    if (action === 'up' && !isBlock(state.grid[target])) return { changed: false, events: [] }
    const events = []
    state.started = true
    state.steps++
    const color = state.grid[target]
    if (color === 'X') {
      state.damage[target] = (state.damage[target] || 0) + 1
      events.push({ type: 'hit', position: target })
      if (state.damage[target] < settings.hardHits) return { changed: true, events }
      clearCells(state, [target], color, events)
      state.oxygen = Math.max(0, state.oxygen - settings.hardCost)
      if (state.oxygen === 0) loseLife(state, 'oxygen', events)
    } else if (COLORS.includes(color)) {
      const group = clusters(state).groups.find(group => group.cells.includes(target))
      clearCells(state, group.cells, color, events)
    }
    if (action !== 'up' && state.status === 'playing') state.player = target
    settlePlayer(state, events)
    updateDanger(state)
    checkWin(state)
    return { changed: true, events }
  }

  function tick(state, elapsedMs) {
    if (state.status !== 'playing' || !state.started || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return { changed: false, events: [] }
    const events = []
    state.remainderMs += Math.min(1000, elapsedMs)
    while (state.remainderMs >= STEP_MS && state.status === 'playing') {
      state.remainderMs -= STEP_MS
      state.elapsedMs += STEP_MS
      state.invincibleMs = Math.max(0, state.invincibleMs - STEP_MS)
      state.oxygenClock += STEP_MS
      if (state.oxygenClock >= settings.oxygenPeriod) {
        state.oxygenClock -= settings.oxygenPeriod
        state.oxygen = Math.max(0, state.oxygen - 1)
        if (state.oxygen === 0) { loseLife(state, 'oxygen', events); break }
      }
      physics(state, events)
    }
    return { changed: true, events }
  }

  function revive(state) {
    if (state.status !== 'respawn' || state.lives <= 0) return false
    const events = []
    const cells = [state.player, ...neighbors(state.player)].filter(position => state.grid[position] !== '#')
    cells.forEach(position => { state.grid[position] = '.'; delete state.damage[position]; delete state.fallAges[position] })
    caches.delete(state)
    state.oxygen = settings.maxOxygen; state.oxygenClock = 0; state.remainderMs = 0
    state.status = 'playing'; state.reason = null; state.invincibleMs = 1500
    state.falling = state.falling.filter(position => mobile(state.grid[position]))
    settlePlayer(state, events); updateDanger(state); checkWin(state)
    return true
  }

  function snapshot(state) {
    const { danger, ...saved } = state
    return { ...saved, grid: [...state.grid], falling: [...state.falling],
      damage: { ...state.damage }, fallAges: { ...state.fallAges }, version: 2, levelId: level.id }
  }

  function restore(saved) {
    if (!saved || saved.version !== 2 || saved.levelId !== level.id || !Number.isInteger(saved.seed) || saved.seed < 0 || saved.seed > 4294967295) return null
    const state = initialState(saved.seed)
    if (!Array.isArray(saved.grid) || saved.grid.length !== original.length || saved.grid.some((color, position) => typeof color !== 'string' || !/^[#.ABCDXO]$/.test(color) || (color === '#') !== (original[position] === '#'))) return null
    const bounds = { player: [0, original.length - 1], oxygen: [0, settings.maxOxygen], depth: [0, level.targetDepth],
      score: [0, 100000000], combo: [0, original.length], steps: [0, 1000000], lives: [0, settings.lives],
      elapsedMs: [0, 86400000], oxygenClock: [0, settings.oxygenPeriod - 1], invincibleMs: [0, 1500] }
    if (Object.entries(bounds).some(([key, [minimum, maximum]]) => !Number.isInteger(saved[key]) || saved[key] < minimum || saved[key] > maximum)) return null
    if (!Number.isFinite(saved.remainderMs) || saved.remainderMs < 0 || saved.remainderMs >= 1000 + STEP_MS || typeof saved.started !== 'boolean' || saved.maxOxygen !== settings.maxOxygen) return null
    if (!['playing', 'won', 'respawn', 'lost'].includes(saved.status) || ![null, 'oxygen', 'crushed'].includes(saved.reason)) return null
    if (['playing', 'won'].includes(saved.status) && (saved.grid[saved.player] !== '.' || saved.lives < 1 || saved.oxygen < 1 || saved.reason !== null)) return null
    if (saved.status === 'lost' && saved.lives !== 0 || saved.status === 'respawn' && (saved.lives < 1 || saved.reason === null)) return null
    if (saved.status === 'won' && saved.depth !== level.targetDepth || saved.depth < Math.floor(saved.player / width) - spawnRow) return null
    if (!Array.isArray(saved.falling) || saved.falling.length > original.length || new Set(saved.falling).size !== saved.falling.length || saved.falling.some(position => !Number.isInteger(position) || position < 0 || position >= original.length || !mobile(saved.grid[position]))) return null
    for (const [key, maximum] of [['damage', settings.hardHits - 1], ['fallAges', Math.max(settings.warningMs, settings.fallMs)]]) {
      const values = saved[key]
      if (!values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).length > original.length) return null
      if (Object.entries(values).some(([position, value]) => !/^\d+$/.test(position) || Number(position) >= original.length || !Number.isInteger(value) || value < 0 || value > maximum || (key === 'damage' ? saved.grid[position] !== 'X' : !mobile(saved.grid[position])))) return null
    }
    const copy = JSON.parse(JSON.stringify(saved))
    Object.keys(state).filter(key => key !== 'danger').forEach(key => { state[key] = copy[key] })
    caches.delete(state); updateDanger(state)
    return state
  }

  return { level, width, height, initialState, move, tick, revive, snapshot, restore,
    isWon: state => state.status === 'won', isLost: state => state.status === 'lost',
    saveKey: `driller.${level.id}.v2`, bestKey: `driller.${level.id}.best.v2` }
}

module.exports = { create, COLORS, STEP_MS }
