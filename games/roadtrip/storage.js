const SETTINGS_KEY = 'roadtrip.settings.v1'
const RECORDS_KEY = 'roadtrip.records.v1'
function settings(value) {
  const v = value && typeof value === 'object' ? value : {}
  return { mode: v.mode === 'manual' ? 'manual' : 'cruise', density: ['easy', 'normal', 'busy'].includes(v.density) ? v.density : 'easy',
    model: Number.isInteger(v.model) && v.model >= 0 && v.model < 6 ? v.model : 0 }
}
function records(value) {
  const v = value && typeof value === 'object' ? value : {}
  const number = key => Number.isFinite(v[key]) && v[key] >= 0 ? v[key] : 0
  return { bestScore: number('bestScore'), bestDistance: number('bestDistance'), trips: Math.floor(number('trips')), arrivals: Math.floor(number('arrivals')) }
}
function finish(record, state) {
  return { bestScore: Math.max(record.bestScore, state.score), bestDistance: Math.max(record.bestDistance, state.distance),
    trips: record.trips + 1, arrivals: record.arrivals + (state.status === 'finished' ? 1 : 0) }
}
module.exports = { SETTINGS_KEY, RECORDS_KEY, settings, records, finish }
