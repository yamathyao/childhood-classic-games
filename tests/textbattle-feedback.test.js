const assert = require('node:assert/strict')
const { test } = require('node:test')
const rules = require('../games/textbattle/rules.js')
const { createFeedback, recordEvents, meterValue, isAnimating, fighterPose, profiles, lifetime } = require('../games/textbattle/feedback.js')
const { drawLabels } = require('../games/textbattle/combat-art.js')
const { layout } = require('../games/textbattle/layout.js')

function labels(effects, screen, now = 1200) {
  const { arena, width } = layout(screen)
  const half = (arena.w - 36) / 2
  const points = { player: { x: arena.x + 12 + half / 2, y: arena.y + arena.h - 10 },
    enemy: { x: width / 2 + 6 + half / 2, y: arena.y + arena.h - 10 } }
  const drawn = []
  const c = { save() {}, restore() {}, fillText(value, x, y) {
    if (this.fillStyle !== '#0d1c2e') drawn.push({ text: value, x, y, font: this.font, alpha: this.globalAlpha })
  } }
  drawLabels(c, effects, points, arena, now, Math.min(62, (arena.h - 55) / 1.7))
  return { drawn, arena, points }
}

test('both sides announce their own skills while damage, critical and dodge labels stay in separate outer lanes', () => {
  for (const [width, height] of [[320, 568], [375, 667], [390, 844]]) {
    const { drawn, arena, points } = labels([
      { side: 'player', skill: 'sword-point', critical: true, guarded: true, damage: 37, at: 1000 },
      { side: 'enemy', skill: 'halberd-ward', dodged: true, damage: 0, at: 1000 }
    ], { width, height, top: 24, bottom: 16 })
    assert.equal(drawn.length, 5)
    assert.ok(drawn.some(item => item.text === '点锋 · 发动' && item.x === points.player.x && item.y === arena.y + 15))
    assert.ok(drawn.some(item => item.text === '架势 · 发动' && item.x === points.enemy.x && item.y === arena.y + 15))
    const damage = drawn.find(item => item.text === '−37')
    const critical = drawn.find(item => item.text === '暴击 · 格挡')
    const dodge = drawn.find(item => item.text === '闪避')
    assert.ok(damage.x > points.enemy.x); assert.ok(dodge.x < points.player.x)
    assert.equal(damage.y - critical.y, 16)
    assert.ok(drawn.every(item => item.y >= arena.y + 15 && item.y < arena.y + arena.h - 3 && item.alpha > 0 && item.alpha <= 1))
    assert.equal(drawn.some(item => item.text === '−0'), false)
  }
})

test('new hit labels replace older ones on the same side, keep the skill notice, and fade without replaying stale events', () => {
  const screen = { width: 320, height: 568, top: 24, bottom: 16 }
  const events = [
    { side: 'player', skill: 'sword-point', damage: 12, at: 1000 },
    { side: 'player', damage: 21, at: 1100 },
    { side: 'enemy', damage: 9, at: 1250 }
  ]
  const { drawn } = labels(events, screen)
  assert.deepEqual(drawn.map(item => item.text), ['点锋 · 发动', '−21'])
  assert.equal(labels(events, screen, 2100).drawn.length, 0)
  const beginning = labels([events[1]], screen, 1110).drawn[0]
  const middle = labels([events[1]], screen, 1300).drawn[0]
  const ending = labels([events[1]], screen, 1800).drawn[0]
  assert.ok(beginning.alpha < middle.alpha && ending.alpha < middle.alpha)
  assert.ok(ending.y <= middle.y && middle.y <= beginning.y)
})

test('momentum display eases independently and spent skills cannot leave a stale full meter', () => {
  const state = rules.initialState(42); rules.startFight(state)
  const feedback = createFeedback(state, 1000)
  state.player.combat.momentum = 5000
  recordEvents(feedback, state, [], 1000)
  assert.equal(meterValue(feedback.meters.player, 1000), 0)
  assert.ok(meterValue(feedback.meters.player, 1100) > 0)
  assert.ok(meterValue(feedback.meters.player, 1100) < 5000)
  assert.equal(meterValue(feedback.meters.player, 1220), 5000)
  assert.equal(isAnimating(feedback, 1220), false)
  state.player.combat.momentum = 10000
  recordEvents(feedback, state, [], 1300)
  assert.equal(feedback.meters.player.readyAt, 1300)
  assert.ok(isAnimating(feedback, 1600))
  assert.equal(isAnimating(feedback, 1820), false)
  state.elapsedMs = 100; state.player.combat.momentum = 2300
  recordEvents(feedback, state, [{ side: 'player', skill: 'saber-cleave', damage: 20, time: 100 }], 1900)
  assert.equal(meterValue(feedback.meters.player, 1900), 0)
  assert.equal(meterValue(feedback.meters.player, 2120), 2300)
  assert.equal(feedback.meters.player.readyAt, null)
  assert.equal(state.player.combat.momentum, 2300)
})

test('feedback discards stale catch-up hits, caps effects and never changes combat or save data', () => {
  const state = rules.initialState(42); rules.startFight(state)
  state.elapsedMs = 5000
  const events = Array.from({ length: 40 }, (_, i) => ({ side: i % 2 ? 'player' : 'enemy', time: 1000 + i * 100, damage: 12 }))
  const before = rules.snapshot(state); const beforeEvents = structuredClone(events)
  const feedback = createFeedback(state, 8000)
  recordEvents(feedback, state, events, 8000)
  assert.equal(feedback.effects.length, 6)
  assert.ok(feedback.effects.every(event => 8000 - event.at < lifetime))
  assert.equal(feedback.effects.at(-1).at, 7900)
  for (let now = 8000; now < 9000; now += 34) {
    fighterPose(feedback.effects, 'player', now); fighterPose(feedback.effects, 'enemy', now)
    meterValue(feedback.meters.player, now); isAnimating(feedback, now)
  }
  recordEvents(feedback, state, [], 9000)
  assert.equal(feedback.effects.length, 0); assert.equal(isAnimating(feedback, 9000), false)
  assert.deepEqual(state, before); assert.deepEqual(events, beforeEvents)
  assert.deepEqual(rules.restore(rules.snapshot(state)), before)
})

test('each weapon has its own skill motion; hits and dodges move the defender, not the attacker', () => {
  const poses = []
  for (const weapon of rules.weapons) {
    const event = { side: 'player', weapon: weapon.id, skill: rules.weaponSkill(weapon.id).id, at: 1000, damage: 20 }
    const pose = fighterPose([event], 'player', 1100)
    assert.ok(pose.advance > 0)
    assert.ok(fighterPose([event], 'enemy', 1100).advance < 0)
    poses.push(JSON.stringify(pose))
    for (const side of ['player', 'enemy']) {
      assert.deepEqual(fighterPose([event], side, 2000), { advance: 0, lift: 0, lean: 0, strike: 0, hit: 0, dodge: 0 })
    }
  }
  assert.equal(new Set(poses).size, 6)
  assert.ok(profiles.spear.reach > profiles.sword.reach)
  const dodge = { side: 'enemy', weapon: 'sword', at: 1000, dodged: true, damage: 0 }
  const defender = fighterPose([dodge], 'player', 1090)
  assert.ok(defender.dodge > 0); assert.equal(defender.hit, 0); assert.ok(defender.advance < 0)
  const attacker = fighterPose([dodge], 'enemy', 1090)
  assert.equal(attacker.dodge, 0); assert.equal(attacker.hit, 0); assert.ok(attacker.strike > 0)
})
