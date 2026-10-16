(function () {
  'use strict'
  const $ = selector => document.querySelector(selector)
  const $$ = selector => [...document.querySelectorAll(selector)]
  const rules = RoadRules; const renderer = RoadRenderer
  const canvas = $('#road'); const overlay = $('#overlay')
  const settings = RoadSettings.read()
  let state = rules.create(settings)
  let input = { left: false, right: false, accelerate: false, brake: false }
  const keys = new Set(); const pointers = new Map(); const activeKeys = new Set()
  let frame = 0; let last = 0; let lastUi = 0; let soundEnabled = false; let audio = null
  let lastNotice = ''; let displayVersion = ''

  function clearInput() {
    keys.clear(); pointers.clear(); activeKeys.clear()
    input = { left: false, right: false, accelerate: false, brake: false }
    $$('.touch-controls .held').forEach(button => button.classList.remove('held'))
    updateAudio()
  }

  function syncInput() {
    const held = new Set([...keys, ...pointers.values()])
    for (const name of Object.keys(input)) input[name] = held.has(name)
    $$('.touch-controls button').forEach(button => button.classList.toggle('held', !!input[button.dataset.control]))
  }

  function updateAudio() {
    if (!audio) return
    const running = state.status === 'running' && soundEnabled && !document.hidden
    const now = audio.context.currentTime
    audio.gain.gain.setTargetAtTime(running ? .024 + (input.accelerate ? .014 : 0) : 0, now, .12)
    audio.oscillator.frequency.setTargetAtTime(40 + state.speed * 1.25, now, .15)
    audio.filter.frequency.setTargetAtTime(140 + state.speed * 3, now, .2)
  }

  function enableAudio() {
    if (!audio) {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (!AudioContext) { $('#sound').disabled = true; $('#sound').title = '此浏览器不支持声音'; return }
      try {
        const context = new AudioContext(); const oscillator = context.createOscillator(); const gain = context.createGain(); const filter = context.createBiquadFilter()
        oscillator.type = 'sawtooth'; filter.type = 'lowpass'; filter.frequency.value = 220; gain.gain.value = 0
        oscillator.connect(filter); filter.connect(gain); gain.connect(context.destination); oscillator.start()
        audio = { context, oscillator, gain, filter }
      } catch { $('#sound').disabled = true; return }
    }
    audio.context.resume().catch(() => {})
    soundEnabled = !soundEnabled
    $('#sound').setAttribute('aria-label', soundEnabled ? '关闭声音' : '开启声音')
    $('#sound').title = soundEnabled ? '关闭声音' : '开启声音'
    $('#sound-path').setAttribute('d', soundEnabled ? 'M15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14' : 'm16 9 6 6m0-6-6 6')
    updateAudio()
  }

  function updateUi(force = false) {
    const speed = state.status === 'ready' ? 0 : Math.round(state.speed * 3.6)
    $('#speed').textContent = String(speed).padStart(2, '0')
    $('#distance').innerHTML = (state.distance / 1000).toFixed(2) + ' <small>km</small>'
    $('#score').innerHTML = state.score + ' <small>分</small>'
    $('#score').classList.toggle('negative', state.score < 0)
    $$('.speed-bars i').forEach((bar, i) => bar.classList.toggle('on', speed > i * 24))
    const status = state.status
    const version = status + settings.mode + state.phase
    if (force || displayVersion !== version) {
      displayVersion = version
      $('#scene-start').hidden = status !== 'ready'
      $('#pause').disabled = status === 'ready' || status === 'crashed' || status === 'finished'
      $('#pause').textContent = status === 'paused' ? '▷' : 'Ⅱ'
      $('#pause').setAttribute('aria-label', status === 'paused' ? '继续驾驶' : '暂停驾驶')
      $('#pause').title = status === 'paused' ? '继续驾驶' : '暂停驾驶'
      overlay.hidden = status !== 'paused' && status !== 'crashed' && status !== 'finished'
      if (!overlay.hidden) {
        const crashed = status === 'crashed'; const finished = status === 'finished'
        $('#overlay-kicker').textContent = finished ? 'A GOOD PLACE TO STOP' : crashed ? 'A LITTLE BUMP IN THE ROAD' : 'TAKE A BREATH'
        $('#overlay-title').textContent = finished ? '驶出成功，本程结束。' : crashed ? '发生事故，积分清零。' : '靠边歇一会儿。'
        $('#overlay-copy').textContent = (crashed || finished) ? `行驶 ${(state.distance / 1000).toFixed(2)} km · 超过 ${state.overtakes} 辆车${finished ? ' · 到达慢行小镇' : ''}` : '这条路会在这里等你。'
        $('#result-summary').hidden = !crashed && !finished
        if (crashed || finished) {
          $('#result-score').textContent = state.score
          $('#result-distance').textContent = '+' + state.distancePoints
          $('#result-skill').textContent = '+' + state.skillPoints
          $('#result-penalty').textContent = '−' + state.penaltyPoints
          $('#result-skills').textContent = state.nearMisses + ' 次'
          $('#result-tickets').textContent = state.speedingTickets + ' 次'
        }
        $('#overlay-action').textContent = (crashed || finished) ? '再开一程 →' : '继续兜风 →'
      }
      $('#dash-mode').textContent = settings.mode === 'cruise' ? '自动巡航' : '手动驾驶'
    }
    const statusText = status === 'ready' ? '准备好，就出发。' : status === 'paused' ? '歇一会儿，也很好。' : status === 'finished' ? '已驶出，好好休息。' : status === 'crashed' ? '下一程，再出发。' : state.mergeWaiting ? '等待并道空隙，安全优先。' : state.phase === 'entering' ? '右侧匝道，正在汇入。' : state.phase === 'exiting' ? '慢下来，沿匝道驶出。' : input.brake ? '放慢一点，看看风景。' : input.accelerate ? '风来了，留意前车。' : state.following ? '跟着车流，慢慢来。' : '好天气，往前开。'
    $('#road-status span').textContent = statusText
    $('#drive-state').textContent = status === 'ready' ? '等待出发' : status === 'paused' ? '已暂停' : (status === 'crashed' || status === 'finished') ? '本程结束' : state.phase === 'entering' ? '汇入中' : state.phase === 'exiting' ? '驶出中' : state.mergeWaiting ? '等待并道' : input.accelerate ? '加速中' : state.following ? '正在跟车' : '自在行驶'
    const road = RoadRoute.sample(state.distance)
    $('#route-lanes').textContent = state.phase === 'entering' ? '入口匝道' : state.phase === 'exiting' ? '驶出匝道' : road.transition ? `${road.transition.from} → ${road.transition.to} 车道` : `${road.lanes} 车道`
    $('#scenery-name').textContent = '沿途 · ' + RoadScenery.themeAt(state.distance).name
    const warning = RoadRoute.warning(state.distance, state.phase)
    const banner = $('#route-warning')
    banner.hidden = !warning || status === 'finished'
    if (warning) {
      banner.dataset.kind = warning.kind
      $('#warning-title').textContent = warning.title
      $('#warning-detail').textContent = warning.detail
      $('#warning-distance').textContent = warning.meters > 0 ? `${Math.ceil(warning.meters / 10) * 10} m` : ''
      banner.querySelector('.warning-symbol').textContent = { narrow: '↖', entry: '↖', exit: '↗', curve: '↝', wide: '⇈' }[warning.kind]
    }
    const exit = RoadRoute.exitAt(state.distance)
    const available = state.phase === 'driving' && exit.remaining <= 220 && state.distance <= exit.decisionEnd
    $('#exit-button').hidden = !available
    $('#exit-button').disabled = status !== 'running'
    $('#exit-button').setAttribute('aria-pressed', state.exitRequested)
    $('#exit-button').textContent = state.exitRequested ? '取消驶出 ×' : '驶出结算 ↗'
    $('#next-exit').textContent = state.phase === 'exiting' ? '驶出后结束并结算' : state.phase === 'arrived' ? '本程结束 · 已结算' : state.exitRequested ? (state.mode === 'manual' ? '请驶入最右侧车道 →' : '向右并道，准备结算 →') : available ? `结算出口 · ${Math.max(0, Math.ceil(exit.remaining / 10) * 10)} m` : `下个结算出口 ${(Math.max(0, exit.remaining) / 1000).toFixed(1)} km`
    const camera = RoadRoute.cameraAt(state.distance)
    const cameraAlert = $('#camera-alert')
    cameraAlert.hidden = state.phase !== 'driving' || camera.remaining > RoadRoute.CAMERA_WARNING || status === 'crashed'
    const speeding = state.speed * 3.6 > camera.limit + .05
    cameraAlert.classList.toggle('speeding', speeding)
    $('#camera-distance').textContent = `${Math.ceil(camera.remaining / 10) * 10} m · 限速 ${camera.limit}`
    const penalty = rules.speedingPenalty(state.speed * 3.6, camera.limit)
    $('#camera-hint').textContent = penalty > 0 ? `减速 · 扣${penalty}分` : speeding ? '超速10%内 · 不扣分' : `＞${camera.limit * 1.1}扣100 / ＞${camera.limit * 1.2}扣200`
    $('#speed').classList.toggle('speeding', !cameraAlert.hidden && speeding)
    const feedback = $('#score-feedback')
    feedback.hidden = state.scoreEventTime <= 0 || status !== 'running' || !state.scoreEvent
    if (state.scoreEvent) {
      feedback.dataset.kind = state.scoreEvent.kind
      $('#score-delta').textContent = state.scoreEvent.points > 0 ? '+' + state.scoreEvent.points : state.scoreEvent.points < 0 ? '−' + Math.abs(state.scoreEvent.points) : '✓'
      $('#score-reason').textContent = state.scoreEvent.message
    }
    const showMessage = state.noticeTime > 0 && state.status === 'running'
    $('#message').classList.toggle('visible', showMessage)
    if (showMessage && state.notice !== lastNotice) { $('#message').textContent = state.notice; lastNotice = state.notice }
  }

  function draw() { renderer.render(canvas, state, input); updateUi(true) }

  function loop(now) {
    frame = 0
    if (state.status !== 'running') return
    const delta = last ? Math.min((now - last) / 1000, .05) : 1 / 60
    last = now
    rules.step(state, input, delta)
    renderer.render(canvas, state, input)
    if (now - lastUi > 80 || state.status !== 'running') { updateUi(); updateAudio(); lastUi = now }
    if (state.status === 'running') frame = requestAnimationFrame(loop)
    else { clearInput(); updateUi(true) }
  }

  function schedule() {
    if (!frame && state.status === 'running' && !document.hidden) { last = 0; frame = requestAnimationFrame(loop) }
  }

  function pause() {
    if (state.status !== 'running') return
    state.status = 'paused'; cancelAnimationFrame(frame); frame = 0; clearInput(); draw()
  }

  function reset(run = false) {
    cancelAnimationFrame(frame); frame = 0; clearInput()
    state = rules.create(settings); lastNotice = ''; $('#message').textContent = ''
    if (run) rules.start(state)
    draw(); schedule(); updateAudio()
  }

  function action() {
    if ($('#help').open) return
    if (state.status === 'running') { pause(); return }
    if (state.status === 'crashed' || state.status === 'finished') { reset(true); return }
    rules.start(state); clearInput(); draw(); schedule(); updateAudio()
  }

  const mapping = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'accelerate', KeyW: 'accelerate', ArrowDown: 'brake', KeyS: 'brake' }
  function editable(target) { return target && /INPUT|TEXTAREA|SELECT/.test(target.tagName) }
  document.addEventListener('keydown', event => {
    if (editable(event.target) || $('#help').open) return
    if (event.code === 'KeyE') { event.preventDefault(); if (!event.repeat) { rules.requestExit(state); draw() } return }
    if (event.code === 'Space' || event.code === 'KeyP') {
      // Space on a focused button retains the browser's normal click behavior.
      if (event.code === 'Space' && event.target.closest('button')) return
      event.preventDefault(); if (!event.repeat) action(); return
    }
    const control = mapping[event.code]
    if (!control) return
    event.preventDefault()
    if (state.status !== 'running') return
    if (!event.repeat && state.mode === 'cruise' && (control === 'left' || control === 'right')) rules.changeLane(state, control === 'left' ? -1 : 1)
    activeKeys.add(event.code); keys.add(control); syncInput()
  })
  document.addEventListener('keyup', event => {
    if (!mapping[event.code]) return
    activeKeys.delete(event.code); keys.clear()
    for (const key of activeKeys) keys.add(mapping[key])
    syncInput()
  })

  $$('.touch-controls button').forEach(button => {
    button.addEventListener('pointerdown', event => {
      event.preventDefault()
      if (state.status !== 'running') return
      button.setPointerCapture(event.pointerId)
      const control = button.dataset.control; pointers.set(event.pointerId, control)
      if (state.mode === 'cruise' && (control === 'left' || control === 'right')) rules.changeLane(state, control === 'left' ? -1 : 1)
      syncInput()
    })
    const release = event => { pointers.delete(event.pointerId); syncInput() }
    button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release)
  })

  $('#overlay-action').addEventListener('click', action)
  $('#scene-start').addEventListener('click', action); $('#pause').addEventListener('click', action)
  $('#exit-button').addEventListener('click', () => { rules.requestExit(state); draw() })
  $('#reset').addEventListener('click', () => reset(false)); $('#sound').addEventListener('click', enableAudio)
  $('#help-open').addEventListener('click', () => { pause(); $('#help').showModal() })
  const closeHelp = () => $('#help').close()
  $('#help-close').addEventListener('click', closeHelp); $('#help-done').addEventListener('click', closeHelp)
  document.addEventListener('visibilitychange', () => { if (document.hidden) { activeKeys.clear(); pause(); clearInput() } })
  window.addEventListener('blur', () => { activeKeys.clear(); pause(); clearInput() })
  $('#back-to-setup').addEventListener('click', () => { pause(); clearInput() })
  window.addEventListener('pageshow', () => { draw(); schedule() })
  window.addEventListener('pagehide', () => { pause(); clearInput(); if (audio) audio.context.suspend().catch(() => {}) })
  new ResizeObserver(() => draw()).observe($('#scene'))
  rules.start(state)
  draw(); schedule()
})()
