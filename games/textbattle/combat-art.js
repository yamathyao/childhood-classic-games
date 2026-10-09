const { skill } = require('./strategy.js')
const { lifetime } = require('./feedback.js')

function opacity(age) {
  return Math.min(1, age / 65, (lifetime - age) / 200)
}
function caption(c, value, x, y, size, color, bold = false) {
  c.font = `${bold ? 700 : 500} ${size}px sans-serif`
  c.textAlign = 'center'; c.textBaseline = 'middle'
  // A one-pixel dark underlay keeps small text legible without a solid badge.
  c.fillStyle = '#0d1c2e'; c.fillText(value, x, y + 1)
  c.fillStyle = color; c.fillText(value, x, y)
}
function drawLabels(c, effects, points, arena, now, size) {
  const attacks = {}; const received = {}
  for (let i = effects.length - 1; i >= 0; i--) {
    const event = effects[i]; const age = now - event.at
    if (age < 0 || age >= lifetime) continue
    const target = event.side === 'player' ? 'enemy' : 'player'
    if (!received[target]) received[target] = event
    // Skill announcements belong to the caster, independently of hit labels.
    if (event.skill && !attacks[event.side]) attacks[event.side] = event
  }
  for (const side of ['player', 'enemy']) {
    const attack = attacks[side]
    if (attack) {
      const ability = skill(attack.skill)
      if (ability) {
        c.save(); c.globalAlpha = opacity(now - attack.at)
        caption(c, `${ability.short} · 发动`, points[side].x, arena.y + 15, 10, '#ffda92', true)
        c.restore()
      }
    }
    const event = received[side]
    if (!event) continue
    const age = now - event.at
    const compact = arena.h < 120
    const rise = Math.min(compact ? 4 : 10, age / lifetime * (compact ? 6 : 15))
    const x = side === 'player' ? arena.x + 33 : arena.x + arena.w - 33
    const y = Math.max(arena.y + 70, (compact ? arena.y + 74 : points[side].y - size * .48) - rise)
    const pop = 1 + .10 * Math.sin(Math.min(1, age / 160) * Math.PI)
    c.save(); c.globalAlpha = opacity(age)
    if (event.dodged) {
      caption(c, '闪避', x, y - 3, 13 * pop, '#a9e8ec', true)
    } else {
      const value = `−${event.damage}`
      const font = Math.min(event.critical ? 21 : 17, (arena.w / 4 - 12) / (value.length * .65))
      const color = event.critical ? '#ffdc87' : event.guarded ? '#b4dfe8' : side === 'player' ? '#ffb4a2' : '#fff0cd'
      const note = [event.critical && '暴击', event.guarded && '格挡'].filter(Boolean).join(' · ')
      if (note) caption(c, note, x, y - 16, 9, color, true)
      caption(c, value, x, y, font * pop, color, true)
    }
    c.restore()
  }
}
module.exports = { drawLabels }
