// The 32 layouts below are a cell-by-cell transcription of the reference
// sheet supplied for this project. Each entry is [kind, x, y]; dimensions are
// derived from kind so that a layout can legitimately contain horizontal or
// vertical two-cell pieces.
const SIZE = { c: [2, 2], h: [2, 1], v: [1, 2], s: [1, 1] }
const generalNames = ['张飞', '马超', '赵云', '黄忠']
const heroIds = ['guan', 'zhang', 'ma', 'zhao', 'huang']
const heroNames = ['关羽', '张飞', '马超', '赵云', '黄忠']

function makePieces(cells, classicLayout = false) {
  let vertical = 0
  let horizontal = 0
  let soldier = 0
  let hero = 0
  const heroCount = cells.filter(([kind]) => kind === 'h' || kind === 'v').length
  if (heroCount !== 5) throw new Error(`A layout must contain five named heroes, got ${heroCount}`)
  return cells.map(([kind, x, y]) => {
    const [w, h] = SIZE[kind]
    if (kind === 'c') return { id: 'cao', role: 'cao', name: '曹操', x, y, w, h }
    if (kind === 'h') {
      if (!classicLayout) {
        const index = hero++
        return { id: heroIds[index], role: index === 0 ? 'guan' : 'general', name: heroNames[index], x, y, w, h }
      }
      horizontal += 1
      const canonical = horizontal === 1
      return { id: canonical ? 'guan' : `h${horizontal}`, role: canonical ? 'guan' : 'horizontal',
        name: canonical ? '关羽' : '横将', x, y, w, h }
    }
    if (kind === 'v') {
      if (!classicLayout) {
        const index = hero++
        return { id: heroIds[index], role: index === 0 ? 'guan' : 'general', name: heroNames[index], x, y, w, h }
      }
      const id = ['zhang', 'ma', 'zhao', 'huang'][vertical] || `v${vertical + 1}`
      const name = generalNames[vertical] || '竖将'
      vertical += 1
      return { id, role: 'general', name, x, y, w, h }
    }
    soldier += 1
    return { id: `s${soldier}`, role: 'soldier', name: '兵', x, y, w, h }
  })
}

function makeLevel(id, name, moves, cells, aliases = '') {
  return {
    id, name, aliases, referenceMoves: moves,
    subtitle: `${moves} 步 · 截图转录`,
    source: '用户提供的 32 局参考截图（逐格转录）',
    pieces: makePieces(cells, id === 'classic'),
    goal: { id: 'cao', x: 1, y: 3 }
  }
}

