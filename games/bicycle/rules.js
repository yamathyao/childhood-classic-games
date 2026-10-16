const SAVE_KEY = 'bicycle.records.v1'
const TAU = Math.PI * 2
const SECTION = 2400
const OBSTACLE_OFFSET = 2280
const MIN_SPEED = 300
const MAX_SPEED = 520
const GRAVITY = 620
const HOLD_DELAY = .18
const SPIN_SPEED = 5.8
const CRASH_DURATION = 1.2
const CRASH_REASONS = { rock: '撞上山石', log: '撞上倒木', gear: '撞上营地杂物', barrier: '撞上路障', van: '撞上露营车侧面' }
// Enough clearance for roadside hazards without replacing the larger ramps.
const JUMP_SPEED = 280
const RIDER_SCALE = .78
const scaled = points => points.map(p => ({ x: p.x * RIDER_SCALE, y: p.y * RIDER_SCALE, r: p.r * RIDER_SCALE }))
const WHEELS = scaled([{ x: -30, y: 8, r: 18 }, { x: 30, y: 8, r: 18 }])
const BODY = scaled([{ x: 12, y: -44, r: 9 }, { x: -3, y: -32, r: 10 }, { x: -12, y: -22, r: 9 }])
const COLLIDERS = WHEELS.concat(BODY)
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const wrapAngle = value => Math.atan2(Math.sin(value), Math.cos(value))
// Monotone Hermite road profiles join with a common tangent. The road changes
// grade continuously; only marked wooden lips and cliffs have discontinuities.
const NODES = [0, 300, 700, 1000, 1600, 2000, SECTION]
const PROFILES = [
  { name: '林间缓坡', heights: [0, 40, 110, 200, 380, 420, 470] },
  { name: '长陡坡', heights: [0, 40, 320, 440, 650, 750, 810] },
  { name: '峡谷大落差', heights: [0, 30, 110, 175, 330, 400, 460] },
  { name: '小坡起伏', heights: [0, 40, 85, 120, 260, 330, 380] },
  { name: '高山大坡', heights: [0, 60, 390, 660, 1010, 1100, 1160] },
  { name: '林道连坡', heights: [0, 35, 120, 210, 380, 490, 560] }
]
const FEATURES = [
  { kind: 'ramp', start: 350, lip: 490, end: 490, height: 78, power: 425 },
  { kind: 'natural', start: 450, lip: 586, end: 790, height: 112, power: 365 },
  { kind: 'drop', start: 510, lip: 630, end: 630, height: 270, power: 0 },
  { kind: 'natural', start: 360, lip: 436, end: 550, height: 34, power: 245 },
  { kind: 'natural', start: 620, lip: 800, end: 1070, height: 140, power: 420 },
  { kind: 'ramp', start: 360, lip: 475, end: 475, height: 52, power: 350 }
]
const RISES = PROFILES.map((p, i) => p.heights.at(-1) + (FEATURES[i].kind === 'drop' ? FEATURES[i].height : 0))
const CYCLE_RISE = RISES.reduce((sum, value) => sum + value, 0)
const CURVES = PROFILES.map(p => NODES.slice(0, -1).map((start, i) => {
  const length = NODES[i + 1] - start
  const tangent = n => n === 0 || n === p.heights.length - 1 ? .12 : (p.heights[n + 1] - p.heights[n - 1]) / (NODES[n + 1] - NODES[n - 1])
  const a = p.heights[i]; const b = p.heights[i + 1]; const m = tangent(i) * length; const n = tangent(i + 1) * length
  return [2 * a - 2 * b + m + n, -3 * a + 3 * b - 2 * m - n, m, a]
}))
// Only adjacent visible sections are retained, independent of ride duration.
const SECTIONS = new Map()
const BLOCKS = new Map()
let worldSeed = 0
let lastSeed = 0

