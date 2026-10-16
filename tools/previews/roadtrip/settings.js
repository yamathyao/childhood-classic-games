(function () {
  'use strict'
  const key = 'roadtrip.preview.settings'
  function read() {
    let value = {}
    try { value = JSON.parse(sessionStorage.getItem(key)) || {} } catch {}
    return {
      mode: value.mode === 'manual' ? 'manual' : 'cruise',
      density: ['easy', 'normal', 'busy'].includes(value.density) ? value.density : 'easy',
      model: Number.isInteger(value.model) && value.model >= 0 && value.model < RoadRules.CARS.length ? value.model : 0
    }
  }
  function save(value) { try { sessionStorage.setItem(key, JSON.stringify(value)) } catch {} }
  window.RoadSettings = { read, save }
})()