const levelSpecs = [
  ['classic', '横刀立马', 81, [['v', 0, 0], ['c', 1, 0], ['v', 3, 0], ['v', 0, 2], ['h', 1, 2], ['v', 3, 2], ['s', 1, 3], ['s', 2, 3], ['s', 0, 4], ['s', 3, 4]]],
  ['cross-generals', '横竖皆将', 81, [['v', 0, 0], ['c', 1, 0], ['v', 3, 0], ['v', 0, 2], ['h', 1, 2], ['s', 3, 2], ['h', 1, 3], ['s', 3, 3], ['s', 0, 4], ['s', 3, 4]], '又名云遮雾障'],
  ['bottleneck-one', '守口如瓶之一', 81, [['v', 0, 0], ['c', 1, 0], ['v', 3, 0], ['s', 0, 2], ['v', 1, 2], ['s', 3, 2], ['s', 0, 3], ['s', 3, 3], ['h', 0, 4], ['h', 2, 4]]],
  ['bottleneck-two', '守口如瓶之二', 99, [['s', 0, 0], ['c', 1, 0], ['s', 3, 0], ['v', 0, 1], ['v', 3, 1], ['v', 1, 2], ['s', 0, 3], ['s', 3, 3], ['h', 0, 4], ['h', 2, 4]]],
  ['layered-defense-one', '层层设防之一', 102, [['v', 0, 0], ['c', 1, 0], ['v', 3, 0], ['s', 0, 2], ['h', 1, 2], ['s', 3, 2], ['s', 0, 3], ['h', 1, 3], ['s', 3, 3], ['h', 1, 4]]],
  ['layered-defense-two', '层层设防之二', 120, [['s', 0, 0], ['c', 1, 0], ['s', 3, 0], ['v', 0, 1], ['v', 3, 1], ['h', 1, 2], ['s', 0, 3], ['h', 1, 3], ['s', 3, 3], ['h', 1, 4]]],
  ['three-army-defense', '三军联防', 65, [['c', 0, 0], ['v', 2, 0], ['v', 3, 0], ['h', 0, 2], ['h', 2, 2], ['s', 0, 3], ['h', 1, 3], ['s', 3, 3], ['s', 0, 4], ['s', 3, 4]], '又名交错堵道'],
  ['block-the-road', '堵塞要道', 40, [['s', 0, 0], ['c', 1, 0], ['s', 3, 0], ['s', 0, 1], ['s', 3, 1], ['v', 0, 2], ['v', 1, 2], ['h', 2, 2], ['h', 2, 3], ['h', 1, 4]]],
  ['flooded-road', '水泄不通', 79, [['v', 0, 0], ['c', 1, 0], ['s', 3, 0], ['s', 3, 1], ['h', 0, 2], ['h', 2, 2], ['h', 0, 3], ['h', 2, 3], ['s', 0, 4], ['s', 3, 4]]],
  ['four-routes', '四路皆兵', 66, [['c', 1, 0], ['v', 3, 0], ['s', 0, 2], ['s', 1, 2], ['s', 2, 2], ['s', 3, 2], ['h', 0, 3], ['h', 2, 3], ['h', 0, 4], ['h', 2, 4]], '又名四路进兵'],
  ['five-tigers', '五虎拦路', 39, [['c', 0, 0], ['h', 2, 0], ['h', 2, 1], ['v', 0, 2], ['v', 1, 2], ['h', 2, 2], ['s', 2, 3], ['s', 3, 3], ['s', 0, 4], ['s', 3, 4]], '又名四将联防'],
  ['linked-soldiers', '兵挡连环', 75, [['c', 0, 0], ['s', 2, 0], ['v', 3, 0], ['s', 2, 1], ['h', 0, 2], ['h', 2, 2], ['h', 0, 3], ['h', 2, 3], ['s', 0, 4], ['s', 3, 4]]],
  ['hard-to-fly', '插翅难飞', 62, [['v', 0, 0], ['c', 1, 0], ['s', 3, 0], ['s', 3, 1], ['h', 0, 2], ['s', 2, 2], ['s', 3, 2], ['v', 0, 3], ['h', 1, 3], ['v', 3, 3]]],
  ['advance-together', '齐头并进', 60, [['v', 0, 0], ['c', 1, 0], ['v', 3, 0], ['s', 0, 2], ['s', 1, 2], ['s', 2, 2], ['s', 3, 2], ['v', 0, 3], ['h', 1, 3], ['v', 3, 3]]],
  ['three-pronged', '兵分三路', 72, [['s', 0, 0], ['c', 1, 0], ['s', 3, 0], ['v', 0, 1], ['v', 3, 1], ['h', 1, 2], ['v', 0, 3], ['s', 1, 3], ['s', 2, 3], ['v', 3, 3]]],
  ['cao-camp', '将拥曹营', 72, [['c', 1, 0], ['v', 0, 1], ['v', 3, 1], ['v', 1, 2], ['v', 2, 2], ['s', 0, 3], ['s', 3, 3], ['h', 0, 4], ['s', 2, 4], ['s', 3, 4]]],
  ['horse-gate', '横马当关', 83, [['v', 0, 0], ['c', 1, 0], ['v', 3, 0], ['h', 0, 2], ['h', 2, 2], ['s', 0, 3], ['v', 1, 3], ['s', 3, 3], ['s', 0, 4], ['s', 3, 4]]],
  ['front-back-block', '前挡后堵', 42, [['c', 0, 0], ['h', 2, 0], ['v', 2, 1], ['s', 3, 1], ['v', 0, 2], ['v', 1, 2], ['s', 3, 2], ['s', 2, 3], ['s', 3, 3], ['h', 1, 4]], '又名前挡后阻'],
  ['soldier-blocks-general', '兵挡将阻', 87, [['s', 0, 0], ['c', 1, 0], ['v', 3, 0], ['s', 0, 1], ['v', 0, 2], ['h', 1, 2], ['s', 3, 2], ['h', 1, 3], ['s', 3, 3], ['h', 1, 4]]],
  ['under-the-city', '兵临城下', 54, [['s', 0, 0], ['c', 1, 0], ['s', 3, 0], ['s', 0, 1], ['s', 3, 1], ['v', 0, 2], ['v', 1, 2], ['v', 2, 2], ['v', 3, 2], ['h', 1, 4]]],
  ['one-way-march', '一路进军', 58, [['v', 0, 0], ['c', 1, 0], ['s', 3, 0], ['s', 3, 1], ['v', 0, 2], ['v', 1, 2], ['v', 2, 2], ['s', 3, 2], ['s', 3, 3], ['h', 1, 4]]],
  ['rushing-wind', '一路飙风', 39, [['v', 0, 0], ['c', 1, 0], ['s', 3, 0], ['s', 3, 1], ['v', 0, 2], ['h', 1, 2], ['v', 3, 2], ['s', 1, 3], ['v', 2, 3], ['s', 1, 4]]],
  ['cao-camp-two', '兵临曹营', 34, [['s', 0, 0], ['c', 1, 0], ['s', 3, 0], ['s', 0, 1], ['s', 3, 1], ['v', 0, 2], ['h', 1, 2], ['v', 3, 2], ['v', 1, 3], ['v', 2, 3]]],
  ['across-the-bank', '隔岸流兵', 47, [['v', 0, 0], ['c', 1, 0], ['s', 3, 0], ['s', 3, 1], ['v', 0, 2], ['h', 1, 2], ['v', 3, 2], ['v', 1, 3], ['s', 0, 4], ['s', 3, 4]]],
  ['peach-garden', '桃花园中', 70, [['s', 0, 0], ['c', 1, 0], ['s', 3, 0], ['v', 0, 1], ['v', 3, 1], ['v', 1, 2], ['v', 2, 2], ['s', 0, 3], ['s', 3, 3], ['h', 1, 4]]],
  ['first-to-climb', '捷足先登', 32, [['s', 0, 0], ['c', 1, 0], ['s', 3, 0], ['s', 0, 1], ['s', 3, 1], ['h', 1, 2], ['v', 0, 3], ['v', 1, 3], ['v', 2, 3], ['v', 3, 3]]],
  ['unbroken-circle', '围而不解', 62, [['v', 0, 0], ['c', 1, 0], ['s', 3, 0], ['s', 3, 1], ['v', 0, 2], ['h', 1, 2], ['s', 3, 2], ['v', 1, 3], ['v', 2, 3], ['s', 3, 3]]],
  ['guard-the-corner', '将守角楼', 70, [['v', 0, 0], ['c', 1, 0], ['v', 3, 0], ['s', 0, 2], ['h', 1, 2], ['s', 3, 2], ['v', 0, 3], ['s', 1, 3], ['s', 2, 3], ['v', 3, 3]]],
  ['five-gates', '巧过五关', 34, [['s', 0, 0], ['c', 1, 0], ['s', 3, 0], ['s', 0, 1], ['s', 3, 1], ['h', 0, 2], ['h', 2, 2], ['h', 0, 3], ['h', 2, 3], ['h', 1, 4]]],
  ['troops-seek-road', '屯兵索路', 71, [['c', 0, 0], ['v', 2, 0], ['v', 3, 0], ['h', 0, 2], ['s', 2, 2], ['s', 3, 2], ['v', 0, 3], ['v', 1, 3], ['s', 2, 3], ['s', 3, 3]]],
  ['paired-wings', '比翼横空', 28, [['h', 0, 0], ['c', 2, 0], ['h', 0, 1], ['h', 0, 2], ['h', 2, 2], ['s', 0, 3], ['s', 2, 3], ['v', 3, 3], ['s', 0, 4], ['s', 2, 4]]],
  ['winding-road', '峰回路转', 138, [['s', 0, 0], ['s', 1, 0], ['s', 2, 0], ['v', 3, 0], ['c', 0, 1], ['v', 2, 1], ['v', 3, 2], ['h', 1, 3], ['s', 1, 4], ['h', 2, 4]]]
]

const levels = levelSpecs.map(([id, name, moves, cells, aliases]) => makeLevel(id, name, moves, cells, aliases))
const classic = levels[0]
const defaultLevel = classic
function getLevel(id) { return levels.find(level => level.id === id) || defaultLevel }

module.exports = { classic, levels, defaultLevel, getLevel }
