const { momentum } = require('./strategy.js')

// Presentation state is transient: never save it or use it to advance combat.
const lifetime = 760
const meterDuration = 220
const readyDuration = 520
const profiles = {
  sword: { duration: 400, reach: .26, lean: .09, lift: 0 },
  saber: { duration: 460, reach: .22, lean: .15, lift: .035 },
  spear: { duration: 400, reach: .36, lean: .10, lift: 0 },
  dual: { duration: 500, reach: .28, lean: .12, lift: .07 },
  axe: { duration: 520, reach: .20, lean: .19, lift: .02 },
  halberd: { duration: 500, reach: .18, lean: .08, lift: .025 }
}
const charge = actor => actor.combat && actor.combat.momentum || 0
function createFeedback(state, now) {
  return { effects: [], meters: Object.fromEntries(['player', 'enemy'].map(side => {
    const value = charge(state[side])
    return [side, { from: value, to: value, at: now, readyAt: null }]
  })) }
}
function meterValue(meter, now) {
  if (!meter) return 0
  const progress = Math.max(0, Math.min(1, (now - meter.at) / meterDuration))
  return meter.from + (meter.to - meter.from) * (1 - (1 - progress) ** 3)
}
function recordEvents(feedback, state, events, now) {
  feedback.effects = feedback.effects.filter(event => now - event.at < lifetime)
  for (const event of events) {
    // A delayed callback may settle several attacks. Do not replay old hits.
    const at = now - Math.max(0, state.elapsedMs - event.time)
    if (now - at < lifetime) feedback.effects.push({ ...event, at,
      weapon: event.side === 'player' ? state.weapon : state.enemy.weapon })
  }
  feedback.effects = feedback.effects.slice(-6)
  for (const side of ['player', 'enemy']) {
    const meter = feedback.meters[side]; const value = charge(state[side])
    const spent = events.some(event => event.side === side && event.skill)
    if (value !== meter.to || spent) {
      const from = spent ? 0 : meterValue(meter, now)
      const newlyReady = value >= momentum.max && (spent || meter.to < momentum.max)
      feedback.meters[side] = { from, to: value, at: now,
        readyAt: newlyReady ? now : spent || value < momentum.max ? null : meter.readyAt }
    }
  }
}
function isAnimating(feedback, now) {
  return feedback.effects.some(event => now - event.at < lifetime) ||
    Object.values(feedback.meters).some(meter => (meter.from !== meter.to && now - meter.at < meterDuration) ||
      (meter.readyAt !== null && now - meter.readyAt < readyDuration))
}
function impulse(age, duration) {
  const p = age / duration
  if (p < 0 || p >= 1) return 0
  return p < .25 ? Math.sin(p / .25 * Math.PI / 2) : ((1 - p) / .75) ** 2
}
function fighterPose(effects, side, now) {
  let attack = null; let incoming = null
  for (const event of effects) {
    if (event.side === side) attack = event
    else incoming = event
  }
  const profile = attack && profiles[attack.weapon] || profiles.sword
  const strike = attack ? impulse(now - attack.at, attack.skill ? profile.duration : 260) : 0
  const response = incoming ? impulse(now - incoming.at, incoming.dodged ? 360 : 260) : 0
  const special = !!(attack && attack.skill)
  const dodge = incoming && incoming.dodged ? response : 0
  const hit = incoming && !incoming.dodged ? response : 0
  const reach = special ? profile.reach : .12
  return {
    advance: reach * strike - .12 * hit - .28 * dodge,
    lift: (special ? profile.lift : 0) * strike + .035 * dodge,
    lean: (special ? profile.lean : .065) * strike - .14 * hit - .12 * dodge,
    strike, hit, dodge
  }
}
module.exports = { lifetime, meterDuration, readyDuration, profiles, createFeedback, meterValue, recordEvents, isAnimating, fighterPose }
