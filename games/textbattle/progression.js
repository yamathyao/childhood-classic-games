// Growth belongs to this challenge; the original character roll stays intact.
const upgrades = [
  { id: 'atk', name: '淬锋', label: '攻击', amount: 1, cap: 99, note: '每次出招都更有分量', color: '#ec937f' },
  { id: 'hp', name: '养元', label: '生命上限', amount: 12, cap: 99, note: '多一分余裕，再迎下一战', color: '#7ccddd' },
  { id: 'def', name: '固守', label: '防御', amount: 1, cap: 99, note: '减轻受击，稳住阵脚', color: '#b3c9ee' },
  { id: 'spd', name: '疾行', label: '攻速', amount: .04, cap: 12, note: '出手更快，武势积攒更频繁', color: '#8fd5bd' },
  { id: 'crit', name: '破绽', label: '暴击', amount: 4, cap: 8, note: '抓住破绽，争取致命一击', color: '#e8be71' },
  { id: 'dodge', name: '轻身', label: '闪避', amount: 3, cap: 8, note: '避开攻势，闪避也可蓄势', color: '#ccb2e9' }
]
const gain = Object.fromEntries(upgrades.map(item => [item.id, item.amount]))
const qualities = [
  { id: 'normal', name: '普通', probability: 70, multiplier: 1, color: '#eef2f7', fill: '#293b4d' },
  { id: 'fine', name: '精良', probability: 25, multiplier: 1.5, color: '#69b8ff', fill: '#213e5b' },
  { id: 'epic', name: '史诗', probability: 5, multiplier: 2, color: '#b394ff', fill: '#362b50' },
  { id: 'legendary', name: '传说', probability: .2, multiplier: 3, color: '#ffca62', fill: '#493b24' }
]
const fixedAmounts = {
  atk: { normal: 1, fine: 2, epic: 3, legendary: 5 }, hp: { normal: 10, fine: 20, epic: 30, legendary: 50 },
  def: { normal: 1, fine: 2, epic: 3, legendary: 5 }, spd: { normal: .04, fine: .08, epic: .12, legendary: .2 },
  crit: { normal: 2, fine: 4, epic: 6, legendary: 10 }, dodge: { normal: 2, fine: 4, epic: 6, legendary: 10 }
}
const fixedLimits = { hp: 200, def: 6 }
const activeQualities = growth => growth.version >= 3 ? qualities : qualities.slice(0, 3)
const zeroCounts = () => Object.fromEntries(upgrades.map(item => [item.id, 0]))
// Attack uses whole points so every quality has a distinct, visible increase.
const potency = (item, quality) => item.id === 'atk' ? (quality.id === 'legendary' ? 5 : qualities.indexOf(quality) + 1) : quality.multiplier
const baseAmount = (item, growth) => item.id === 'def' && growth.version < 4 ? 2 : item.amount
function fresh() { return { version: 5, counts: zeroCounts(), qualities: Object.fromEntries(qualities.map(item => [item.id, zeroCounts()])), pending: false } }
function copy(value) {
  return { ...value, counts: { ...value.counts }, ...(value.qualities ? {
    qualities: Object.fromEntries(activeQualities(value).map(item => [item.id, { ...value.qualities[item.id] }]))
  } : {}), ...(value.legacy ? { legacy: copy(value.legacy) } : {}) }
}
function units(growth) {
  if (growth.version === 1) return growth.counts
  if (growth.version >= 5) return Object.fromEntries(upgrades.map(item => [item.id,
    activeQualities(growth).reduce((sum, quality) => sum + (qualityCount(growth, item.id, quality.id) - qualityCount(growth.legacy, item.id, quality.id)) * fixedAmounts[item.id][quality.id], 0)]))
  return Object.fromEntries(upgrades.map(item => [item.id,
    activeQualities(growth).reduce((sum, quality) => sum + growth.qualities[quality.id][item.id] * potency(item, quality), 0)]))
}
function qualityCount(growth, id, quality) {
  if (!growth) return 0
  if (growth.version === 1) return quality === 'normal' ? growth.counts[id] : 0
  return growth.qualities[quality] ? growth.qualities[quality][id] : 0
}
function promote(growth) {
  if (growth.version === 5) return growth
  const value = fresh(); value.counts = { ...growth.counts }; value.pending = growth.pending
  if (growth.version === 1) value.qualities.normal = { ...growth.counts }
  else for (const quality of activeQualities(growth)) value.qualities[quality.id] = { ...growth.qualities[quality.id] }
  value.legacy = { ...copy(growth), pending: false }
  return value
}
function add(growth, item) {
  growth.counts[item.id]++
  if (growth.version >= 2) growth.qualities[item.quality][item.id]++
}
function owned(growth) {
  if (!growth) return []
  return upgrades.filter(item => growth.counts[item.id] > 0).map(item => {
    const counts = qualities.map(quality => growth.version === 1 ? (quality.id === 'normal' ? growth.counts[item.id] : 0) :
      (growth.qualities[quality.id] ? growth.qualities[quality.id][item.id] : 0))
    const quality = qualities.reduce((best, quality, index) => counts[index] > 0 ? quality : best, qualities[0])
    return { ...item, count: growth.counts[item.id], quality: quality.id, color: quality.color, breakdown: counts }
  })
}
function apply(attributes, growth) {
  if (!growth) return attributes
  const n = units(growth)
  if (growth.version >= 5) return { ...attributes, maxHp: attributes.maxHp + Math.min(fixedLimits.hp, n.hp), atk: attributes.atk + n.atk, def: attributes.def + Math.min(fixedLimits.def, n.def), spd: Math.min(4, attributes.spd + n.spd), crit: Math.min(60, attributes.crit + n.crit), dodge: Math.min(45, attributes.dodge + n.dodge) }
  return { ...attributes, maxHp: attributes.maxHp + n.hp * gain.hp, atk: attributes.atk + n.atk * gain.atk,
    def: attributes.def + n.def * (growth.version >= 4 ? gain.def : 2), spd: Math.min(4, attributes.spd * (1 + n.spd * gain.spd)),
    crit: Math.min(60, attributes.crit + n.crit * gain.crit), dodge: Math.min(45, attributes.dodge + n.dodge * gain.dodge) }
}
function enemyGrowth(round, version = 1) {
  const n = round - 1; const strong = round % 5 === 0
  // Gentle opening, smooth acceleration later; strong fights are small local peaks.
  return version >= 2 ? {
    hp: (1 + n * .02 + n * n * .00016) * (strong ? 1.06 : 1),
    atk: (1 + n * .018 + n * n * .00014) * (strong ? 1.04 : 1), def: 1 + n * .01
  } : { hp: (1 + n * .014 + n * n * .00013) * (strong ? 1.06 : 1),
    atk: (1 + n * .012 + n * n * .00011) * (strong ? 1.04 : 1), def: 1 + n * .008 }
}
function total(value) { return upgrades.reduce((sum, item) => sum + value.counts[item.id], 0) }
function valid(value, state) {
  if (value && value.legacy) {
    const old = value.legacy
    if (value.version !== 5 || !value.counts || !value.qualities || !old.counts || ![1, 2, 3, 4].includes(old.version) || old.legacy || old.pending !== false ||
      !valid(old, { round: total(old) + 1, status: 'prepare' }) ||
      upgrades.some(item => old.counts[item.id] > value.counts[item.id]) ||
      activeQualities(old).some(q => !value.qualities[q.id] || upgrades.some(item => qualityCount(old, item.id, q.id) > value.qualities[q.id][item.id]))) return false
  }
  return value && [1, 2, 3, 4, 5].includes(value.version) && typeof value.pending === 'boolean' && value.counts &&
    upgrades.every(item => Number.isInteger(value.counts[item.id]) && value.counts[item.id] >= 0 && value.counts[item.id] <= item.cap) &&
    (value.version === 1 ? value.qualities === undefined : value.qualities && activeQualities(value).every(quality => value.qualities[quality.id] &&
      upgrades.every(item => Number.isInteger(value.qualities[quality.id][item.id]) && value.qualities[quality.id][item.id] >= 0)) &&
      upgrades.every(item => activeQualities(value).reduce((sum, quality) => sum + value.qualities[quality.id][item.id], 0) === value.counts[item.id]) &&
      (value.version >= 3 || value.qualities.legendary === undefined)) &&
    total(value) === state.round - 1 - (value.pending ? 1 : 0) &&
    (!value.pending || (state.status === 'prepare' && state.round > 1))
}
function odds(state) {
  const version = state.progression ? state.progression.version : 3
  if (version === 1) return { guaranteed: false, qualities: [{ ...qualities[0], probability: 100 }] }
  const chance = version >= 3 ? Math.min(3, .2 + Math.max(0, state.streak - 1) * .04) : 0
  return { guaranteed: version >= 3 && state.streak > 0 && state.streak % 5 === 0,
    qualities: (version >= 3 ? qualities : qualities.slice(0, 3)).map(quality => ({ ...quality,
      probability: quality.id === 'legendary' ? chance : quality.probability * (1 - chance / 100) })) }
}
function candidates(state) {
  if (!state.progression || !state.progression.pending) return []
  // A separate deterministic shuffle cannot advance combat RNG or reroll on reload.
  let seed = (state.runId ^ Math.imul(state.round, 0x9e3779b9)) >>> 0 || 1
  const fixedGrowth = state.progression.version >= 5 ? units(state.progression) : null
  const available = upgrades.filter(item => {
    if (state.progression.counts[item.id] >= item.cap) return false
    if (fixedGrowth && fixedLimits[item.id] && fixedGrowth[item.id] >= fixedLimits[item.id]) return false
    const key = item.id === 'hp' ? 'maxHp' : item.id
    const limit = { spd: 4, crit: 60, dodge: 45 }[key]
    return !limit || state.player.stats[key] < limit
  }).map(item => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5
    return { item, order: seed >>> 0 }
  })
  const policy = odds(state)
  const result = available.sort((a, b) => a.order - b.order).slice(0, 3).map(value => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5
    const roll = (seed >>> 0) / 4294967296 * 100
    const chance = state.progression.version >= 3 ? policy.qualities[3].probability : 0
    // Test legendary first; otherwise the remaining roll keeps the 70:25:5 ratio.
    const standardRoll = (roll - chance) / (1 - chance / 100)
    let threshold = 0
    const rolled = roll < chance ? qualities[3] : qualities.slice(0, 3).find(quality => {
      threshold += quality.probability; return standardRoll < threshold
    })
    const quality = state.progression.version === 1 ? qualities[0] : rolled
    const amount = state.progression.version >= 5 ? fixedAmounts[value.item.id][quality.id] : baseAmount(value.item, state.progression)
    const scaledAmount = state.progression.version >= 5 ? amount : amount * potency(value.item, quality)
    return { ...value.item, amount: scaledAmount, quality: quality.id, qualityName: quality.name,
      multiplier: quality.multiplier, color: quality.color, fill: quality.fill }
  })
  if (policy.guaranteed && result.length && !result.some(item => item.quality === 'legendary')) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5
    const index = Math.floor((seed >>> 0) / 4294967296 * result.length)
    const item = result[index]; const quality = qualities[3]
    const upgrade = upgrades.find(upgrade => upgrade.id === item.id)
    result[index] = { ...item, amount: state.progression.version >= 5 ? fixedAmounts[upgrade.id][quality.id] : baseAmount(upgrade, state.progression) * potency(upgrade, quality), quality: quality.id,
      qualityName: quality.name, multiplier: quality.multiplier, color: quality.color, fill: quality.fill }
  }
  return result
}
function migrate(round) {
  const growth = fresh()
  // Already won rounds in an old challenge receive balanced catch-up bonuses.
  for (let i = 0; i < round - 1; i++) add(growth, { id: ['hp', 'atk', 'def'][i % 3], quality: 'normal' })
  return growth
}
module.exports = { upgrades, qualities, fixedAmounts, fixedLimits, fresh, copy, units, promote, add, owned, apply, enemyGrowth, total, valid, odds, candidates, migrate }