function randomSeed() {
  let seed = (Math.floor(Math.random() * 0xffffffff) ^ Date.now()) >>> 0
  if (!seed || seed === lastSeed) seed = (lastSeed + 1) >>> 0 || 1
  lastSeed = seed; return seed
}
function setWorldSeed(seed = 0) {
  worldSeed = Number.isFinite(seed) ? seed >>> 0 : 0
  SECTIONS.clear(); BLOCKS.clear()
}
function hash(index, salt) {
  let value = (worldSeed ^ Math.imul(index + 1, 0x9e3779b1) ^ salt) >>> 0
  value = Math.imul(value ^ value >>> 16, 0x85ebca6b)
  value = Math.imul(value ^ value >>> 13, 0xc2b2ae35)
  return (value ^ value >>> 16) >>> 0
}
function blockData(index) {
  if (BLOCKS.has(index)) return BLOCKS.get(index)
  const types = [0, 1, 2, 3, 4, 5]
  if (worldSeed) for (let i = 5; i > 0; i--) {
    const j = hash(index, i * 1777) % (i + 1)
    ;[types[i], types[j]] = [types[j], types[i]]
  }
  const offsets = []; let rise = 0
  for (const type of types) { offsets.push(rise); rise += RISES[type] }
  const block = { types, offsets }
  if (BLOCKS.size >= 12) BLOCKS.delete(BLOCKS.keys().next().value)
  BLOCKS.set(index, block); return block
}
function sectionType(index) { return blockData(Math.floor(index / 6)).types[((index % 6) + 6) % 6] }
function sceneKind(index) {
  const kinds = ['camp', 'highway', 'railway']
  if (!worldSeed) return kinds[((index % 3) + 3) % 3]
  const group = Math.floor(index / 3); const shift = hash(group, 8021) % 3
  const direction = hash(group, 3331) % 2 ? 1 : 2
  return kinds[((index % 3) * direction + shift) % 3]
}

function camperGeometry(x, index, height = baseHeight) {
  const w = 106; const h = 52
  // Wheel hubs and silhouette are measured from props atlas tile 8 (120 x 67).
  const angle = Math.atan((height(x + 30) - height(x - 28)) / 58)
  const cos = Math.cos(angle); const sin = Math.sin(angle); const radius = 7.6
  let y = Infinity
  for (const hubX of [-27.4, 29.8]) {
    const worldX = x + hubX * cos + radius * sin
    y = Math.min(y, height(worldX) - hubX * sin + radius * cos - radius)
  }
  const world = ([px, py]) => [x + (px / 120 - .5) * w * cos - (py / 67 - 1) * h * sin,
    y + (px / 120 - .5) * w * sin + (py / 67 - 1) * h * cos]
  // Follow the luggage/rack, rounded roof and front shoulder already in the art.
  const roof = [[8, 22], [13, 15], [17, 12], [18, 3], [21, 1], [57, 1], [60, 6], [76, 7], [79, 12], [98, 12], [105, 14]].map(world)
  const hull = roof.concat([[114, 30], [120, 38], [119, 58], [7, 59], [0, 50], [0, 36]].map(world))
  return { id: index, key: `van:${index}`, kind: 'van', x, y, w, h, angle, roof, hull,
    left: Math.min(...hull.map(p => p[0])), right: Math.max(...hull.map(p => p[0])) }
}

function roofHeight(solid, x) {
  if (!solid.roof) return Math.abs(x - solid.x) <= solid.w / 2 ? solid.y - solid.h : Infinity
  for (let i = 1; i < solid.roof.length; i++) {
    const a = solid.roof[i - 1]; const b = solid.roof[i]
    if (x >= a[0] && x <= b[0]) return a[1] + (x - a[0]) * (b[1] - a[1]) / (b[0] - a[0])
  }
  return Infinity
}

function roofWheelY(solid, x, radius) {
  if (!solid.roof) {
    const dx = Math.max(0, Math.abs(x - solid.x) - solid.w / 2)
    return dx < radius ? solid.y - solid.h - Math.sqrt(radius * radius - dx * dx) : Infinity
  }
  let y = Infinity
  for (let i = 1; i < solid.roof.length; i++) {
    const a = solid.roof[i - 1]; const b = solid.roof[i]
    if (x + radius < a[0] || x - radius > b[0]) continue
    const grade = (b[1] - a[1]) / (b[0] - a[0])
    const contactX = clamp(x - grade * radius / Math.sqrt(1 + grade * grade), a[0], b[0])
    const dx = contactX - x
    if (Math.abs(dx) < radius) y = Math.min(y, a[1] + (contactX - a[0]) * grade - Math.sqrt(radius * radius - dx * dx))
  }
  return y
}

