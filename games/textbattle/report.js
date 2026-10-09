const keys = ['damage', 'criticals', 'dodges', 'skills', 'attacks']
function fresh(complete = true) {
  const side = () => Object.fromEntries(keys.map(key => [key, 0]))
  return { complete, player: side(), enemy: side() }
}
function copy(value) { return { ...value, player: { ...value.player }, enemy: { ...value.enemy } } }
function record(value, event, actualDamage = event.damage) {
  const attacking = value[event.side]; const defending = value[event.side === 'player' ? 'enemy' : 'player']
  attacking.attacks++; attacking.damage += actualDamage
  if (event.critical) attacking.criticals++
  if (event.skill) attacking.skills++
  if (event.dodged) defending.dodges++
}
function fromLogs(logs, complete = false) {
  const value = fresh(complete)
  logs.forEach(event => record(value, event))
  return value
}
function valid(value) {
  return value && typeof value.complete === 'boolean' && ['player', 'enemy'].every(side => {
    const row = value[side]; const other = value[side === 'player' ? 'enemy' : 'player']
    return row && other && keys.every(key => Number.isInteger(row[key]) && row[key] >= 0 && row[key] <= 1000000) &&
      row.criticals <= row.attacks && row.skills <= row.attacks && row.dodges <= other.attacks
  })
}
module.exports = { fresh, copy, record, fromLogs, valid }
