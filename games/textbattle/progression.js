// Growth belongs to this challenge; the original character roll stays intact.
const upgrades = [
  { id: 'atk', name: '淬锋', label: '攻击', amount: 1, cap: 99, note: '每次出招都更有分量', color: '#ec937f' },
  { id: 'hp', name: '养元', label: '生命上限', amount: 12, cap: 99, note: '多一分余裕，再迎下一战', color: '#7ccddd' },
  { id: 'def', name: '固守', label: '防御', amount: 2, cap: 99, note: '减轻受击，稳住阵脚', color: '#b3c9ee' },
  { id: 'spd', name: '疾行', label: '攻速', amount: .04, cap: 12, note: '出手更快，武势积攒更频繁', color: '#8fd5bd' },
  { id: 'crit', name: '破绽', label: '暴击', amount: 4, cap: 8, note: '抓住破绽，争取致命一击', color: '#e8be71' },
  { id: 'dodge', name: '轻身', label: '闪避', amount: 3, cap: 8, note: '避开攻势，闪避也可蓄势', color: '#ccb2e9' }
]
const gain = Object.fromEntries(upgrades.map(item => [item.id, item.amount]))
function fresh() { return { version: 1, counts: Object.fromEntries(upgrades.map(item => [item.id, 0])), pending: false } }
function copy(value) { return { ...value, counts: { ...value.counts } } }
function apply(attributes, growth) {
  if (!growth) return attributes
  const n = growth.counts
  return { ...attributes, maxHp: attributes.maxHp + n.hp * gain.hp, atk: attributes.atk + n.atk * gain.atk,
    def: attributes.def + n.def * gain.def, spd: Math.min(4, attributes.spd * (1 + n.spd * gain.spd)),
    crit: Math.min(60, attributes.crit + n.crit * gain.crit), dodge: Math.min(45, attributes.dodge + n.dodge * gain.dodge) }
}
function enemyGrowth(round) {
  const n = round - 1; const strong = round % 5 === 0
  // Gentle opening, smooth acceleration later; strong fights are small local peaks.
  return { hp: (1 + n * .014 + n * n * .00013) * (strong ? 1.06 : 1),
    atk: (1 + n * .012 + n * n * .00011) * (strong ? 1.04 : 1), def: 1 + n * .008 }
}
function total(value) { return upgrades.reduce((sum, item) => sum + value.counts[item.id], 0) }
function valid(value, state) {
  return value && value.version === 1 && typeof value.pending === 'boolean' && value.counts &&
    upgrades.every(item => Number.isInteger(value.counts[item.id]) && value.counts[item.id] >= 0 && value.counts[item.id] <= item.cap) &&
    total(value) === state.round - 1 - (value.pending ? 1 : 0) &&
    (!value.pending || (state.status === 'prepare' && state.round > 1))
}
function candidates(state) {
  if (!state.progression || !state.progression.pending) return []
  // A separate deterministic shuffle cannot advance combat RNG or reroll on reload.
  let seed = (state.runId ^ Math.imul(state.round, 0x9e3779b9)) >>> 0 || 1
  const available = upgrades.filter(item => {
    if (state.progression.counts[item.id] >= item.cap) return false
    const key = item.id === 'hp' ? 'maxHp' : item.id
    const limit = { spd: 4, crit: 60, dodge: 45 }[key]
    return !limit || state.player.stats[key] < limit
  }).map(item => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5
    return { item, order: seed >>> 0 }
  })
  return available.sort((a, b) => a.order - b.order).slice(0, 3).map(value => value.item)
}
function migrate(round) {
  const growth = fresh()
  // Already won rounds in an old challenge receive balanced catch-up bonuses.
  for (let i = 0; i < round - 1; i++) growth.counts[['hp', 'atk', 'def'][i % 3]]++
  return growth
}
module.exports = { upgrades, fresh, copy, apply, enemyGrowth, total, valid, candidates, migrate }