function profile(index) { return PROFILES[sectionType(index)] }
function baseHeight(x) {
  if (x < 0) return x * .12
  const index = Math.floor(x / SECTION); const block = blockData(Math.floor(index / 6)); const type = block.types[index % 6]; const local = x - index * SECTION
  let segment = 0
  while (segment < NODES.length - 2 && local >= NODES[segment + 1]) segment++
  const t = (local - NODES[segment]) / (NODES[segment + 1] - NODES[segment]); const c = CURVES[type][segment]
  return Math.floor(index / 6) * CYCLE_RISE + block.offsets[index % 6] + ((c[0] * t + c[1]) * t + c[2]) * t + c[3]
}
function sectionData(index) {
  if (SECTIONS.has(index)) return SECTIONS.get(index)
  const type = sectionType(index); const f = FEATURES[type]
  const offset = index * SECTION
  const shift = worldSeed ? hash(index, 711) % 41 - 20 : 0
  const launch = { ...f, start: offset + f.start + shift, lip: offset + f.lip + shift, end: offset + f.end + shift }
  const kind = sceneKind(index)
  const landmark = { id: index, kind, name: { camp: '松果营地', highway: '盘山公路', railway: '山谷铁路' }[kind],
    start: launch.start - 160, end: launch.lip + 630, x: launch.lip + (kind === 'railway' && f.kind === 'drop' ? 190 : 145) }
  const crossing = { ...landmark, start: offset + 1100, end: offset + 2350 }
  let entryY = 0; let exitY = 0; let entrySlope = 0; let exitSlope = 0
  if (kind !== 'camp') {
    const drop = kind === 'highway' ? 48 : 32; const extra = f.kind === 'drop' ? f.height : 0
    Object.assign(crossing, { name: kind === 'highway' ? '公路横越' : '隧道上方', start: offset + 1280, approachEnd: offset + 1365,
      lip: offset + 1420, deckEnd: offset + 1740, end: offset + 1960, drop, deckY: baseHeight(offset + 1365) + extra + drop })
    entryY = baseHeight(crossing.start) + extra; exitY = baseHeight(crossing.end) + extra
    entrySlope = (baseHeight(crossing.start + .25) - baseHeight(crossing.start - .25)) / .5
    exitSlope = (baseHeight(crossing.end + .25) - baseHeight(crossing.end - .25)) / .5
  }
  const x = offset + (worldSeed ? 2220 + hash(index, 912) % 81 : OBSTACLE_OFFSET)
  const obstacleKind = worldSeed ? ['rock', 'log', 'gear', 'barrier'][hash(index, 551) % 4]
    : index % 6 === 3 ? 'gear' : index % 6 === 4 ? 'barrier' : index % 2 ? 'log' : 'rock'
  const obstacle = { id: index, kind: obstacleKind, x, y: baseHeight(x) + (f.kind === 'drop' ? f.height : 0),
    w: obstacleKind === 'gear' ? 44 : obstacleKind === 'rock' ? 42 : 54, h: obstacleKind === 'log' ? 25 : 30 }
  obstacle.key = `hazard:${index}`
  // Campers only occupy the two short-launch templates with a proven landing
  // gap; large ramps and cliffs retain their empty run-out before the hazard.
  const parked = kind === 'camp' && (type === 0 || type === 3)
    ? camperGeometry(landmark.x + 175, index, x => featureHeight(x, launch)) : null
  const edge = kind === 'camp' ? null : { lip: crossing.lip, height: crossing.drop,
    label: kind === 'highway' ? '小落差 · 横越公路' : '小落差 · 掠过隧道顶' }
  const cliff = f.kind === 'drop' ? { lip: launch.lip, height: f.height, label: '断崖飞落 · 大落差' } : null
  const data = { feature: launch, landmark, route: crossing, entryY, exitY, entrySlope, exitSlope, obstacle, parked, solids: parked ? [parked, obstacle] : [obstacle], edge, cliff }
  if (SECTIONS.size >= 12) SECTIONS.delete(SECTIONS.keys().next().value)
  SECTIONS.set(index, data); return data
}
function feature(index) { return { ...sectionData(index).feature } }
function landmark(index) { return { ...sectionData(index).landmark } }
function landmarks(from, to) {
  const result = []
  for (let i = Math.max(0, Math.floor((from - 800) / SECTION)); i <= Math.floor((to + 200) / SECTION); i++) {
    const item = landmark(i)
    if (item.end >= from && item.start <= to) result.push(item)
  }
  return result
}
function route(index) {
  return { ...sectionData(index).route }
}
function routes(from, to) {
  const result = []
  for (let i = Math.max(0, Math.floor(from / SECTION)); i <= Math.floor(to / SECTION); i++) {
    const item = route(i)
    if (item.end >= from && item.start <= to) result.push(item)
  }
  return result
}
function surfaceKind(x) {
  const item = sectionData(Math.max(0, Math.floor(x / SECTION))).route
  return item.kind !== 'camp' && x >= item.lip && x <= item.deckEnd ? item.kind : 'dirt'
}
function trailHeight(x) {
  const f = sectionData(Math.max(0, Math.floor(x / SECTION))).feature
  return featureHeight(x, f)
}
function featureHeight(x, f) {
  if (f.kind === 'drop') return baseHeight(x) + (x >= f.lip ? f.height : 0)
  let height = 0
  if (x >= f.start && x < f.end) {
    const t = (x - f.start) / (f.end - f.start)
    height = f.kind === 'ramp' ? t * f.height : Math.sin(t * Math.PI) ** 2 * f.height
  }
  return baseHeight(x) - height
}
function blendHeight(x, start, end, a, b, inSlope, outSlope) {
  const length = end - start; const t = (x - start) / length
  return (2 * t ** 3 - 3 * t ** 2 + 1) * a + (t ** 3 - 2 * t ** 2 + t) * length * inSlope
    + (-2 * t ** 3 + 3 * t ** 2) * b + (t ** 3 - t ** 2) * length * outSlope
}
function terrain(x) {
  const data = sectionData(Math.max(0, Math.floor(x / SECTION))); const item = data.route
  if (item.kind === 'camp' || x < item.start || x > item.end) return trailHeight(x)
  if (x < item.approachEnd) return blendHeight(x, item.start, item.approachEnd, data.entryY, item.deckY - item.drop, data.entrySlope, 0)
  if (x < item.lip) return item.deckY - item.drop
  if (x <= item.deckEnd) return item.deckY
  return blendHeight(x, item.deckEnd, item.end, item.deckY, data.exitY, 0, data.exitSlope)
}
function dropEdge(x) {
  const data = sectionData(Math.max(0, Math.floor(x / SECTION)))
  return data.edge && x >= data.route.start ? data.edge : data.cliff
}
function slope(x) {
  const edge = dropEdge(x)
  if (edge && Math.abs(x - edge.lip) < 2) {
    const at = x < edge.lip ? edge.lip - 3 : edge.lip + 3
    return (terrain(at + .25) - terrain(at - .25)) / .5
  }
  const f = sectionData(Math.max(0, Math.floor(x / SECTION))).feature
  if (f.kind !== 'natural' && Math.abs(x - f.lip) < 2) {
    const at = x < f.lip ? f.lip - 3 : f.lip + 3
    return (terrain(at + .25) - terrain(at - .25)) / .5
  }
  return (terrain(x + .25) - terrain(x - .25)) / .5
}
function roadAngle(x) {
  const edge = dropEdge(x)
  if (edge && Math.abs(x - edge.lip) < 34) return Math.atan(slope(x))
  const f = sectionData(Math.max(0, Math.floor(x / SECTION))).feature
  // A vertical cliff is not a rideable slope. Do not include its lower road
  // when setting the grounded bike's angle before it leaves the upper lip.
  if (f.kind !== 'natural' && Math.abs(x - f.lip) < 34) return Math.atan(slope(x))
  return Math.atan((terrain(x + 30) - terrain(x - 30)) / 60)
}
function surfaceHeight(x, key) {
  if (key) {
    for (const solid of sectionData(Math.max(0, Math.floor(x / SECTION))).solids) {
      if (solid.key === key) return Math.min(terrain(x), roofHeight(solid, x))
    }
  }
  return terrain(x)
}
function rideHeight(x, key = null) { return surfaceHeight(x, key) }
function rideAngle(x, key = null) {
  if (!key) return roadAngle(x)
  const solid = sectionData(Math.max(0, Math.floor(x / SECTION))).solids.find(item => item.key === key)
  if (!solid || !solid.roof) return 0
  const first = solid.roof[0][0]; const last = solid.roof.at(-1)[0]
  const a = clamp(x - 23, first, last); const b = clamp(x + 23, first, last)
  return b > a ? Math.atan((roofHeight(solid, b) - roofHeight(solid, a)) / (b - a)) : solid.angle
}
function surfaces(from, to) {
  const result = []
  for (let i = Math.max(0, Math.floor((from - 60) / SECTION)); i <= Math.floor((to + 60) / SECTION); i++) {
    for (const solid of sectionData(i).solids) {
      if ((solid.right ?? solid.x + solid.w / 2) < from || (solid.left ?? solid.x - solid.w / 2) > to) continue
      result.push(solid.roof ? { ...solid, roof: solid.roof.map(p => [...p]), hull: solid.hull.map(p => [...p]) } : { ...solid })
    }
  }
  return result
}
function obstacles(from, to) {
  const result = []
  for (let i = Math.max(0, Math.floor((from - 45) / SECTION)); i <= Math.floor((to + 45) / SECTION); i++) {
    const obstacle = sectionData(i).obstacle; const x = obstacle.x
    if (x + 38 < from || x - 38 > to) continue
    result.push({ ...obstacle })
  }
  return result
}
function transform(point, state) {
  const cos = Math.cos(state.angle); const sin = Math.sin(state.angle)
  return { x: state.x + point.x * cos - point.y * sin, y: state.y + point.x * sin + point.y * cos, r: point.r }
}
function contacts(state) {
  const depth = point => point.y + point.r - rideHeight(point.x, state.supportId)
  return { wheels: WHEELS.map(p => ({ ...transform(p, state), type: 'wheel' })),
    body: BODY.map(p => ({ ...transform(p, state), type: 'body' })), depth }
}
function supportY(x, angle, key = null) {
  const cos = Math.cos(angle); const sin = Math.sin(angle); let y = Infinity
  const solid = key && sectionData(Math.max(0, Math.floor(x / SECTION))).solids.find(item => item.key === key)
  for (const p of WHEELS) {
    const wheelX = x + p.x * cos - p.y * sin; const offsetY = p.x * sin + p.y * cos
    y = Math.min(y, terrain(wheelX) - offsetY - p.r)
    if (solid) {
      y = Math.min(y, roofWheelY(solid, wheelX, p.r) - offsetY)
    }
  }
  return y
}
function initialState(seed) {
  if (seed !== undefined) setWorldSeed(seed)
  const x = 80; const angle = roadAngle(x); const y = supportY(x, angle)
  return { seed: worldSeed, x, y, cameraY: terrain(x), cameraZoom: 1, vy: 0, omega: 0, speed: MIN_SPEED, angle, grounded: true, status: 'ready',
    time: 0, held: false, holdTime: 0, rotation: 0, flips: 0, airFlips: 0, score: 0, combo: 0,
    distance: 0, cleared: -1, routeCleared: -1, message: '山路已就绪', messageTime: 0, crashReason: '', dropLip: null,
    tricking: false, takeoffAngle: angle, supportId: null, landingTime: 0, landingImpact: 0, crashMotion: null }
}
function begin(state) { if (state.status === 'ready') state.status = 'running' }
function launch(state, power, label) {
  state.grounded = false; state.vy = -power; state.rotation = 0; state.airFlips = 0
  state.takeoffAngle = state.angle; state.supportId = null
  state.omega = clamp(state.omega * .2, -.6, .6); state.tricking = false; state.landingTime = 0
  state.message = label; state.messageTime = .9
}
function press(state) {
  if (state.status !== 'running' || state.held) return false
  state.held = true; state.holdTime = 0
  if (state.grounded) {
    const grade = state.supportId ? Math.tan(rideAngle(state.x, state.supportId)) : slope(state.x)
    launch(state, JUMP_SPEED, '小跃起')
    // Preserve downhill momentum: the hop is relative to the road rather
    // than an increasingly powerful vertical jump on steeper slopes.
    state.vy += state.speed * grade
  }
  return true
}
function release(state) { state.held = false; state.holdTime = 0 }
function crash(state, reason) {
  if (state.status !== 'running') return
  state.status = 'crashing'; state.crashReason = reason; state.message = reason; release(state)
  state.grounded = false; state.airFlips = 0; state.tricking = false
  const restAngle = roadAngle(state.x)
  const turn = ((restAngle + Math.PI / 2 - state.angle) % TAU + TAU) % TAU
  state.crashMotion = { elapsed: 0, vx: state.speed * .48, startAngle: state.angle,
    endAngle: state.angle + Math.max(.8, turn), restAngle, settled: false }
  state.omega = 0; state.supportId = null
  state.vy = -145; state.dropLip = null
}
function land(state, previousX = state.x, previousY = state.y - 1, previousAngle = state.angle) {
  const cos = Math.cos(state.angle); const sin = Math.sin(state.angle)
  // All contact shapes share the same geometry as the drawn rider and wheels.
  // Body contact takes precedence when both cross the ground in the same small step.
  for (const p of BODY) {
    const x = state.x + p.x * cos - p.y * sin; const y = state.y + p.x * sin + p.y * cos
    if (y + p.r >= terrain(x)) { crash(state, '人体先着地'); return false }
  }
  let touching = false
  for (const p of WHEELS) {
    const x = state.x + p.x * cos - p.y * sin; const y = state.y + p.x * sin + p.y * cos
    if (y + p.r >= terrain(x)) touching = true
  }
  let supportId = null; let top = Infinity
  const oldCos = Math.cos(previousAngle); const oldSin = Math.sin(previousAngle)
  for (const solid of sectionData(Math.max(0, Math.floor(state.x / SECTION))).solids) {
    if (Math.abs(solid.x - state.x) > solid.w / 2 + 50) continue
    if (hitObstacle(state, solid, true)) { crash(state, '人体撞上障碍'); return false }
    for (const p of WHEELS) {
      const x = state.x + p.x * cos - p.y * sin
      const roof = roofWheelY(solid, x, p.r)
      if (!Number.isFinite(roof)) continue
      const center = state.y + p.x * sin + p.y * cos
      const oldCenter = previousY + p.x * oldSin + p.y * oldCos
      const oldX = previousX + p.x * oldCos - p.y * oldSin
      let oldRoof = roofWheelY(solid, oldX, p.r)
      if (!Number.isFinite(oldRoof)) oldRoof = solid.roof
        ? solid.roof[oldX < solid.roof[0][0] ? 0 : solid.roof.length - 1][1] - p.r : solid.y - solid.h - p.r
      if (oldCenter <= oldRoof + .6 && center >= roof && state.vy >= 0 && roof < top) {
        supportId = solid.key; top = roof; touching = true
      }
    }
  }
  if (!touching) return false
  const target = rideAngle(state.x, supportId); const error = wrapAngle(state.angle - target)
  if (Math.abs(error) > 1.2 || Math.abs(state.omega) > 4.5 && Math.abs(error) > .65) {
    crash(state, '落地失衡'); return false
  }
  state.landingImpact = clamp((state.vy - state.speed * (supportId ? Math.tan(target) : slope(state.x))) / 650, 0, 1)
  state.landingTime = .32
  state.grounded = true; state.vy = 0
  state.airFlips = state.tricking ? Math.max(0, Math.round((state.takeoffAngle - state.angle) / TAU)) : 0
  state.angle = target + error
  state.omega = clamp(state.omega, -2, 2)
  state.supportId = supportId
  state.y = supportY(state.x, state.angle, supportId)
  // A safe upright landing closes the turn, including a slightly banked
  // takeoff/landing. Partial turns and reverse corrections cannot add laps.
  if (state.airFlips) {
    state.flips += state.airFlips; state.combo++
    const reward = state.airFlips * 150 + Math.min(state.combo - 1, 5) * 30
    state.score += reward; state.message = `${state.airFlips} 圈空翻 · +${reward}`
  } else { state.combo = 0; state.message = '稳稳落地' }
  state.messageTime = 1.2
  state.rotation = 0; state.airFlips = 0
  state.tricking = false
  state.dropLip = null
  return true
}
function hitObstacle(state, obstacle, bodyOnly = false) {
  const cos = Math.cos(state.angle); const sin = Math.sin(state.angle)
  for (const p of bodyOnly ? BODY : COLLIDERS) {
    const px = state.x + p.x * cos - p.y * sin; const py = state.y + p.x * sin + p.y * cos
    if (obstacle.hull) {
      if (px + p.r < obstacle.left || px - p.r > obstacle.right) continue
      if (state.supportId === obstacle.key && WHEELS.includes(p) && py <= roofWheelY(obstacle, px, p.r) + .75) continue
      let inside = false
      for (let i = 0, j = obstacle.hull.length - 1; i < obstacle.hull.length; j = i++) {
        const a = obstacle.hull[j]; const b = obstacle.hull[i]
        if ((a[1] > py) !== (b[1] > py) && px < (b[0] - a[0]) * (py - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside
        const dx = b[0] - a[0]; const dy = b[1] - a[1]
        const t = clamp(((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy), 0, 1)
        const ex = px - a[0] - t * dx; const ey = py - a[1] - t * dy
        if (ex * ex + ey * ey < p.r * p.r - .1) return true
      }
      if (inside) return true
      continue
    }
    const dx = px - clamp(px, obstacle.x - obstacle.w / 2, obstacle.x + obstacle.w / 2)
    const dy = py - clamp(py, obstacle.y - obstacle.h, obstacle.y)
    if (dx * dx + dy * dy < p.r * p.r - .1) {
      if (state.supportId === obstacle.key && WHEELS.includes(p) && py <= obstacle.y - obstacle.h) continue
      return true
    }
  }
  return false
}
function updateCamera(state, dt) {
  const clearance = Math.max(0, terrain(state.x) - state.y - 26 * RIDER_SCALE)
  const cameraTarget = state.y + 26 * RIDER_SCALE + clearance * .4
  state.cameraY += (cameraTarget - state.cameraY) * Math.min(1, dt * 7)
  const zoomTarget = clamp(330 / (180 + clearance), .48, 1)
  state.cameraZoom += (zoomTarget - state.cameraZoom) * Math.min(1, dt * 5)
}
function stepCrash(state, dt) {
  const motion = state.crashMotion; motion.elapsed += dt; state.time += dt
  if (!motion.settled) {
    motion.vx *= Math.exp(-4 * dt)
    state.x += motion.vx * dt; state.speed = motion.vx
    const t = Math.min(1, motion.elapsed / .65)
    state.angle = motion.startAngle + (motion.endAngle - motion.startAngle) * (1 - (1 - t) ** 2)
    state.vy += GRAVITY * dt; state.y += state.vy * dt
    const cos = Math.cos(state.angle); const sin = Math.sin(state.angle); let floor = Infinity
    for (const p of COLLIDERS) floor = Math.min(floor, terrain(state.x + p.x * cos - p.y * sin) - p.x * sin - p.y * cos - p.r)
    if (state.y > floor) { state.y = floor; state.vy = 0 }
    if (motion.elapsed >= .85) { motion.settled = true; state.speed = 0; state.vy = 0 }
    motion.restAngle = roadAngle(state.x)
  }
  updateCamera(state, dt)
  if (motion.elapsed + 1e-9 >= CRASH_DURATION) { state.status = 'over'; state.speed = 0; state.vy = 0; state.omega = 0 }
}
function updateAir(state, dt) {
  if (state.held && state.holdTime > HOLD_DELAY) {
    state.tricking = true
    state.omega += clamp(-SPIN_SPEED - state.omega, -28 * dt, 28 * dt)
  } else {
    // Braking dissipates spin rather than freezing it. Small near-upright
    // corrections represent rider balance; they cannot rescue an inverted bike.
    state.omega *= Math.exp(-12 * dt)
    const target = roadAngle(state.x + state.speed * .15) + clamp(state.vy / state.speed * .12, -.15, .18)
    const error = wrapAngle(target - state.angle)
    if (Math.abs(error) < .9) state.omega += clamp(error * 6, -3, 3) * dt
  }
  const change = state.omega * dt; state.angle += change
  if (state.tricking) state.rotation = state.takeoffAngle - state.angle
  state.airFlips = Math.max(0, Math.floor((state.rotation + 1e-8) / TAU))
}
function step(state, dt) {
  const oldX = state.x; const oldY = state.y; const oldAngle = state.angle
  state.time += dt; state.messageTime = Math.max(0, state.messageTime - dt)
  const grade = Math.max(0, Math.min(1.1, slope(state.x)))
  // Carry the road's speed advantage through the short exit trail.
  const section = Math.floor(state.x / SECTION)
  const routeBoost = sectionData(section).route.kind === 'highway' && state.x >= section * SECTION + 1100 && state.x <= section * SECTION + 2350 ? 24 : 0
  const targetSpeed = Math.min(MAX_SPEED, MIN_SPEED + 34 + state.distance * .075 + grade * 160 + routeBoost)
  if (state.grounded) state.speed += (targetSpeed - state.speed) * Math.min(1, dt * 2)
  else state.speed *= Math.exp(-.01 * dt)
  state.x += state.speed * dt; state.distance = (state.x - 80) / 8
  if (state.held) state.holdTime += dt
  if (state.grounded) {
    const f = sectionData(Math.floor(state.x / SECTION)).feature
    const edge = dropEdge(oldX); const front = 26 * RIDER_SCALE
    // Leave the cliff when the front wheel reaches the lip; never snap the
    // entire bicycle down to the road beneath it.
    if (state.supportId && supportY(state.x, state.angle, state.supportId) - state.y > 4) {
      launch(state, 0, '驶离顶面'); state.vy = 0
    } else if (edge && oldX + front < edge.lip && state.x + front >= edge.lip) {
      launch(state, 0, edge.label)
      state.vy = Math.max(0, state.speed * slope(oldX)); state.dropLip = edge.lip
    } else if (f.kind !== 'drop' && oldX < f.lip && state.x >= f.lip) {
      launch(state, f.power, f.kind === 'ramp' ? '飞跃木跳台' : f.height < 60 ? '飞跃小坡' : '飞跃自然大跳台')
    }
    else {
      const target = rideAngle(state.x, state.supportId)
      if (state.landingTime > 0) {
        state.landingTime = Math.max(0, state.landingTime - dt)
        state.omega += (-wrapAngle(state.angle - target) * 90 - state.omega * 18) * dt
        state.angle += state.omega * dt
      } else {
        state.omega = clamp(wrapAngle(target - state.angle) / dt, -3, 3); state.angle = target
      }
      state.y = supportY(state.x, state.angle, state.supportId)
    }
  }
  if (!state.grounded) {
    updateAir(state, dt)
    state.vy += GRAVITY * dt; state.y += state.vy * dt
    const leavingCliff = state.dropLip !== null && state.x < state.dropLip + 42 * RIDER_SCALE
    if (!leavingCliff) land(state, oldX, oldY, oldAngle)
  }
  updateCamera(state, dt)
  if (state.status !== 'running') return
  const data = sectionData(Math.floor(state.x / SECTION)); const item = data.route
  if (item.kind !== 'camp' && oldX <= item.end && state.x > item.end && state.routeCleared < item.id) {
    state.routeCleared = item.id; state.score += 50
    state.message = `${item.kind === 'highway' ? '横越公路' : '越过隧道'} · +50`; state.messageTime = 1
  }
  for (const obstacle of data.solids) {
    if (Math.abs(obstacle.x - state.x) < obstacle.w / 2 + 50) {
      if (hitObstacle(state, obstacle)) { crash(state, CRASH_REASONS[obstacle.kind]); return }
      if (obstacle.kind !== 'van' && state.x > obstacle.x + obstacle.w / 2 + 40 && obstacle.id > state.cleared) {
        state.cleared = obstacle.id; state.score += 50
        state.message = '越过障碍 · +50'; state.messageTime = 1
      }
    }
  }
}
function tick(state, milliseconds) {
  if (!isAnimating(state) || !Number.isFinite(milliseconds) || milliseconds <= 0) return
  let remaining = Math.min(milliseconds, 100) / 1000
  while (remaining > 1e-9 && isAnimating(state)) {
    const dt = Math.min(1 / 120, remaining)
    if (state.status === 'crashing') stepCrash(state, dt)
    else step(state, dt)
    remaining -= dt
  }
}
function isAnimating(state) { return state.status === 'running' || state.status === 'crashing' }
function totalScore(state) { return Math.floor(state.distance) + state.score }
function records(value) {
  const safe = number => Number.isSafeInteger(number) && number >= 0 ? number : 0
  return { distance: safe(value && value.distance), score: safe(value && value.score), flips: safe(value && value.flips) }
}
function updateRecords(best, state) {
  return { distance: Math.max(best.distance, Math.floor(state.distance)), score: Math.max(best.score, totalScore(state)),
    flips: Math.max(best.flips, state.flips) }
}

module.exports = { SAVE_KEY, TAU, SECTION, OBSTACLE_OFFSET, MIN_SPEED, MAX_SPEED, HOLD_DELAY, SPIN_SPEED, CRASH_DURATION, JUMP_SPEED, RIDER_SCALE, WHEELS, BODY,
  randomSeed, setWorldSeed, baseHeight, profile, terrain, slope, roadAngle, feature, obstacles, landmark, landmarks,
  route, routes, surfaces, surfaceKind, dropEdge, rideHeight, rideAngle,
  transform, contacts, supportY, initialState, begin, press, release, land, tick, isAnimating, totalScore, records, updateRecords }
