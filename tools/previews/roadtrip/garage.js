(function () {
  'use strict'
  const $ = selector => document.querySelector(selector)
  const $$ = selector => [...document.querySelectorAll(selector)]
  const settings = RoadSettings.read()

  function selectCar(model) {
    settings.model = model; RoadSettings.save(settings)
    $$('.car-choice').forEach(button => {
      const active = Number(button.dataset.model) === model
      button.classList.toggle('selected', active); button.setAttribute('aria-pressed', active)
    })
    const car = RoadRules.CARS[model]
    $('#car-note').textContent = car.note
    $('#car-spec').innerHTML = car.max + ' <small>km/h</small>'
  }

  RoadRules.CARS.forEach((car, model) => {
    const button = document.createElement('button'); button.className = 'car-choice'
    button.dataset.model = model; button.setAttribute('aria-label', `${car.brand} ${car.name}`)
    const picture = document.createElement('canvas'); picture.setAttribute('aria-hidden', 'true'); button.append(picture)
    const name = document.createElement('span'); name.textContent = car.name; button.append(name)
    const brand = document.createElement('small'); brand.textContent = car.brand; button.append(brand)
    $('#car-list').append(button); RoadRenderer.thumbnail(picture, model)
    button.addEventListener('click', () => selectCar(model))
  })

  function selectMode(mode) {
    settings.mode = mode; RoadSettings.save(settings)
    $$('[data-mode]').forEach(button => {
      const active = button.dataset.mode === mode
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', active)
    })
    $('#mode-description').innerHTML = mode === 'cruise' ? '油门交给车，方向交给你。<br>自动跟车，想超车时再加速。' : '方向、车距，都握在自己手里。<br>按住转向，自由穿过车道线。'
    $('#steer-label').textContent = mode === 'cruise' ? '切换车道' : '按住转向'
  }

  function selectDensity(density) {
    settings.density = density; RoadSettings.save(settings)
    $$('[data-density]').forEach(button => {
      const active = button.dataset.density === density
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', active)
    })
  }

  $$('[data-mode]').forEach(button => button.addEventListener('click', () => selectMode(button.dataset.mode)))
  $$('[data-density]').forEach(button => button.addEventListener('click', () => selectDensity(button.dataset.density)))
  $('#start').addEventListener('click', () => { RoadSettings.save(settings); window.location.href = 'drive.html' })
  $('#help-open').addEventListener('click', () => $('#help').showModal())
  for (const id of ['help-close', 'help-done']) $('#' + id).addEventListener('click', () => $('#help').close())
  selectCar(settings.model); selectMode(settings.mode); selectDensity(settings.density)
})()
