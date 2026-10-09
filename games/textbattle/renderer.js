const { box, path, text, gradient, headerButton } = require('../../common/canvas.js')
const { weapons, stances, skill, weaponSkills, weaponSkill, momentum, counters, relation, upgradeChoices, upgradePreview } = require('./rules.js')
const report = require('./report.js')
const { attributePanels, nameControls } = require('./layout.js')
const { drawWeapon } = require('./weapon-art.js')
const { drawSprite } = require('./art.js')
const { meterValue, readyDuration, fighterPose } = require('./feedback.js')
const { drawLabels } = require('./combat-art.js')
const colors = { bg: '#111c2c', panel: '#1b2b40', line: '#38516d', ink: '#f3edda', muted: '#a8b8c9', gold: '#e8be71', blue: '#7ccddd', red: '#ec937f' }
function line(c, points, color, width) {
  c.beginPath(); c.moveTo(points[0][0], points[0][1]); points.slice(1).forEach(point => c.lineTo(point[0], point[1]))
  c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke()
}
function fighter(c, x, y, size, color, facing, weapon, motion = 0, art, gender = 'male') {
  if (drawSprite(c, art, x, y + size * .36, size, facing, weapon, gender)) return
  const p = (a, b) => [x + a * size * facing, y + b * size]
  c.strokeStyle = color; c.lineWidth = size * .075
  c.beginPath(); c.arc(x, y - size * .72, size * .16, 0, Math.PI * 2); c.stroke()
  if (gender === 'female') line(c, [p(-.12, -.8), p(-.28, -.77), p(-.3, -.53)], color, size * .07)
  line(c, [p(0, -.5), p(0, -.06)], color, size * .065)
  line(c, [p(-.3, .36), p(0, -.06), p(.32, .36)], color, size * .065)
  line(c, [p(-.3, -.12), p(0, -.4), p(.35 + motion * .2, -.28)], color, size * .06)
  drawWeapon(c, ...p(.35 + motion * .2, -.28), size, facing, weapon)
  if (weapon === 'dual') drawWeapon(c, ...p(-.3, -.12), size, -facing, weapon)
}
function drawCover(c, rect, art) {
  const w = Math.min(rect.w, rect.h * 2.4); const h = rect.h
  const r = { x: rect.x + (rect.w - w) / 2, y: rect.y, w, h }
  box(c, r, gradient(c, r.x, r.y, w, h, ['#243b53', '#101a2b']), 12, '#76808a')
  line(c, [[r.x + w * .08, r.y + h * .84], [r.x + w * .92, r.y + h * .84]], '#52647a', 1)
  const size = h * .48; const y = r.y + h * .66
  fighter(c, r.x + w * .26, y, size, colors.blue, 1, 'saber', 0, art)
  fighter(c, r.x + w * .74, y, size, colors.red, -1, 'halberd', 0, art, 'female')
  text(c, 'VS', r.x + w / 2, r.y + h * .47, Math.min(22, h * .17), colors.gold, 'center', true)
}
function control(c, rect, label, detail, selected = false, enabled = true) {
  c.save(); if (!enabled) c.globalAlpha = .48
  box(c, rect, selected ? '#354758' : '#1b2b40', 8, selected ? colors.gold : colors.line)
  const compact = rect.w < 80
  const short = rect.h < 40
  text(c, label, compact ? rect.x + rect.w / 2 : rect.x + 11, rect.y + (short ? 10 : 13), compact ? 13 : 14, selected ? colors.gold : colors.ink, compact ? 'center' : 'left', true)
  text(c, compact ? detail.replace(/ · /g, '') : detail, compact ? rect.x + rect.w / 2 : rect.x + 11, rect.y + (short ? 25 : 29), 10, colors.muted, compact ? 'center' : 'left')
  c.restore()
}
function drawMomentum(c, rect, actor, accent, meterState, now) {
  const compact = rect.h <= 110
  const meter = { x: rect.x + 8, y: rect.y + (compact ? 28 : 34), w: rect.w - 72, h: 5 }
  const ready = actor.combat.momentum >= momentum.max
  const value = meterState ? meterValue(meterState, now) : actor.combat.momentum
  const pulse = meterState && meterState.readyAt !== null ? Math.max(0, 1 - (now - meterState.readyAt) / readyDuration) : 0
  box(c, meter, '#0b1523', 3)
  if (value > 0) box(c, { ...meter, w: meter.w * value / momentum.max }, ready ? colors.gold : accent, 3)
  if (ready) {
    box(c, { x: meter.x - 1, y: meter.y - 1, w: meter.w + 2, h: meter.h + 2 }, null, 4, pulse > 0 ? '#ffe6ae' : '#9d7d48')
    if (pulse > 0) {
      c.save(); c.globalAlpha = pulse * .65
      box(c, { x: meter.x - 2, y: meter.y - 2, w: meter.w + 4, h: meter.h + 4 }, null, 4, '#ffe6ae')
      c.restore()
    }
  }
  text(c, ready ? '武势 待发' : `武势 ${Math.floor(actor.combat.momentum / 100)}`, rect.x + rect.w - 8, meter.y + 3, 9, ready ? '#ffe3a2' : colors.muted, 'right', ready)
}
function drawAttributes(c, panels, state, feedback, now) {
  const entries = [['生命', 'hp'], ['攻速 /s', 'spd'], ['攻击', 'atk'], ['暴击', 'crit'], ['防御', 'def'], ['闪避', 'dodge']]
  for (const side of ['player', 'enemy']) {
    const rect = panels[side]; const actor = state[side]
    const accent = side === 'player' ? colors.blue : colors.red
    const fills = side === 'player' ? ['#223b50', '#182c40'] : ['#3d343b', '#2c2935']
    box(c, rect, gradient(c, rect.x, rect.y, rect.w, rect.h, fills), 10, side === 'player' ? '#567f93' : '#916f6b')
    text(c, side === 'player' ? '我方' : '敌方', rect.x + 10, rect.y + 16, 14, accent, 'left', true)
    const weapon = weapons.find(item => item.id === (side === 'player' ? state.weapon : actor.weapon))
    text(c, weapon.name, rect.x + rect.w - 10, rect.y + 16, 10, colors.muted, 'right')
    if (state.status !== 'prepare' && actor.combat && actor.combat.ward) {
      text(c, '护身', rect.x + rect.w - 47, rect.y + 16, 9, '#b4dfe8', 'right')
    }
    const compact = rect.h <= 110
    const tight = rect.h < 94
    const charging = state.combatVersion >= 5
    if (charging) {
      drawMomentum(c, rect, actor, accent, feedback && feedback.meters[side], now)
    } else line(c, [[rect.x + 10, rect.y + (compact ? 26 : 29)], [rect.x + rect.w - 10, rect.y + (compact ? 26 : 29)]], side === 'player' ? '#415f74' : '#63515a', 1)
    const firstRow = charging ? compact ? 40 : 50 : tight ? 31 : compact ? 33 : 38
    const rowHeight = charging ? (rect.h - firstRow) / 3 : (rect.h - (compact ? 28 : 40)) / 3
    entries.forEach(([label, key], index) => {
      const x = rect.x + 8 + (index % 2 + .5) * (rect.w - 16) / 2
      const y = rect.y + firstRow + Math.floor(index / 2) * rowHeight
      text(c, label, x, y, charging && compact ? 9 : 10, colors.muted, 'center')
      const concealed = side === 'enemy' && state.status === 'prepare'
      const value = concealed ? '？' : key === 'hp' ? `${actor.hp}/${actor.stats.maxHp}` : key === 'spd' ? actor.stats.spd.toFixed(2) :
        key === 'crit' || key === 'dodge' ? `${actor.stats[key].toFixed(1)}%` : actor.stats[key]
      text(c, value, x, y + (charging && compact ? 9 : tight ? 10 : compact ? 12 : 14), key === 'hp' ? (compact ? 10 : 11) : (charging && compact ? 11 : compact ? 12 : 13), accent, 'center')
    })
  }
}
function actionButton(c, rect, label, primary = true) {
  box(c, rect, primary ? '#dfb673' : '#253a50', 9, primary ? '#f3d69d' : '#58718a')
  text(c, label, rect.x + rect.w / 2, rect.y + rect.h / 2, 15, primary ? '#1b2634' : colors.ink, 'center', true)
}
function logText(event) {
  const time = `${(event.time / 1000).toFixed(1)}s`
  const actor = event.side === 'player' ? '我方' : '敌方'
  const ability = event.skill ? skill(event.skill).short : '出招'
  const outcome = event.dodged ? '被闪避' : `${event.critical ? '暴' : ''}${event.damage}伤${event.counter ? '·克' : event.guarded ? '·挡' : ''}`
  return `${time} ${actor}·${ability} ${outcome}${event.healed ? ` 回${event.healed}` : ''}`
}
function drawArena(c, view, state, feedback, now, art) {
  const { arena, width } = view
  const effects = feedback ? feedback.effects : []
  box(c, arena, gradient(c, arena.x, arena.y, arena.w, arena.h, ['#253b50', '#142335']), 12, '#4b6278')
  c.save(); path(c, arena.x + 1, arena.y + 1, arena.w - 2, arena.h - 2, 11); c.clip()
  text(c, `第 ${state.round} 战${state.progression && state.round % 5 === 0 ? ' · 强敌' : ''}`, width / 2, arena.y + 15, 11, colors.gold, 'center')
  const center = width / 2; const half = (arena.w - 36) / 2
  const size = Math.min(62, (arena.h - 55) / 1.7)
  const ground = arena.y + arena.h - 10
  const points = { player: { x: arena.x + 12 + half / 2, y: ground }, enemy: { x: center + 6 + half / 2, y: ground } }
  for (const [side, x, color, facing] of [['player', arena.x + 12, colors.blue, 1], ['enemy', center + 6, colors.red, -1]]) {
    const actor = state[side]
    if (side === 'player') {
      if (state.status === 'prepare') box(c, view.gender, '#29485b', 6, '#648d9e')
      const nameWidth = half - 42
      text(c, actor.name, x + nameWidth / 2, arena.y + 31, Math.min(12, nameWidth / actor.name.length), color, 'center')
      text(c, `${actor.gender === 'female' ? '女' : '男'}${state.status === 'prepare' ? '⇄' : ''}`,
        view.gender.x + view.gender.w / 2, arena.y + 31, 10, color, 'center')
    } else text(c, `${actor.name} · ${actor.gender === 'female' ? '女' : '男'}`, x + half / 2, arena.y + 31, 12, color, 'center')
    box(c, { x, y: arena.y + 43, w: half, h: 5 }, '#0b1523', 3)
    if (actor.hp > 0) box(c, { x, y: arena.y + 43, w: half * actor.hp / actor.stats.maxHp, h: 5 }, color, 3)
    const pose = fighterPose(effects, side, now)
    const point = points[side]
    line(c, [[point.x - size * .4, ground + 1], [point.x + size * .4, ground + 1]], '#385369', 2)
    c.save()
    c.translate(point.x + facing * pose.advance * size, point.y - pose.lift * size)
    c.rotate(pose.lean * facing)
    fighter(c, 0, -size * .36, size, color, facing, side === 'player' ? state.weapon : actor.weapon, pose.strike, art, actor.gender)
    c.restore()
  }
  text(c, 'VS', center, arena.y + arena.h * .68, 15, colors.gold, 'center', true)
  drawLabels(c, effects, points, arena, now, size)
  c.restore()
}
// Between attacks only the arena and the narrow meter strips can change.
function drawCombatFrame(c, view, state, { feedback, now, art }) {
  drawArena(c, view, state, feedback, now, art)
  if (state.combatVersion < 5) return
  for (const side of ['player', 'enemy']) {
    const rect = view.attributes[side]
    const fills = side === 'player' ? ['#223b50', '#182c40'] : ['#3d343b', '#2c2935']
    c.save()
    c.beginPath(); c.rect(rect.x + 2, rect.y + 23, rect.w - 4, 15); c.clip()
    c.fillStyle = gradient(c, rect.x, rect.y, rect.w, rect.h, fills)
    c.fillRect(rect.x + 2, rect.y + 23, rect.w - 4, 15)
    drawMomentum(c, rect, state[side], side === 'player' ? colors.blue : colors.red, feedback.meters[side], now)
    c.restore()
  }
}
function draw(c, view, state, { modal, best, feedback, now, saveFailed, logOffset = 0, reviewing = false, art }) {
  const { width, height, top, arena } = view
  const tactical = state.combatVersion >= 2
  c.clearRect(0, 0, width, height)
  c.fillStyle = gradient(c, 0, 0, width, height, ['#18283d', '#0e1725']); c.fillRect(0, 0, width, height)
  const header = { fill: '#273d55', stroke: '#657c90', color: colors.ink, inner: '#3e566c', shadow: 'transparent', size: 12 }
  headerButton(c, view.home, '‹ 游戏合集', header)
  headerButton(c, view.restart, '重新开始', { ...header, fill: '#654238', stroke: '#be8870', color: '#ffe0b4', inner: '#8b5c49', size: 11 })
  headerButton(c, view.info, '玩法', header)
  headerButton(c, view.pause, state.status === 'fighting' ? '暂停' : '记录', header)
  const { nameSize, renameX, randomName } = nameControls(view, state.player.name)
  text(c, state.player.name, view.name.x, top + 61, nameSize, colors.ink, 'left', true)
  if (state.status === 'prepare') {
    text(c, '· 改名', renameX, top + 62, 11, colors.muted)
    const r = randomName
    box(c, r, '#273d55', 8, '#657c90')
    box(c, { x: r.x + 8, y: r.y + 8, w: 18, h: 18 }, null, 3, colors.gold)
    for (const [dx, dy] of [[12, 12], [22, 12], [17, 17], [12, 22], [22, 22]]) {
      c.beginPath(); c.arc(r.x + dx, r.y + dy, 1.3, 0, Math.PI * 2); c.fillStyle = colors.gold; c.fill()
    }
  }
  if (state.status === 'prepare' && state.round === 1) headerButton(c, view.reroll, '重掷属性', {
    ...header, fill: gradient(c, view.reroll.x, view.reroll.y, view.reroll.w, view.reroll.h, ['#f1ce88', '#d9a558']),
    stroke: '#ffe1a4', color: '#253043', inner: 'rgba(255,246,215,.6)', size: 12
  })
  else text(c, `${state.streak} 连胜`, width - 20, top + 62, 13, colors.gold, 'right')
  drawArena(c, view, state, feedback, now, art)
  const prepare = state.status === 'prepare'
  drawAttributes(c, view.attributes, state, feedback, now)
  text(c, prepare && state.round === 1 ? '武器 · 首战可选择' : '武器 · 本轮已锁定', arena.x, view.weapons[0].y - 12, 12, colors.muted)
  const selectedSkill = state.combatVersion === 2 ? skill(state.skill) : weaponSkill(state.weapon)
  const skillProgress = state.combatVersion >= 5 ? state.player.combat.momentum >= momentum.max ? '待发' : Math.floor(state.player.combat.momentum / 100) : `${state.player.combat.attacks % 3}/3`
  const skillLabel = prepare ? '武器技 ›' : `${selectedSkill.short} · ${skillProgress} ›`
  const skillReady = !prepare && state.combatVersion >= 5 && state.player.combat.momentum >= momentum.max
  headerButton(c, view.tactics, tactical ? skillLabel : '武器技 ›', { ...header,
    fill: skillReady ? '#52412b' : '#354758', color: skillReady ? '#ffe3a2' : colors.gold,
    stroke: skillReady ? colors.gold : '#a78b58', size: 11 })
  weapons.forEach((weapon, i) => control(c, view.weapons[i], weapon.name,
    `${weaponSkill(weapon.id).short} · ${tactical && counters(weapon.id, state.enemy.weapon) ? '克制' : '自动'}`,
    state.weapon === weapon.id, prepare && state.round === 1))
  text(c, '战斗姿态 · 每战可调整', arena.x, view.stances[0].y - 12, 12, colors.muted)
  stances.forEach((stance, i) => control(c, view.stances[i], stance.name, stance.note, state.stance === stance.id, prepare))
  if (view.log.h >= 20) {
    const r = view.log
    box(c, r, '#142337', 9, '#38516d')
    if (prepare) {
      text(c, stances.find(item => item.id === state.stance).description, r.x + 12, r.y + Math.min(16, r.h / 2), 12, colors.muted)
      if (tactical && r.h >= 70) {
        const match = relation(state.weapon, state.enemy.weapon)
        const enemyWeapon = weapons.find(item => item.id === state.enemy.weapon).name
        text(c, `对手持${enemyWeapon} · ${match.name}`, r.x + 12, r.y + 39, 12, match.disadvantaged ? colors.red : colors.blue)
        text(c, `${selectedSkill.name} · 武势满100自动触发`, r.x + 12, r.y + 59, 11, colors.gold)
      }
    } else {
      const end = Math.max(0, state.logs.length - logOffset)
      const logs = state.logs.slice(Math.max(0, end - view.logPageSize), end)
      if (view.logHeaderHeight) {
        text(c, reviewing ? '战报 · 已暂停' : '交战战报', r.x + 12, r.y + 13, 11, colors.gold)
        text(c, '下滑看更早记录', r.x + r.w - 12, r.y + 13, 10, colors.muted, 'right')
      }
      if (!logs.length) text(c, '尚未出招', r.x + 12, r.y + view.logHeaderHeight + 12, 14, colors.muted)
      logs.forEach((event, index) => {
        text(c, logText(event),
          r.x + 12, r.y + view.logHeaderHeight + 12 + index * view.logLineHeight, 14, event.skill ? colors.gold : event.side === 'player' ? colors.blue : colors.red)
      })
      if (view.logFooterHeight) text(c, `最近 ${state.logs.length} 次出招 · ${Math.max(0, end - logs.length) + (logs.length ? 1 : 0)}–${end}`,
        r.x + r.w / 2, r.y + r.h - 12, 10, colors.muted, 'center')
    }
  }
  actionButton(c, view.action, prepare ? '开始交战  →' : state.status === 'fighting' ? reviewing ? '继续交战' : '暂停交战' : '查看战斗结果')
  if (saveFailed) text(c, '存档失败，当前进度仅保留在本次会话', width / 2, height - view.bottom - 4, 10, colors.red, 'center')
  if (modal) drawModal(c, view, state, modal, best)
}
function drawModal(c, view, state, modal, best) {
  c.fillStyle = 'rgba(5,12,22,.78)'; c.fillRect(0, 0, view.width, view.height)
  if (modal === 'growth') { drawGrowth(c, view, state); return }
  const guide = ['help', 'weapons', 'relations', 'momentum'].includes(modal)
  const r = guide ? view.guideDialog : view.dialog; const x = r.x + r.w / 2
  box(c, r, '#1c2d43', 16, '#8b846a')
  const result = modal === 'result'; const won = state.status === 'won'
  const title = guide ? '玩法指南' : modal === 'pause' ? '交战已暂停' : modal === 'records' ? '本机连胜纪录' : modal === 'reset' ? '重新开始挑战？' : won ? '此战告捷' : '此战落败'
  text(c, title, x, r.y + 32, 25, colors.gold, 'center', true)
  if (guide) {
    drawGuide(c, view, state, modal)
  } else if (modal === 'records') {
    text(c, '仅记录本机成绩 · 同一挑战保留最高连胜', x, r.y + 66, 11, colors.muted, 'center')
    if (!best.length) text(c, '赢得第一战，留下你的纪录。', x, r.y + 128, 14, colors.ink, 'center')
    best.slice(0, 6).forEach((record, i) => {
      text(c, `${i + 1}. ${record.name}`, r.x + 22, r.y + 105 + i * 30, 14, colors.ink)
      text(c, `${record.streak} 连胜`, r.x + r.w - 22, r.y + 105 + i * 30, 14, colors.gold, 'right')
    })
  } else if (modal === 'reset') {
    ['从第一战开始，重置当前连胜与属性。', '可以重新选择武器，历史纪录会保留。'].forEach((value, i) => text(c, value, x, r.y + 128 + i * 30, 14, colors.ink, 'center'))
  } else {
    text(c, result ? `${state.streak} 连胜 · ${ (state.elapsedMs / 1000).toFixed(1)} 秒交战` : state.status === 'prepare' ? '敌方属性将在开战后揭示' : '暂停期间不会攻击或消耗生命', x, r.y + 64, 12, colors.muted, 'center')
    const panels = attributePanels({ x: r.x + 14, y: r.y + 90, w: r.w - 28, h: 162 })
    if (result) {
      drawReport(c, panels, state)
      const match = relation(state.weapon, state.enemy.weapon)
      const own = weapons.find(item => item.id === state.weapon).name
      const enemy = weapons.find(item => item.id === state.enemy.weapon).name
      text(c, `${own} ${match.symbol} ${enemy} · ${match.name}`, x, r.y + 268, 12, match.disadvantaged ? colors.red : colors.gold, 'center')
      text(c, state.report && !state.report.complete ? '旧存档：仅统计保留的战报' : won ? state.round < 100 ? '下一战前选择强化 · 满血迎战' : '百战完成 · 连胜纪录已保存' : '换人再战将重置本轮强化', x, r.y + 289, 11, colors.muted, 'center')
    } else {
      drawAttributes(c, panels, state)
      text(c, '自动交战 · 技能随武器自动触发', x, r.y + 268, 12, colors.muted, 'center')
      text(c, '玩法中可查看武器技能与克制图谱', x, r.y + 289, 11, colors.muted, 'center')
    }
  }
  actionButton(c, guide ? view.guideSecondary : view.modalSecondary, result ? '查看战报' : modal === 'reset' ? '取消' : '关闭', false)
  actionButton(c, guide ? view.guidePrimary : view.modalPrimary, result ? won ? state.round < 100 ? '下一战' : '再来一局' : '换人再战' : modal === 'reset' ? '重新开始' : modal === 'records' ? '新挑战' : state.status === 'fighting' ? '继续交战' : '知道了')
}
function drawReport(c, panels, state) {
  const totals = state.report || report.fromLogs(state.logs)
  for (const side of ['player', 'enemy']) {
    const r = panels[side]; const accent = side === 'player' ? colors.blue : colors.red
    box(c, r, side === 'player' ? '#20394c' : '#382d37', 10, accent)
    const name = state[side].name
    text(c, name, r.x + r.w / 2, r.y + 19, Math.min(14, (r.w - 16) / name.length), accent, 'center', true)
    text(c, side === 'player' ? '我方战绩' : '敌方战绩', r.x + r.w / 2, r.y + 41, 11, colors.muted, 'center')
    ;[['总伤害', 'damage'], ['暴击', 'criticals'], ['闪避', 'dodges'], ['技能', 'skills']].forEach(([label, key], index) => {
      const y = r.y + 66 + index * 26
      text(c, label, r.x + 12, y, 12, colors.muted)
      text(c, `${totals[side][key]}${key === 'damage' ? '' : '次'}`, r.x + r.w - 12, y, 14, colors.ink, 'right', true)
    })
  }
}
function drawGrowth(c, view, state) {
  const r = view.growthDialog; const x = r.x + r.w / 2
  box(c, r, gradient(c, r.x, r.y, r.w, r.h, ['#24394e', '#16273b']), 16, colors.gold)
  text(c, '胜战修行', x, r.y + 30, 25, colors.gold, 'center', true)
  text(c, `${state.streak} 连胜 · 选择一项强化`, x, r.y + 58, 14, colors.ink, 'center')
  text(c, '仅本轮生效 · 武器固定 · 每五战迎强敌', x, r.y + 76, 11, colors.muted, 'center')
  upgradeChoices(state).forEach((item, index) => {
    const card = view.growthCards[index]
    const key = item.id === 'hp' ? 'maxHp' : item.id
    const before = state.player.stats[key]; const after = upgradePreview(state, item.id)[key]
    const format = value => item.id === 'spd' ? `${value.toFixed(2)}/s` : ['crit', 'dodge'].includes(item.id) ? `${value.toFixed(1)}%` : value
    box(c, card, gradient(c, card.x, card.y, card.w, card.h, ['#2e4357', '#203247']), 10, item.color)
    box(c, { x: card.x + 1, y: card.y + 16, w: 3, h: card.h - 32 }, item.color, 2)
    text(c, item.name, card.x + 14, card.y + 20, 18, item.color, 'left', true)
    const percent = ['crit', 'dodge'].includes(item.id)
    const bonus = item.id === 'spd' ? `基础攻速 +${item.amount * 100}%` : `${item.label} +${percent ? +(after - before).toFixed(1) : item.amount}${percent ? '%' : ''}`
    text(c, bonus, card.x + card.w - 14, card.y + 20, 13, colors.ink, 'right', true)
    text(c, `${item.label}  ${format(before)} → ${format(after)}`, card.x + 14, card.y + 43, 13, colors.ink)
    text(c, item.note, card.x + 14, card.y + 65, 11, colors.muted)
    text(c, '›', card.x + card.w - 14, card.y + 53, 24, item.color, 'right')
  })
  actionButton(c, view.growthHome, '游戏合集', false)
  actionButton(c, view.growthRestart, '重新开始', false)
}
function drawGuide(c, view, state, modal) {
  const r = view.guideDialog; const x = r.x + r.w / 2
  const tabs = ['help', 'weapons', 'relations', 'momentum']
  ;['基础玩法', '武器技能', '克制图谱', '武势机制'].forEach((label, i) => {
    const rect = view.guideTabs[i]; const selected = tabs[i] === modal
    box(c, rect, selected ? '#354758' : '#142337', 7, selected ? colors.gold : colors.line)
    text(c, label, rect.x + rect.w / 2, rect.y + 15, 12, selected ? colors.gold : colors.ink, 'center', true)
  })
  if (modal === 'weapons') {
    text(c, '双方武势满100，下次出招自动释放', x, r.y + 104, 12, colors.ink, 'center')
    weaponSkills.forEach((item, i) => {
      const selected = item.weapon === state.weapon
      const rect = { x: r.x + 12, y: r.y + 123 + i * 43, w: r.w - 24, h: 39 }
      box(c, rect, selected ? '#2b4053' : '#142337', 7, selected ? colors.gold : colors.line)
      text(c, `${weapons[i].name} · ${item.name}${selected ? ' · 当前' : ''}`, rect.x + 10, rect.y + 11, 13, selected ? colors.gold : colors.ink, 'left', true)
      text(c, item.description, rect.x + 10, rect.y + 28, 12, colors.muted)
    })
    text(c, '伤害与受击蓄势 · 暴击+6 · 闪避+8', x, r.y + 398, 11, colors.muted, 'center')
  } else if (modal === 'momentum') {
    text(c, '武势上限100，双方使用同一规则', x, r.y + 104, 12, colors.ink, 'center')
    const rows = [
      ['造成伤害', `每削减对方1%生命上限，+${momentum.dealt / 100}武势`],
      ['承受伤害', `每损失自身1%生命上限，+${momentum.taken / 100}武势`],
      ['造成暴击', `除伤害积攒外，额外+${momentum.critical / 100}武势`],
      ['成功闪避', `闪避者+${momentum.dodge / 100}武势，未命中者不积攒`]
    ]
    rows.forEach(([title, detail], i) => {
      const rect = { x: r.x + 12, y: r.y + 125 + i * 56, w: r.w - 24, h: 48 }
      box(c, rect, '#142337', 7, colors.line)
      text(c, title, rect.x + 10, rect.y + 14, 13, colors.gold, 'left', true)
      text(c, detail, rect.x + 10, rect.y + 34, 11, colors.ink)
    })
    text(c, '满值后下次出招释放，清空后重新积攒', x, r.y + 366, 12, colors.gold, 'center')
    text(c, '技能也可蓄势 · 每战清零 · 暂停保留', x, r.y + 395, 11, colors.muted, 'center')
  } else if (modal === 'relations') {
    text(c, '→ 专属克制：伤害 +18%', r.x + 14, r.y + 104, 12, colors.gold)
    text(c, '← 被克制：敌方伤害 +18%', r.x + 14, r.y + 125, 12, colors.red)
    text(c, '= 势均力敌：双方无克制加成', r.x + 14, r.y + 146, 12, colors.blue)
    const left = r.x + 12; const labelW = 48; const cellW = (r.w - 24 - labelW) / 6
    text(c, '我 / 敌', left + labelW / 2, r.y + 171, 10, colors.muted, 'center')
    weapons.forEach((weapon, i) => text(c, weapon.name, left + labelW + cellW * (i + .5), r.y + 171,
      Math.min(12, Math.floor((cellW - 4) / 3)), weapon.id === state.enemy.weapon ? colors.gold : colors.ink, 'center'))
    weapons.forEach((weapon, row) => {
      const y = r.y + 188 + row * 31
      box(c, { x: left, y, w: r.w - 24, h: 27 }, weapon.id === state.weapon ? '#2b4053' : '#142337', 4)
      text(c, weapon.name, left + labelW / 2, y + 13, 12, weapon.id === state.weapon ? colors.gold : colors.ink, 'center')
      weapons.forEach((enemy, col) => {
        const match = relation(weapon.id, enemy.id)
        const cellX = left + labelW + cellW * col
        if (weapon.id === state.weapon && enemy.id === state.enemy.weapon) box(c, { x: cellX + 3, y: y + 2, w: cellW - 6, h: 23 }, null, 4, colors.gold)
        text(c, match.symbol, cellX + cellW / 2, y + 13, 17, match.counter ? colors.gold : match.disadvantaged ? colors.red : colors.blue, 'center', true)
      })
    })
    text(c, '每种武器克一种、被一种克制', x, r.y + 391, 12, colors.muted, 'center')
  } else {
    const lines = ['① 首战选武器，每战可调整战斗姿态。', '② 武势满100自动释放武器技能。', '③ 胜利后三选一强化，仅本轮生效。', '④ 对手逐步变强，每五战迎接强敌。']
    lines.forEach((value, i) => text(c, value, r.x + 14, r.y + 108 + i * 24, 12, colors.ink))
    drawAttributes(c, attributePanels({ x: r.x + 12, y: r.y + 202, w: r.w - 24, h: 146 }), state)
    const match = relation(state.weapon, state.enemy.weapon)
    text(c, `${match.symbol} 当前对局：${match.name}`, x, r.y + 369, 12, match.disadvantaged ? colors.red : colors.gold, 'center')
    text(c, state.status === 'prepare' ? '敌方数值在开战后揭示' : '阅读指南期间，战斗暂停', x, r.y + 394, 12, colors.muted, 'center')
  }
  if (state.combatVersion < 5) {
    // Old fights resume unchanged, but the guide describes the next battle's rules.
    text(c, '旧战斗保留原规则；下一战启用武势', x, r.y + 15, 10, colors.muted, 'center')
  }
}
module.exports = { draw, drawCombatFrame, drawCover }
