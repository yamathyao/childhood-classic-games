(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory()
  else root.RoadRoute = factory()
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict'
  const LANE = 84
  const PERIOD = 1600
  const ENTRY_END = 110
  const EXIT_INTERVAL = 1600
  const CAMERA_FIRST = 500
  const CAMERA_INTERVAL = 800
  const CAMERA_WARNING = 220
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
  const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t) }
  const changes = [
    { start: 300, end: 400, from: 4, to: 3 },
    { start: 650, end: 760, from: 3, to: 2 },
    { start: 1000, end: 1100, from: 2, to: 3 },
    { start: 1240, end: 1340, from: 3, to: 4 },
    { start: 1400, end: 1500, from: 4, to: 3 }
  ]
  const laterChanges = [{ start: 0, end: 35, from: 3, to: 2, exit: true },
    { start: 110, end: 190, from: 2, to: 4 }, ...changes]
  const bends = [[0, 0], [150, 0], [330, 120], [550, -100], [820, 105], [1050, -110], [1260, 65], [1460, 0], [1600, 0]]

  function position(distance) { return ((distance % PERIOD) + PERIOD) % PERIOD }

  function curve(distance) {
    if (distance < 0) return 0
    const p = position(distance)
    for (let i = 1; i < bends.length; i++) {
      const [end, value] = bends[i]; const [start, before] = bends[i - 1]
      if (p <= end) return before + (value - before) * smooth((p - start) / (end - start))
    }
    return 0
  }

  function sample(distance) {
    const p = distance < 0 ? 0 : position(distance)
    let lanes = distance >= PERIOD ? 3 : 4; let width = LANE * lanes; let transition = null
    for (const item of distance >= PERIOD ? laterChanges : changes) {
      if (p >= item.end) { width = item.to * LANE; lanes = item.to }
      else if (p >= item.start) {
        width = (item.from + (item.to - item.from) * smooth((p - item.start) / (item.end - item.start))) * LANE
        lanes = item.from; transition = item; break
      } else break
    }
    const left = curve(distance) - LANE * 2
    return { left, right: left + width, center: left + width / 2, width, lanes,
      maxLane: width / LANE - 1, transition, slope: (curve(distance + .5) - curve(distance - .5)) }
  }

  function laneX(distance, lane) { return sample(distance).left + (lane + .5) * LANE }
  function entryLane(distance) { return 3 + 2.2 * (1 - smooth(distance / ENTRY_END)) }
  function entryX(distance) { return laneX(distance, entryLane(distance)) }

  function nextChange(distance) {
    const base = Math.floor(Math.max(0, distance) / PERIOD) * PERIOD
    for (const item of distance >= PERIOD ? laterChanges : changes) {
      if (base + item.end > distance) return { ...item, start: base + item.start, end: base + item.end, remaining: base + item.start - distance }
    }
    const first = laterChanges[0]
    return { ...first, start: base + PERIOD + first.start, end: base + PERIOD + first.end, remaining: base + PERIOD + first.start - distance }
  }

  function exitAt(distance) {
    const index = Math.max(1, Math.ceil((distance - 110) / EXIT_INTERVAL))
    const start = index * EXIT_INTERVAL
    return { start, end: start + 110, decisionEnd: start + 35, lane: 2, remaining: start - distance }
  }

  function cameraAt(distance) {
    const index = Math.max(0, Math.ceil((distance - CAMERA_FIRST) / CAMERA_INTERVAL))
    const at = CAMERA_FIRST + index * CAMERA_INTERVAL
    return { id: index, distance: at, remaining: at - distance, limit: 80 }
  }

  function exitX(distance, exit) {
    return laneX(exit.start, 2) + 270 * smooth((distance - exit.start) / (exit.end - exit.start))
  }

  function warning(distance, phase) {
    if (phase === 'entering') return { kind: 'entry', title: '右侧匝道汇入', detail: '自动汇入，主路车辆优先', meters: Math.max(0, ENTRY_END - distance) }
    if (phase === 'exiting') return { kind: 'exit', title: '正在驶离主路', detail: '沿右侧匝道减速驶出', meters: 0 }
    const exit = exitAt(distance)
    if (exit.remaining <= 220 && distance <= exit.decisionEnd) return {
      kind: 'exit', title: '三车道 · 最右道直接驶出 ↗', detail: '继续行驶请走左侧两道', meters: Math.max(0, exit.remaining)
    }
    const change = nextChange(distance)
    if (change.to < change.from && change.remaining <= 180) return {
      kind: 'narrow', title: `${change.from} → ${change.to} 车道 · 向左并道`,
      detail: change.remaining > 0 ? '右侧车道即将结束，留意左侧车流' : '收窄路段，请保持安全车距',
      meters: Math.max(0, change.remaining)
    }
    const slope = sample(distance + 45).slope
    if (Math.abs(slope) > .65) return { kind: 'curve', title: slope > 0 ? '前方右弯' : '前方左弯', detail: '沿车道转弯，建议减速至 80 km/h', meters: 0 }
    if (change.to > change.from && change.remaining <= 100) return { kind: 'wide', title: `前方恢复 ${change.to} 车道`, detail: '道路变宽后再变换车道', meters: Math.max(0, change.remaining) }
    return null
  }
  return { LANE, PERIOD, ENTRY_END, EXIT_INTERVAL, CAMERA_FIRST, CAMERA_INTERVAL, CAMERA_WARNING,
    sample, curve, laneX, entryLane, entryX, nextChange, exitAt, exitX, cameraAt, warning, smooth }
})
