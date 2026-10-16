const { box, text, background } = require('../../common/canvas.js')
const { drawScene, drawCar } = require('./art.js')
const rules = require('./rules.js')
const route = require('./route.js')
const scenery = require('./scenery.js')
const ink = '#304b40'; const muted = '#808675'; const green = '#46634c'
function label(c, value, r, selected = false, size = 13) {
  box(c, r, selected ? green : '#fcf8eb', 9, selected ? green : '#d1d4bd')
  text(c, value, r.x + r.w / 2, r.y + r.h / 2, size, selected ? '#fff9e4' : ink, 'center')
}
function draw({ context: c, view: v, page, settings, state: s, input = {}, help, warning = '', records }) {
  if (page === 'setup') background(c, v.width, v.height)
  else {
    // The opaque road scene covers this middle region on every frame.
    c.clearRect(0, 0, v.width, v.height)
    background(c, v.width, v.height, { x: 0, y: 0, w: v.width, h: v.scene.y })
    const below = v.scene.y + v.scene.h
    background(c, v.width, v.height, { x: 0, y: below, w: v.width, h: v.height - below })
  }
  text(c, page === 'setup' ? '‹  游戏合集' : '‹  选择座驾', 20, v.top + 18, 12, ink)
  text(c, '玩法', v.help.x + v.help.w / 2, v.top + 18, 12, ink, 'center')
  if (page === 'setup') {
    text(c, '滴滴叭叭', 21, v.top + 54, 27, ink, 'left', true)
    text(c, '开着小车，看沿途风景。', 144, v.top + 59, 10, muted)
    v.modes.forEach((r, i) => label(c, ['自动巡航', '手动驾驶'][i], r, settings.mode === ['cruise', 'manual'][i]))
    text(c, '今天，开哪辆？', 21, v.top + 144, 11, muted)
    v.cars.forEach((r, i) => {
      const car = rules.CARS[i]; const selected = settings.model === i
      box(c, r, selected ? '#e3e8cf' : '#f9f5e8', 10, selected ? '#597450' : '#d9d9c5')
      const scale = Math.min(.75, (r.h - 28) / 84)
      c.save(); c.translate(r.x + r.w / 2, r.y + (r.h - 25) / 2); c.scale(scale, scale); drawCar(c, i, 0, 0); c.restore()
      text(c, car.brand, r.x + r.w / 2, r.y + r.h - 20, Math.min(9, (r.w - 10) / car.brand.length * 1.55), ink, 'center')
      text(c, car.name, r.x + r.w / 2, r.y + r.h - 8, 9, muted, 'center')
      if (selected) text(c, '●', r.x + r.w - 10, r.y + 11, 8, green, 'center')
    })
    text(c, '路上的热闹程度', 21, v.densityY - 13, 11, muted)
    v.densities.forEach((r, i) => label(c, ['松弛', '日常', '高峰'][i], r, settings.density === ['easy', 'normal', 'busy'][i], 12))
    text(c, '每 100m +10 · 漂亮穿梭 +20', 21, v.densityY + 49, 11, ink)
    text(c, '限速 80 · 超 10% −100 / 超 20% −200', 21, v.densityY + 68, Math.min(10, (v.width - 42) / 29), muted)
    if (v.start.y - (v.densityY + 68) > 45) {
      text(c, rules.CARS[settings.model].note, 21, v.start.y - 38, 12, green)
      text(c, `本机最高 ${records.bestScore} 分 · 每 1.6km 可驶出结算`, 21, v.start.y - 19, 10, muted)
    }
    label(c, '开始兜风  →', v.start, true, 15)
  } else {
    text(c, s.status === 'paused' ? '继续' : '暂停', v.pause.x + 24, v.top + 18, 12, ink, 'center')
    drawScene(c, v.scene, s, input)
    const hint = route.warning(s.distance, s.phase)
    const status = hint ? hint.title + (hint.meters > 0 ? ' · ' + Math.ceil(hint.meters) + 'm' : '') : s.mode === 'cruise' ? '自动巡航 · 轻点左右换道' : '手动驾驶 · 按住方向与油门'
    box(c, { x: 12, y: v.scene.y + 10, w: v.width - 24, h: 33 }, hint && hint.kind === 'narrow' ? '#f4d18a' : '#f6f3dfed', 8)
    text(c, status, v.width / 2, v.scene.y + 27, Math.min(11, (v.width - 44) / 24), ink, 'center')
    const scenicLabel = '沿途 · ' + scenery.themeAt(s.distance).name
    box(c, { x: 12, y: v.scene.y + 50, w: scenicLabel.length * 10 + 18, h: 23 }, '#f4f1deeb', 6)
    text(c, scenicLabel, 21, v.scene.y + 62, 10, green)
    if (s.scoreEventTime > 0 && s.scoreEvent) {
      const event = s.scoreEvent
      const r = { x: 30, y: v.scene.y + v.scene.h * .38, w: v.width - 60, h: 32 }
      box(c, r, event.kind === 'penalty' ? '#f6e3caed' : '#faf8e8ed', 8)
      text(c, `${event.message} ${event.points > 0 ? '+' : ''}${event.points}`, v.width / 2, r.y + 16, 11, event.kind === 'penalty' ? '#a44e36' : green, 'center')
    } else if (s.noticeTime > 0) {
      text(c, s.notice, v.width / 2, v.scene.y + 91, 10, '#fffae3', 'center')
    }
    const camera = route.cameraAt(s.distance)
    if (s.phase === 'driving' && camera.remaining <= route.CAMERA_WARNING) {
      const r = { x: 12, y: v.scene.y + v.scene.h - 48, w: 140, h: 36 }
      box(c, r, '#f6d994', 8)
      text(c, `抓拍 ${Math.ceil(camera.remaining)}m · 限速 80`, r.x + r.w / 2, r.y + 18, 10, '#674d29', 'center')
    }
    const exit = route.exitAt(s.distance)
    if (s.phase === 'driving' && exit.remaining <= 220 && s.distance <= exit.decisionEnd) label(c, s.exitRequested ? '已选出口 · 靠右 →' : '驶出结算 ↗', v.exit, true, 11)
    const values = [`${Math.round(s.speed * 3.6)}`, `${(s.distance / 1000).toFixed(2)}`, `${s.score}`]
    const captions = ['km/h', 'km', '积分']
    box(c, v.dashboard, '#f9f6e9', 10, '#d9d7c2')
    values.forEach((value, i) => {
      const x = v.dashboard.x + v.dashboard.w * (i + .5) / 3
      text(c, value, x, v.dashboard.y + 25, 23, i === 2 && s.score < 0 ? '#a6533d' : ink, 'center')
      text(c, captions[i], x, v.dashboard.y + 49, 10, muted, 'center')
    })
    v.controls.forEach((r, i) => label(c, ['←', '→', '刹车', '加速'][i], r, !!input[r.key], i < 2 ? 23 : 13))
  }
  if (warning) {
    box(c, { x: 12, y: v.height - v.bottom - 16, w: v.width - 24, h: 16 }, '#f5e5cc', 3)
    text(c, warning, v.width / 2, v.height - v.bottom - 8, 9, '#914c3c', 'center')
  }
  const ended = s && ['crashed', 'finished'].includes(s.status)
  if (help || (page === 'drive' && (ended || s.status === 'paused'))) {
    c.fillStyle = '#243e35aa'; c.fillRect(0, 0, v.width, v.height)
    box(c, v.modal, '#f7f1df', 17, '#d0d0b6')
    const x = v.modal.x + 22; const y = v.modal.y
    text(c, help ? '兜风指南' : ended ? (s.status === 'finished' ? '这一程，到站了。' : '歇一歇，再出发。') : '稍作停靠', x, y + 35, 23, ink, 'left', true)
    if (help) {
      const lines = ['巡航：轻点左右换道，自动跟车。', '手动：按住方向，可同时按加速。', '刹车减速；弯道与收窄提前提示。', '每 100m +10，漂亮穿梭 +20。', '抓拍限速 80km/h，超 10% 扣100，', '超 20% 扣200，仅扣最高档。', '每 1.6km 可选右出口，驶出结算。', '手动需靠最右道；事故积分清零。']
      lines.forEach((line, i) => text(c, line, x, y + 72 + i * 23, Math.min(12, (v.modal.w - 44) / 23), i > 3 && i < 6 ? '#965b3b' : ink))
      label(c, '知道了', v.close, true)
    } else if (ended) {
      text(c, `${s.score} 分`, x, y + 83, 30, green)
      text(c, `${(s.distance / 1000).toFixed(2)}km · 漂亮穿梭 ${s.nearMisses} 次`, x, y + 119, 12, ink)
      text(c, s.status === 'crashed' ? '发生事故 · 本程积分清零' : `里程 +${s.distancePoints}  /  驾驶 +${s.skillPoints}`, x, y + 150, 12, s.status === 'crashed' ? '#965b3b' : muted)
      text(c, `抓拍 ${s.speedingTickets} 次  /  扣分 −${s.penaltyPoints}`, x, y + 175, 12, '#965b3b')
      label(c, '再兜一程  →', v.resume, true)
      label(c, '返回选择', v.choose)
    } else {
      text(c, '车流已暂停，按下继续再出发。', x, y + 87, 12, muted)
      text(c, '切到后台或改变屏幕尺寸会自动暂停。', x, y + 113, 11, muted)
      text(c, '返回选择将结束当前未结算的行程。', x, y + 146, 11, muted)
      label(c, '继续兜风', v.resume, true)
      label(c, '结束行程 · 返回选择', v.choose)
    }
  }
}
function drawCover(c, area) {
  const s = rules.create({ seed: 42 }); s.phase = 'driving'; s.distance = 570; s.lane = 2; s.traffic = [
    { lane: 0, z: 12, model: 4, speed: 22, desired: 22 }, { lane: 1, z: -8, model: 1, speed: 22, desired: 22 },
    { lane: 3, z: 22, model: 5, speed: 22, desired: 22 }]
  drawScene(c, area, s)
}
module.exports = { draw, drawCover }
