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
  // Same scale as the drawn body (8 world pixels per metre).
  const CAR_SIZES = [[42, 65], [43, 73], [47, 77], [44, 75], [44, 71], [45, 82]]
  const CAR_LENGTHS = CAR_SIZES.map(size => size[1] / 8)
  const carLength = car => CAR_LENGTHS[car.model || 0]
  const followingGap = (car, leader) => (carLength(car) + carLength(leader)) / 2 + carLength(car) * (car.gap || 1.5)
  // Scratch arrays belong to a live state and are collected with it. No per-step
  // sort/filter arrays or persisted implementation fields are needed.
  const trafficOrder = new WeakMap()

  // Rendering and collision share the same world-space position and heading.
  function vehiclePose(state, car = state, input = null) {
    const player = car === state
    const z = player ? 0 : car.z
    const distance = state.distance + z
    const road = route.sample(distance)
    let slope = road.slope
    if (player && state.phase === 'entering') slope = route.entryX(distance + .5) - route.entryX(distance - .5)
    const exit = player ? state.chosenExit : car.exit
    if (exit && (!player || state.phase === 'exiting' || state.phase === 'arrived')) slope = route.exitX(distance + .5, exit) - route.exitX(distance - .5, exit)
    const steering = player && state.phase !== 'driving' ? 0 : player && state.mode === 'manual'
      ? (input ? ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * .08 : state.steering || 0)
      : ((car.targetLane == null ? car.lane : car.targetLane) - car.lane) * .2
    const angle = Math.atan(slope / 8) + steering
    const size = CAR_SIZES[car.model || 0]
    return { x: road.left + (car.lane + .5) * route.LANE, y: -z * 8, angle, width: size[0], length: size[1], cos: Math.cos(angle), sin: Math.sin(angle) }
  }

  // Oriented body rectangles, inset by one pixel. Shadows, mirrors and the YOU
  // marker are decoration; merely touching an edge does not cause an accident.
  function bodiesOverlap(a, b, inset = 1) {
    const ax = a.width / 2 - inset; const ay = a.length / 2 - inset
    const bx = b.width / 2 - inset; const by = b.length / 2 - inset
    const dx = b.x - a.x; const dy = b.y - a.y
    if (Math.abs(dx) >= Math.abs(a.cos) * ax + Math.abs(a.sin) * ay + Math.abs(b.cos) * bx + Math.abs(b.sin) * by ||
      Math.abs(dy) >= Math.abs(a.sin) * ax + Math.abs(a.cos) * ay + Math.abs(b.sin) * bx + Math.abs(b.cos) * by) return false
    const c = a.cos * b.cos + a.sin * b.sin
    const s = a.cos * b.sin - a.sin * b.cos
    return Math.abs(dx * a.cos + dy * a.sin) < ax + Math.abs(c) * bx + Math.abs(s) * by &&
      Math.abs(-dx * a.sin + dy * a.cos) < ay + Math.abs(s) * bx + Math.abs(c) * by &&
      Math.abs(dx * b.cos + dy * b.sin) < bx + Math.abs(c) * ax + Math.abs(s) * ay &&
      Math.abs(-dx * b.sin + dy * b.cos) < by + Math.abs(s) * ax + Math.abs(c) * ay
  }

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
      const model = Math.floor(random(state) * CARS.length)
      const gap = 1 + random(state)
      const candidate = { lane, z, model, gap }
      if (state.traffic.some(car => (Math.abs(car.lane - lane) < .8 || Math.abs(car.targetLane - lane) < .6) &&
        Math.abs(car.z - z) < Math.max(followingGap(candidate, car), followingGap(car, candidate)))) continue
      if (state.phase === 'driving' && Math.abs(state.lane - lane) < .8 && z < followingGap(candidate, state)) continue
      const desired = (65 + random(state) * 35) / 3.6
      state.traffic.push({ id: state.nextId++, lane, targetLane: lane, z, model, gap, speed: desired, desired, passed: false, decisionTime: random(state) * .25, laneCooldown: 0 })
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
      .map(([lane, z, model]) => ({ id: state.nextId++, lane, targetLane: lane, z, model, gap: 1.5, speed: 23, desired: 23, passed: z < 0 }))
    state.traffic = opening.concat(state.traffic.filter(car => !opening.some(other => car.lane === other.lane &&
      Math.abs(car.z - other.z) < Math.max(followingGap(car, other), followingGap(other, car)))))
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
    if (!safeGap(state, next, 0)) {
      notice(state, '旁边有车，等一个空隙'); return false
    }
    state.targetLane = next
    return true
  }

  function requestExit(state) {
    const exit = route.exitAt(state.distance)
    if (state.status !== 'running' || state.phase !== 'driving' || exit.remaining > 220 || state.distance > exit.decisionEnd) return false
    state.exitRequested = !state.exitRequested
    notice(state, state.exitRequested ? (state.mode === 'cruise' ? '辅助靠右，最右车道直接驶出' : '最右车道直接驶出，请靠右') : '已取消辅助靠右，继续行驶请走左侧两道')
    return true
  }

  function safeGap(state, lane, z, self = null, automatic = false) {
    const own = self || state
    const pose = vehiclePose(state, own)
    let candidates = null
    const conflicts = (other, otherZ) => {
      const relative = otherZ - z
      const follower = relative > 0 ? own : other; const leader = relative > 0 ? other : own
      const brakeTravel = automatic ? Math.max(0, follower.speed * follower.speed / (2 * (follower === state ? 18 : 13)) -
        leader.speed * leader.speed / (2 * (leader === state ? 18 : 13))) : 0
      // Nearby body geometry only; cruising headway and stopping distance must
      // not prevent a tight pass. Reserve other cars' ongoing lane changes too.
      if ((Math.abs(relative) - brakeTravel) * 8 > pose.length + CAR_SIZES[other.model || 0][1] + 8) return false
      const actual = vehiclePose(state, other)
      const target = Number.isFinite(other.targetLane) && other.targetLane !== other.lane
        ? { ...actual, x: route.laneX(state.distance + otherZ, other.targetLane), angle: Math.atan(route.sample(state.distance + otherZ).slope / 8) } : actual
      target.cos = Math.cos(target.angle); target.sin = Math.sin(target.angle)
      // Autonomous drivers must be able to match the adjacent car's speed.
      // Reserve only the relative braking displacement, without a fixed headway.
      const stopZ = automatic ? z + Math.sign(relative) * Math.max(0, Math.abs(relative) - brakeTravel) : otherZ
      const stopped = { ...target, x: route.laneX(state.distance + stopZ, Number.isFinite(other.targetLane) ? other.targetLane : other.lane), y: -stopZ * 8 }
      if (!candidates) {
        const road = route.sample(state.distance + z)
        candidates = []
        for (let i = 1; i <= 4; i++) {
          const atLane = own.lane + (lane - own.lane) * i / 4
          const angle = Math.atan(road.slope / 8) + (lane - atLane) * .2
          candidates.push({ ...pose, x: road.left + (atLane + .5) * route.LANE, angle, cos: Math.cos(angle), sin: Math.sin(angle) })
        }
      }
      for (const candidate of candidates) {
        if (bodiesOverlap(candidate, actual, 0) || bodiesOverlap(candidate, target, 0) || (automatic && bodiesOverlap(candidate, stopped, 0))) return true
      }
      return false
    }
    if (state.traffic.some(car => car !== self && conflicts(car, car.z))) return false
    if (self && state.phase === 'driving' && conflicts(state, 0)) return false
    return true
  }

  function prepareTraffic(state, dt) {
    for (const car of state.traffic) {
      const at = state.distance + car.z
      const exit = car.exit || route.exitAt(at)
      if (car.exit || (at >= exit.start && at <= exit.decisionEnd && car.lane >= exit.lane - .25)) {
        car.exit = exit
        car.lane = (route.exitX(at, exit) - route.sample(at).left) / route.LANE - .5
        car.targetLane = car.lane; car.mergeWaiting = false
        continue
      }
      const change = route.nextChange(at)
      const max = route.sample(at).maxLane
      if (!Number.isFinite(car.targetLane)) car.targetLane = Math.round(car.lane)
      const changing = Math.abs(car.targetLane - car.lane) > .025
      if (!changing) car.lane = car.targetLane
      const closing = !change.exit && change.to < change.from && change.remaining < 145 && car.lane > change.to - 1 + .02
      car.mergeWaiting = false
      car.laneCooldown = Math.max(0, (car.laneCooldown || 0) - dt)
      if (!changing && (closing || car.targetLane > max + .02)) {
        const goal = Math.max(0, Math.ceil(car.lane - .01) - 1)
        if (safeGap(state, goal, car.z, car, true)) car.targetLane = goal
        else car.mergeWaiting = true
      } else if (!changing && car.laneCooldown <= 0 && max >= 1 && change.remaining > 170) {
        car.decisionTime = (car.decisionTime || 0) - dt
        if (car.decisionTime <= 0) {
          car.decisionTime = .25
          let leader = null
          for (const other of state.traffic) if (other !== car && other.z > car.z &&
            (Math.abs(other.lane - car.lane) < .8 || Math.abs(other.targetLane - car.lane) < .6) && (!leader || other.z < leader.z)) leader = other
          if (state.phase === 'driving' && car.z < 0 && Math.abs(state.lane - car.lane) < .8 && (!leader || -car.z < leader.z - car.z)) leader = { z: 0, speed: state.speed }
          const blocked = leader && leader.z - car.z < 65 && car.desired > leader.speed + 1.5
          const goal = Math.round(car.lane) - 1
          if (blocked && goal >= 0 && safeGap(state, goal, car.z, car, true)) { car.targetLane = goal; car.laneCooldown = 5 }
        }
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
    state.steering = manual ? ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * .08 : 0
    const boost = !!input.accelerate
    const road = route.sample(state.distance)
    const change = route.nextChange(state.distance)
    state.mergeWaiting = false
    state.mergeIntent = null
    const closing = !change.exit && change.to < change.from && change.remaining < 145 && state.lane > change.to - 1 + .04
    const changing = Math.abs(state.targetLane - state.lane) > .04
    if (state.phase === 'driving' && !manual && closing && !changing) {
      const goal = Math.max(0, Math.ceil(state.lane - .01) - 1)
      if (safeGap(state, goal, 0, null, true)) state.targetLane = goal
      else { state.mergeWaiting = true; state.mergeIntent = goal }
    }
    const exit = route.exitAt(state.distance)
    if (state.exitRequested && state.phase === 'driving') {
      if (state.distance > exit.decisionEnd) {
        state.exitRequested = false; notice(state, '错过了这个出口，继续前行也很好。')
      } else if (!manual && !closing && !changing) {
        const goal = Math.min(exit.lane, Math.floor(road.maxLane + .001), Math.round(state.targetLane) + 1)
        if (safeGap(state, goal, 0, null, true)) state.targetLane = goal
        else state.mergeIntent = goal
      }
    }
    // The marked third lane is the physical exit: no button is required to leave it.
    if (state.phase === 'driving' && state.distance >= exit.start && state.distance <= exit.decisionEnd && state.lane >= exit.lane - .25) {
      state.phase = 'exiting'; state.chosenExit = exit; state.exitRequested = false
    }
    let target = manual ? 68 / 3.6 : 105 / 3.6
    if (boost) target = CARS[state.model].max / 3.6
    if (input.brake) target = 18 / 3.6
    if (state.mergeIntent !== null && state.exitRequested) target = Math.min(target, state.speed * .8)
    if (state.phase === 'entering') {
      target = Math.min(target, 75 / 3.6)
      // Reserve enough time to match a main-road gap before the two paths meet.
      if (state.distance > 57 && !safeGap(state, 3, 0, null, true)) {
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
    let closeFollowing = false
    if (!manual && !boost && !input.brake && state.phase !== 'exiting') {
      let lead = null
      for (const car of state.traffic) if (car.z > 0 && (Math.abs(car.lane - state.lane) < .8 || Math.abs(car.targetLane - state.lane) < .6 || Math.abs(car.lane - state.targetLane) < .7) && (!lead || car.z < lead.z)) lead = car
      if (lead && lead.z < 90) {
        target = Math.min(target, Math.max(0, lead.speed + (lead.z - followingGap(state, lead)) * .55))
        state.following = target < 100 / 3.6
        closeFollowing = lead.z < followingGap(state, lead)
      }
    }
    const accel = target > state.speed ? (boost ? 10 : 4) : (input.brake || closeFollowing ? 18 : 11)
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
    let ordered = trafficOrder.get(state)
    if (!ordered) { ordered = []; trafficOrder.set(state, ordered) }
    ordered.length = state.traffic.length
    for (let i = 0; i < ordered.length; i++) ordered[i] = state.traffic[i]
    ordered.sort((a, b) => b.z - a.z)
    const playerBody = vehiclePose(state)
    for (const car of ordered) {
      let leader = null
      for (const other of ordered) {
        if (other !== car && (Math.abs(other.lane - car.lane) < .8 || Math.abs(other.lane - car.targetLane) < .6) && other.z > car.z && (!leader || other.z < leader.z)) leader = other
      }
      let desired = car.desired
      const carAt = state.distance + car.z
      const carRoad = route.sample(carAt)
      if (car.mergeWaiting) desired = Math.min(desired, Math.max(0, (route.nextChange(carAt).start - carAt - 18) * .35))
      if (car.exit) desired = Math.min(desired, 52 / 3.6)
      else if (car.lane > carRoad.maxLane + .3) desired = Math.min(desired, 3)
      if (Math.abs(carRoad.slope) > .7) desired = Math.min(desired, 80 / 3.6)
      // Through traffic yields to an already merging car ahead in its target lane.
      const merging = state.traffic.find(other => other !== car && other.z > car.z && other.z - car.z < 42 && Math.abs(other.targetLane - car.lane) < .6 && Math.abs(other.lane - other.targetLane) > .05)
      if (merging) desired = Math.min(desired, Math.max(0, merging.speed + (merging.z - car.z - 20) * .6))
      if (leader && leader.z - car.z < 90) desired = Math.min(desired, Math.max(0, leader.speed + (leader.z - car.z - followingGap(car, leader)) * .7))
      // Cars behind the player follow too, instead of driving into a slow player.
      if (car.z < 0 && state.phase !== 'exiting' && (Math.abs(car.lane - state.lane) < .8 || Math.abs(car.targetLane - state.lane) < .6 || (state.phase === 'driving' &&
        (Math.abs(car.lane - state.targetLane) < .6 || (state.mergeIntent !== null && Math.abs(car.lane - state.mergeIntent) < .6)))) && -car.z < 65) {
        desired = Math.min(desired, Math.max(0, state.speed + (-car.z - followingGap(car, state)) * .8))
      }
      car.speed += clamp(desired - car.speed, -13 * dt, 3 * dt)
      const before = car.z
      car.z += (car.speed - state.speed) * dt
      if (Math.abs(car.z) < 16 && state.phase !== 'exiting' && bodiesOverlap(playerBody, vehiclePose(state, car))) {
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
    let kept = 0
    for (const car of state.traffic) if (car.z > -48 && car.z < 170 && (!car.exit || state.distance + car.z < car.exit.end)) state.traffic[kept++] = car
    state.traffic.length = kept
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
  return { CARS, CAR_SIZES, CAR_LENGTHS, vehiclePose, bodiesOverlap, followingGap, POINTS, create, start, step, changeLane, requestExit, speedingPenalty, clamp }
})
