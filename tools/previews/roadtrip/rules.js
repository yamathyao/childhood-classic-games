(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./route.js'))
  else root.RoadRules = factory(root.RoadRoute)
})(typeof globalThis !== 'undefined' ? globalThis : this, function (route) {
  'use strict'

  const CARS = [
    { id: 'mini', brand: 'MINI', name: 'Cooper', color: '#e6b94c', dark: '#b9872c', roof: '#f3eddb', max: 172, note: '小身材，大好心情。' },
    { id: 'porsche', brand: 'PORSCHE', name: '911', color: '#c96b51', dark: '#984b39', roof: '#c96b51', max: 215, note: '给平凡的一天，加点速。' },
    { id: 'benz', brand: 'MERCEDES', name: 'G-Class', color: '#768470', dark: '#4e5d49', roof: '#87927a', max: 185, note: '方方正正，从从容容。' },
    { id: 'tesla', brand: 'TESLA', name: 'Model 3', color: '#e7e5dc', dark: '#b3b7ae', roof: '#344a48', max: 205, note: '安静地，跑远一点。' },
    { id: 'bmw', brand: 'BMW', name: 'M3', color: '#7b9aa8', dark: '#496979', roof: '#7b9aa8', max: 210, note: '下一个空隙，刚刚好。' },
    { id: 'vw', brand: 'VOLKSWAGEN', name: 'T1 Bus', color: '#87aea7', dark: '#527e78', roof: '#ede8d8', max: 135, note: '慢一点，风景会等你。' }
  ]
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n))
  const POINTS = Object.freeze({ distanceMeters: 100, distance: 10, beautiful: 20, speedingMinor: 100, speeding: 200 })

  function speedingPenalty(speed, limit) {
    if (speed > limit * 1.2 + 1e-6) return POINTS.speeding
    if (speed > limit * 1.1 + 1e-6) return POINTS.speedingMinor
    return 0
  }

  function random(state) {
    state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0
    return state.seed / 4294967296
  }

  function spawn(state, initial) {
    for (let attempt = 0; attempt < 36; attempt++) {
      const z = initial ? 17 + random(state) * 133 : 90 + random(state) * 60
      const lane = Math.floor(random(state) * Math.floor(route.sample(state.distance + z).maxLane + 1))
      if (state.phase === 'entering' && lane === 3 && z < 115) continue
      if (state.traffic.some(car => car.lane === lane && Math.abs(car.z - z) < 18)) continue
      const model = Math.floor(random(state) * CARS.length)
      const desired = (65 + random(state) * 35) / 3.6
      state.traffic.push({ id: state.nextId++, lane, z, model, speed: desired, desired, passed: false })
      return
    }
  }

  function create(options = {}) {
    const state = {
      seed: (options.seed == null ? Date.now() : options.seed) >>> 0,
      status: 'ready', mode: options.mode || 'cruise', density: options.density || 'easy',
      model: options.model || 0, lane: route.entryLane(0), targetLane: 3, speed: 0,
      phase: 'entering', exitRequested: false, chosenExit: null, mergeWaiting: false, edgeTime: 0,
      distance: 0, elapsed: 0, overtakes: 0, nearMisses: 0, bestSpeed: 0,
      score: 0, distancePoints: 0, skillPoints: 0, penaltyPoints: 0, distanceBank: 0,
      speedingTickets: 0, lastCamera: -1, cameraFlash: 0,
      scoreEvent: null, scoreEventTime: 0,
      traffic: [], nextId: 1, notice: '', noticeTime: 0, collision: null, following: false
    }
    const count = { easy: 10, normal: 15, busy: 19 }[state.density] || 10
    for (let i = 0; i < count; i++) spawn(state, true)
    // A recognizable opening composition, with room to accelerate in the starting lane.
    const opening = [[1, 29, 0], [0, 10, 4], [2, 40, 2], [0, -14, 1]]
      .map(([lane, z, model]) => ({ id: state.nextId++, lane, z, model, speed: 23, desired: 23, passed: z < 0 }))
    state.traffic = opening.concat(state.traffic.filter(car => !opening.some(other => car.lane === other.lane && Math.abs(car.z - other.z) < 18)))
    return state
  }

  function start(state) {
    if (state.status === 'ready') { state.status = 'running'; state.speed = 54 / 3.6 }
    else if (state.status === 'paused') state.status = 'running'
  }

  function notice(state, message) { state.notice = message; state.noticeTime = 2.2 }

  function scoreEvent(state, kind, message, points) {
    // Keep a major penalty visible if a mileage milestone happens at the same time.
    if (state.scoreEventTime > 0 && state.scoreEvent && state.scoreEvent.kind === 'penalty' && kind !== 'penalty') return
    state.scoreEvent = { kind, message, points }; state.scoreEventTime = kind === 'penalty' ? 3.5 : 2
  }

  function scoreTravel(state, before, beforeSpeed, phase) {
    state.distanceBank += state.distance - before
    const milestones = Math.floor((state.distanceBank + 1e-8) / POINTS.distanceMeters)
    if (milestones > 0) {
      const points = milestones * POINTS.distance
      state.distanceBank -= milestones * POINTS.distanceMeters
      state.distancePoints += points; state.score += points
      scoreEvent(state, 'distance', `里程奖励 · 每 ${POINTS.distanceMeters} 米`, points)
    }
    const camera = route.cameraAt(before)
    if (phase !== 'driving' || state.distance < camera.distance || camera.id <= state.lastCamera) return
    state.lastCamera = camera.id
    // Interpolate the speed at the capture line, independent of the rendering frame rate.
    const fraction = (camera.distance - before) / (state.distance - before)
    const capturedSpeed = (beforeSpeed + (state.speed - beforeSpeed) * fraction) * 3.6
    const penalty = speedingPenalty(capturedSpeed, camera.limit)
    if (penalty > 0) {
      state.speedingTickets++; state.penaltyPoints += penalty; state.score -= penalty
      state.cameraFlash = .4
      scoreEvent(state, 'penalty', `超速抓拍 ${Math.ceil(capturedSpeed)} / ${camera.limit} km/h`, -penalty)
    }
  }

  function changeLane(state, direction) {
    if (state.status !== 'running' || state.mode !== 'cruise' || state.phase !== 'driving') return false
    const next = clamp(state.targetLane + direction, 0, Math.floor(route.sample(state.distance).maxLane + .001))
    if (next === state.targetLane) return false
    if (state.traffic.some(car => Math.abs(car.lane - next) < .5 && Math.abs(car.z) < 7)) {
      notice(state, '旁边有车，等一个空隙'); return false
    }
    state.targetLane = next
    return true
  }

  function requestExit(state) {
    const exit = route.exitAt(state.distance)
    if (state.status !== 'running' || state.phase !== 'driving' || exit.remaining > 220 || state.distance > exit.decisionEnd) return false
    state.exitRequested = !state.exitRequested
    notice(state, state.exitRequested ? (state.mode === 'cruise' ? '准备驶出，正在寻找向右并道的空隙' : '出口已选定，请向右侧车道靠拢') : '取消驶出，继续在主路行驶')
    return true
  }

  function safeGap(state, lane, z, self = null, gap = 15) {
    const speed = self ? self.speed : state.speed
    const conflicts = (otherZ, otherSpeed) => {
      const closing = Math.max(0, otherZ > z ? speed - otherSpeed : otherSpeed - speed)
      // Reserve braking distance too: a slow merging car needs a larger gap ahead of fast traffic.
      return Math.abs(otherZ - z) < gap + closing * .5 + closing * closing / 16
    }
    if (state.traffic.some(car => car !== self && (Math.abs(car.lane - lane) < .78 || Math.abs(car.targetLane - lane) < .6) && conflicts(car.z, car.speed))) return false
    if (self && state.phase === 'driving' && (Math.abs(state.lane - lane) < .78 || Math.abs(state.targetLane - lane) < .6) && conflicts(0, state.speed)) return false
    return true
  }

  function prepareTraffic(state, dt) {
    for (const car of state.traffic) {
      const at = state.distance + car.z
      const change = route.nextChange(at)
      const max = route.sample(at).maxLane
      if (!Number.isFinite(car.targetLane)) car.targetLane = Math.round(car.lane)
      const changing = Math.abs(car.targetLane - car.lane) > .025
      if (!changing) car.lane = car.targetLane
      const closing = change.to < change.from && change.remaining < 145 && car.lane > change.to - 1 + .02
      car.mergeWaiting = false
      if (!changing && (closing || car.targetLane > max + .02)) {
        const goal = Math.max(0, Math.ceil(car.lane - .01) - 1)
        if (safeGap(state, goal, car.z, car, 16)) car.targetLane = goal
        else car.mergeWaiting = true
      }
      // A car waits before the taper until it has a full gap, instead of snapping to a new lane.
      if (!car.mergeWaiting) car.lane += (car.targetLane - car.lane) * (1 - Math.exp(-2.5 * dt))
    }
  }

  function tick(state, input, dt) {
    state.elapsed += dt
    state.noticeTime = Math.max(0, state.noticeTime - dt)
    state.scoreEventTime = Math.max(0, state.scoreEventTime - dt)
    state.cameraFlash = Math.max(0, state.cameraFlash - dt)
    const beforeDistance = state.distance; const beforeSpeed = state.speed; const beforePhase = state.phase
    const manual = state.mode === 'manual'
    const boost = !!input.accelerate
    const road = route.sample(state.distance)
    const change = route.nextChange(state.distance)
    state.mergeWaiting = false
    const closing = change.to < change.from && change.remaining < 145 && state.lane > change.to - 1 + .04
    const changing = Math.abs(state.targetLane - state.lane) > .04
    if (state.phase === 'driving' && !manual && closing && !changing) {
      const goal = Math.max(0, Math.ceil(state.lane - .01) - 1)
      if (safeGap(state, goal, 0, null, 14)) state.targetLane = goal
      else state.mergeWaiting = true
    }
    const exit = route.exitAt(state.distance)
    if (state.exitRequested && state.phase === 'driving') {
      if (state.distance > exit.decisionEnd) {
        state.exitRequested = false; notice(state, '错过了这个出口，继续前行也很好。')
      } else if (!manual && !closing && !changing) {
        const goal = Math.min(Math.floor(road.maxLane + .001), Math.round(state.targetLane) + 1)
        if (safeGap(state, goal, 0, null, 14)) state.targetLane = goal
      }
      if (state.exitRequested && state.distance >= exit.start && state.distance <= exit.decisionEnd && state.lane >= road.maxLane - .25) {
        state.phase = 'exiting'; state.chosenExit = exit; state.exitRequested = false
      }
    }
    let target = manual ? 68 / 3.6 : 105 / 3.6
    if (boost) target = CARS[state.model].max / 3.6
    if (input.brake) target = 18 / 3.6
    if (state.phase === 'entering') {
      target = Math.min(target, 75 / 3.6)
      // Reserve enough time to match a main-road gap before the two paths meet.
      if (state.distance > 57 && !safeGap(state, 3, 0, null, 20)) {
        target = Math.max(0, (88 - state.distance) * .5); state.mergeWaiting = true
      }
    }
    if (state.phase === 'exiting') target = Math.min(target, 52 / 3.6)
    const camera = route.cameraAt(state.distance)
    const cameraLimit = camera.remaining <= route.CAMERA_WARNING || (state.lastCamera >= 0 && state.distance - (route.CAMERA_FIRST + state.lastCamera * route.CAMERA_INTERVAL) < 25)
    if (!manual && !boost && cameraLimit) target = Math.min(target, camera.limit / 3.6)
    if (state.phase === 'driving' && !boost && Math.abs(road.slope) > .7) target = Math.min(target, 80 / 3.6)
    if (state.phase === 'driving' && state.mergeWaiting) target = Math.min(target, Math.max(0, (change.start - state.distance - 18) * .4))
    if (state.phase === 'driving' && manual && state.lane > road.maxLane + .28) {
      target = Math.min(target, 25 / 3.6); state.edgeTime += dt
      if (state.edgeTime > .6 && state.noticeTime <= 0) notice(state, '车道已收窄，请向左回到路面')
    } else state.edgeTime = 0
    state.following = false
    if (!manual && !boost && !input.brake && state.phase !== 'exiting') {
      const lead = state.traffic.filter(car => car.z > 0 && (Math.abs(car.lane - state.lane) < .8 || Math.abs(car.targetLane - state.lane) < .6 || Math.abs(car.lane - state.targetLane) < .7))
        .sort((a, b) => a.z - b.z)[0]
      if (lead && lead.z < 90) {
        target = Math.min(target, Math.max(0, lead.speed + (lead.z - 15) * .55))
        state.following = target < 100 / 3.6
      }
    }
    const accel = target > state.speed ? (boost ? 10 : 4) : (input.brake ? 18 : 11)
    state.speed += clamp(target - state.speed, -accel * dt, accel * dt)
    state.bestSpeed = Math.max(state.bestSpeed, state.speed * 3.6)
    if (state.phase === 'driving') {
      if (manual) {
        state.lane = clamp(state.lane + ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * 1.85 * dt, 0, Math.min(3, road.maxLane + .48))
        state.targetLane = Math.round(state.lane)
      } else state.lane += (state.targetLane - state.lane) * (1 - Math.exp(-5 * dt))
    }
    state.distance += state.speed * dt
    scoreTravel(state, beforeDistance, beforeSpeed, beforePhase)
    if (state.phase === 'entering') {
      state.lane = route.entryLane(state.distance)
      if (state.distance >= route.ENTRY_END) {
        state.phase = 'driving'; state.lane = 3; state.targetLane = 3
        notice(state, '已汇入主路，开始这一程。')
      }
    }
    if (state.phase === 'exiting') {
      state.lane = (route.exitX(state.distance, state.chosenExit) - route.sample(state.distance).left) / route.LANE - .5
      if (state.distance >= state.chosenExit.end) {
        state.phase = 'arrived'; state.status = 'finished'; state.speed = 0; return
      }
    }
    prepareTraffic(state, dt)

    // Every traffic car also leaves a gap to the car ahead in its own lane.
    const ordered = [...state.traffic].sort((a, b) => b.z - a.z)
    for (const car of ordered) {
      let leader = null
      for (const other of ordered) {
        if (other !== car && Math.abs(other.lane - car.lane) < .8 && other.z > car.z && (!leader || other.z < leader.z)) leader = other
      }
      let desired = car.desired
      const carAt = state.distance + car.z
      const taper = route.nextChange(carAt)
      if (car.mergeWaiting) desired = Math.min(desired, Math.max(0, (taper.start - carAt - 18) * .35))
      if (car.lane > route.sample(carAt).maxLane + .3) desired = Math.min(desired, 3)
      if (Math.abs(route.sample(carAt).slope) > .7) desired = Math.min(desired, 80 / 3.6)
      // Through traffic yields to an already merging car ahead in its target lane.
      const merging = state.traffic.find(other => other !== car && other.z > car.z && other.z - car.z < 42 && Math.abs(other.targetLane - car.lane) < .6 && Math.abs(other.lane - other.targetLane) > .05)
      if (merging) desired = Math.min(desired, Math.max(0, merging.speed + (merging.z - car.z - 20) * .6))
      if (leader && leader.z - car.z < 27) desired = Math.min(desired, Math.max(0, leader.speed + (leader.z - car.z - 13) * .7))
      // Cars behind the player follow too, instead of driving into a slow player.
      if (car.z < 0 && state.phase !== 'exiting' && (Math.abs(car.lane - state.lane) < .8 || (state.phase === 'driving' && Math.abs(car.lane - state.targetLane) < .6)) && -car.z < 42) {
        desired = Math.min(desired, Math.max(0, state.speed + (-car.z - 14) * .8))
      }
      car.speed += clamp(desired - car.speed, -13 * dt, 3 * dt)
      const before = car.z
      car.z += (car.speed - state.speed) * dt
      if (Math.abs(car.lane - state.lane) < .47 && Math.abs(car.z) < 5.5 && state.phase !== 'exiting') {
        state.status = 'crashed'; state.collision = { lane: car.lane, id: car.id }
        state.score = 0; state.scoreEvent = null; state.scoreEventTime = 0
        notice(state, '发生事故，本程积分清零。'); return
      }
      if (!car.passed && before >= -6.5 && car.z < -6.5) {
        car.passed = true; state.overtakes++
        const clearance = Math.abs(car.lane - state.lane)
        if (state.phase === 'driving' && clearance >= .55 && clearance < 1.25 && state.speed - car.speed > 2) {
          state.nearMisses++; state.skillPoints += POINTS.beautiful; state.score += POINTS.beautiful
          scoreEvent(state, 'skill', '漂亮穿梭', POINTS.beautiful)
        }
      }
    }
    state.traffic = state.traffic.filter(car => car.z > -48 && car.z < 170)
    const count = { easy: 10, normal: 15, busy: 19 }[state.density] || 10
    if (state.traffic.length < count) spawn(state, false)
  }

  function step(state, input = {}, delta = 0) {
    if (state.status !== 'running' || !Number.isFinite(delta) || delta <= 0) return
    let remaining = Math.min(delta, .1)
    while (remaining > .000001 && state.status === 'running') {
      const dt = Math.min(remaining, 1 / 120)
      tick(state, input, dt); remaining -= dt
    }
  }
  return { CARS, POINTS, create, start, step, changeLane, requestExit, speedingPenalty, clamp }
})
