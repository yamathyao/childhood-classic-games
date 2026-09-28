const definitions = [
  { id: 'arcade-500', order: 1, name: '500 米', subtitle: '标准挑战', targetDepth: 500, seed: 1999500, oxygenPeriod: 1000, warningMs: 500, fallMs: 100, airSpacing: 8 },
  { id: 'arcade-1000', order: 2, name: '1000 米', subtitle: '深井挑战', targetDepth: 1000, seed: 19991000, oxygenPeriod: 850, warningMs: 400, fallMs: 100, airSpacing: 10 }
]

function randomSource(seed) {
  let value = seed >>> 0
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0
    return value / 4294967296
  }
}

function makeRows(level, seed) {
  const random = randomSource(seed)
  const rows = ['############', '#....P.....#']
  let airColumn = 5
  for (let depth = 1; depth <= level.targetDepth; depth++) {
    const section = Math.floor(depth / 100)
    const row = ['#']
    const hardChance = Math.min(.15, .025 + section * .009 + (level.order - 1) * .025)
    for (let column = 1; column <= 10; column++) {
      let color = 'ABCD'[Math.floor(random() * 4)]
      const neighbor = random() < .5 ? row[column - 1] : rows[rows.length - 1][column]
      if ('ABCD'.includes(neighbor) && random() < .45) color = neighbor
      row.push(random() < hardChance && depth > 6 ? 'X' : color)
    }
    if (row.slice(1).every(cell => cell === 'X')) row[5] = 'A'
    if (depth % level.airSpacing === 0) {
      airColumn = Math.max(1, Math.min(10, airColumn + Math.floor(random() * 5) - 2))
      row[airColumn] = 'O'
      if (row[airColumn - 1] === 'X') row[airColumn - 1] = 'ABCD'[section % 4]
    }
    row.push('#')
    rows.push(row.join(''))
  }
  rows.push('############')
  return rows
}

const levels = definitions.map(definition => {
  const level = { ...definition, maxOxygen: 100, airRestore: 20, hardHits: 5, hardCost: 20, lives: 3, metersPerRow: 1 }
  level.makeRows = seed => makeRows(level, seed)
  level.rows = level.makeRows(level.seed)
  return level
})
const defaultLevel = levels[0]
function getLevel(id) { return levels.find(level => level.id === id) || defaultLevel }

module.exports = { levels, defaultLevel, getLevel, makeRows }
