const { box, text, gradient, path } = require('../../common/canvas.js')
const { cameraFor } = require('./layout.js')

const colors = {
  A: ['#7ee1db', '#258b96', '#bdf6e3'], B: ['#ffbe91', '#c4614e', '#ffe2b2'],
  C: ['#769fe8', '#3b60ad', '#cedfff'], D: ['#ffdf86', '#b68c38', '#fff4c4']
}

function control(context, rect, label, primary = false) {
  box(context, { ...rect, y: rect.y + 3 }, '#0a1821', 10)
  box(context, rect, gradient(context, rect.x, rect.y, 0, rect.h, primary ? ['#ffdc93', '#d9a654'] : ['#324c60', '#223b4e']), 10, primary ? '#ffe7b4' : '#628399')
  text(context, label, rect.x + rect.w / 2, rect.y + rect.h / 2, rect.h > 44 ? 18 : 12, primary ? '#352a1d' : '#edf5f0', 'center')
}

function facet(context, rect, points, fill, stroke) {
  context.beginPath()
  points.forEach(([horizontal, vertical], index) => {
    const method = index ? 'lineTo' : 'moveTo'
    context[method](rect.x + rect.w * horizontal, rect.y + rect.h * vertical)
  })
  if (fill) {
    context.closePath(); context.fillStyle = fill; context.fill()
  }
  if (stroke) {
    context.strokeStyle = stroke; context.lineWidth = Math.max(.6, rect.w * .025); context.stroke()
  }
}

function drawBlock(context, rect, color, danger = false, damage = 0) {
  if (color === 'X') {
    box(context, rect, gradient(context, rect.x, rect.y, rect.w, rect.h, ['#ae8260', '#684737']), 3, danger ? '#ffe7a3' : '#c8a182')
    facet(context, rect, [[.08, .2], [.3, .07], [.82, .1], [.68, .27], [.25, .34]], '#c69c75')
    facet(context, rect, [[.08, .28], [.26, .4], [.18, .68], [.08, .78]], '#926448')
    facet(context, rect, [[.75, .31], [.93, .18], [.92, .78], [.73, .68], [.65, .48]], '#5f4436')
    facet(context, rect, [[.25, .91], [.4, .69], [.71, .67], [.87, .9]], '#79533b')
    facet(context, rect, [[.1, .55], [.24, .49], [.32, .55]], null, '#dab28a')
    facet(context, rect, [[.69, .63], [.83, .55], [.92, .59]], null, '#b88b65')
    if (damage > 0) facet(context, rect, [[.31, .08], [.38, .21], [.26, .36], [.32, .53]], null, '#3e2d27')
    if (damage > 1) facet(context, rect, [[.91, .36], [.77, .44], [.82, .61], [.7, .72]], null, '#3e2d27')
    if (damage > 2) facet(context, rect, [[.13, .86], [.25, .7], [.21, .59], [.32, .53]], null, '#3e2d27')
    if (damage > 3) facet(context, rect, [[.67, .09], [.59, .26], [.71, .34], [.77, .44]], null, '#3e2d27')
    text(context, danger ? '!' : '×', rect.x + rect.w / 2, rect.y + rect.h * .4, Math.max(12, rect.w * .65), '#ffe2c1', 'center')
    for (let index = 0; index < 5; index++) {
      context.fillStyle = index < damage ? '#49322b' : '#e6b883'
      context.fillRect(rect.x + rect.w * .2 + index * rect.w * .13, rect.y + rect.h * .78, Math.max(1, rect.w * .07), 2)
    }
    return
  }
  const tones = colors[color]
  if (!tones) {
    box(context, rect, gradient(context, rect.x, rect.y, rect.w, rect.h, ['#414e58', '#29353f']), 2, '#53616a')
    facet(context, rect, [[.08, .17], [.37, .08], [.64, .12], [.46, .38], [.12, .43]], '#52616a')
    facet(context, rect, [[.58, .35], [.9, .22], [.92, .57], [.77, .68], [.48, .51]], '#394751')
    facet(context, rect, [[.14, .7], [.43, .58], [.73, .74], [.86, .91], [.25, .88]], '#35454e')
    facet(context, rect, [[.66, .08], [.47, .4], [.75, .57], [.9, .53]], null, '#1f2b33')
    facet(context, rect, [[.47, .4], [.3, .6], [.1, .64]], null, '#23313a')
    facet(context, rect, [[.16, .76], [.4, .68], [.54, .74]], null, '#5a6971')
    return
  }
  box(context, { ...rect, y: rect.y + 1 }, tones[1], 4)
  box(context, { ...rect, h: rect.h - 2 }, gradient(context, rect.x, rect.y, rect.w, rect.h, [tones[0], tones[1]]), 4, danger ? '#fff0a5' : tones[0])
  facet(context, rect, [[.14, .12], [.83, .12], [.67, .27], [.28, .31], [.12, .48]], 'rgba(255,255,255,.22)')
  facet(context, rect, [[.87, .2], [.87, .78], [.66, .86], [.72, .48]], 'rgba(8,35,50,.18)')
  facet(context, rect, [[.14, .79], [.35, .7], [.65, .83], [.81, .85], [.23, .87]], 'rgba(8,35,50,.12)')
  facet(context, rect, [[.13, .51], [.13, .23], [.24, .13], [.78, .13]], null, tones[2])
  facet(context, rect, [[.3, .42], [.37, .34], [.44, .42], [.37, .52]], 'rgba(255,255,255,.28)')
  facet(context, rect, [[.55, .3], [.62, .27], [.69, .32]], null, 'rgba(255,255,255,.3)')
  const marks = 'ABCD'.indexOf(color) + 1
  context.fillStyle = tones[2]
  for (let index = 0; index < marks; index++) context.fillRect(rect.x + (rect.w - (marks * 3 - 1)) / 2 + index * 3, rect.y + rect.h * .64, 2, 2)
  if (danger) text(context, '!', rect.x + rect.w / 2, rect.y + rect.h * .37, Math.max(12, rect.h * .52), '#fff7cf', 'center')
}

function drawCapsule(context, rect) {
  box(context, { x: rect.x + rect.w * .18, y: rect.y + 2, w: rect.w * .64, h: rect.h - 4 }, '#b6f6df', rect.w * .24, '#edfff5')
  box(context, { x: rect.x + rect.w * .23, y: rect.y + rect.h * .22, w: rect.w * .54, h: rect.h * .54 }, '#237b79', 3)
  text(context, 'O₂', rect.x + rect.w / 2, rect.y + rect.h / 2, Math.max(9, rect.w * .36), '#ffffff', 'center')
}

function drawCharacter(context, rect) {
  const center = rect.x + rect.w / 2
  box(context, { x: rect.x + rect.w * .25, y: rect.y + rect.h * .5, w: rect.w * .5, h: rect.h * .32 }, '#cf7851', 4, '#ffe0a5')
  box(context, { x: rect.x + rect.w * .17, y: rect.y + rect.h * .06, w: rect.w * .66, h: rect.h * .61 }, '#ffd389', rect.w * .28, '#ffecbc')
  box(context, { x: rect.x + rect.w * .25, y: rect.y + rect.h * .27, w: rect.w * .5, h: rect.h * .25 }, '#173947', 4)
  context.fillStyle = '#e4fff3'
  context.fillRect(center - rect.w * .12, rect.y + rect.h * .34, 2, 3)
  context.fillRect(center + rect.w * .07, rect.y + rect.h * .34, 2, 3)
  box(context, { x: center - rect.w * .08, y: rect.y + rect.h * .02, w: rect.w * .16, h: rect.h * .17 }, '#fffde3', 2)
  context.beginPath(); context.moveTo(center - rect.w * .18, rect.y + rect.h * .78); context.lineTo(center + rect.w * .18, rect.y + rect.h * .78); context.lineTo(center, rect.y + rect.h); context.closePath()
  context.fillStyle = '#c5dbe2'; context.fill()
}

function drawCover(context, rect) {
  const cell = Math.min(rect.w / 8, rect.h / 5)
  const board = { x: rect.x + (rect.w - cell * 8) / 2, y: rect.y + (rect.h - cell * 5) / 2, w: cell * 8, h: cell * 5 }
  box(context, board, '#142937', 8, '#627f87')
  const pattern = ['#..P...#', '#AA.BBO#', '#AB.CCC#', '#DD.CXX#', '#DDBBXX#']
  pattern.forEach((row, rowIndex) => row.split('').forEach((color, column) => {
    const tile = { x: board.x + column * cell + 1, y: board.y + rowIndex * cell + 1, w: cell - 2, h: cell - 2 }
    if (color === 'P') drawCharacter(context, tile)
    else if (color === 'O') drawCapsule(context, tile)
    else if (color !== '.') drawBlock(context, tile, color)
  }))
}

function modalButtons(view, modal, hasNext, status) {
  const panel = view.dialog
  const names = modal === 'result' ? status === 'respawn' ? ['revive', 'retry', 'exit'] : ['view', 'retry', ...(hasNext ? ['next'] : ['exit'])] : modal === 'reset' ? ['resume', 'retry'] : ['resume', 'exit']
  const gap = 8
  const width = (panel.w - 28 - gap * (names.length - 1)) / names.length
  return names.map((action, index) => ({ action, x: panel.x + 14 + index * (width + gap), y: panel.y + panel.h - 62, w: width, h: 44 }))
}

function drawModal(context, view, state, modal, hasNext) {
  context.fillStyle = 'rgba(5,16,24,.76)'; context.fillRect(0, 0, view.width, view.height)
  const panel = view.dialog
  box(context, panel, '#203846', 18, '#b2af83')
  const title = modal === 'reset' ? '重新开始？' : modal === 'pause' ? '休息一下' : state.status === 'won' ? '抵达目标矿层' : state.reason === 'oxygen' ? '氧气耗尽' : '被坠落方块击中'
  text(context, title, view.width / 2, panel.y + 37, 22, '#ffdf9c', 'center', true)
  const lines = modal === 'reset' ? ['本关进度将从头开始。', '本机最佳成绩会保留。'] : modal === 'pause' ?
    ['长按方向连续钻；上滑可钻头顶方块。', '悬空块会自动落下，别停在落点。', '落块连接满 4 格会消除并引发连锁。', '棕色 × 要钻 5 次，打碎扣 20 氧气。', 'O₂ 补 20 氧气；暂停时停止耗氧。'] :
    [`深度 ${state.depth} 米 · 得分 ${state.score}`, `剩余生命 ${state.lives} · 剩余氧气 ${state.oxygen}`, state.status === 'won' ? '抵达井底，挑战完成。' : state.status === 'respawn' ? '继续后获得短暂保护，请尽快离开落点。' : '观察落块，给自己留一条侧向退路。']
  lines.forEach((line, index) => text(context, line, view.width / 2, panel.y + 84 + index * 27, 13, '#e1eee9', 'center'))
  const labels = { view: '查看矿井', retry: '重新挑战', next: '下一关', exit: '返回合集', revive: '继续挑战', resume: modal === 'reset' ? '取消' : '继续探索' }
  modalButtons(view, modal, hasNext, state.status).forEach(rect => control(context, rect, labels[rect.action], ['next', 'resume', 'revive'].includes(rect.action)))
}

function draw({ context, view, level, state, modal, hasNext, motion, progress = 1, saveFailed, best }) {
  context.clearRect(0, 0, view.width, view.height)
  context.fillStyle = gradient(context, 0, 0, 0, view.height, ['#243c49', '#101f2b'])
  context.fillRect(0, 0, view.width, view.height)
  control(context, view.back, '‹ 游戏合集')
  control(context, view.reset, '重开')
  control(context, view.pause, state.status === 'playing' ? '暂停' : '成绩')
  text(context, level.name, 20, view.top + 60, 22, '#ffdf9c', 'left', true)
  text(context, `♥ ${state.lives}`, view.width * .46, view.top + 60, 12, '#ffb8a2', 'center')
  text(context, `${state.depth} / ${level.targetDepth} 米`, view.width - 20, view.top + 60, 13, '#e0ece5', 'right')
  text(context, `氧气  ${state.oxygen} / ${state.maxOxygen}`, 20, view.top + 96, 13, state.oxygen <= state.maxOxygen * .25 ? '#ffac93' : '#d3eee1')
  text(context, `${state.score} 分 · 最佳 ${best}`, view.width - 20, view.top + 96, 11, '#bdcfcf', 'right')
  box(context, view.oxygen, '#0c202a', 6, '#4e6971')
  if (state.oxygen > 0) box(context, { ...view.oxygen, w: view.oxygen.w * state.oxygen / state.maxOxygen }, state.oxygen <= state.maxOxygen * .25 ? '#ed9170' : '#84d9be', 6)
  const ease = 1 - Math.pow(1 - progress, 3)
  const targetCamera = cameraFor(state, view)
  const camera = motion ? motion.camera + (targetCamera - motion.camera) * ease : targetCamera
  const tileAt = position => ({ x: view.board.x + (position % view.columns) * view.cell + 1, y: view.board.y + (Math.floor(position / view.columns) - camera) * view.cell + 1, w: view.cell - 2, h: view.cell - 2 })
  box(context, { x: view.board.x - 4, y: view.board.y - 4, w: view.board.w + 8, h: view.board.h + 8 }, '#0d1b25', 8, '#6d878c')
  context.save(); path(context, view.board.x, view.board.y, view.board.w, view.board.h, 3); context.clip()
  const falls = motion && progress < 1 ? motion.events.filter(event => event.type === 'fall') : []
  const fallingTargets = new Set(falls.map(event => event.to))
  const danger = new Set(state.danger)
  const first = Math.max(0, Math.floor(camera) * view.columns)
  const last = Math.min(state.grid.length, (Math.ceil(camera) + view.visibleRows + 1) * view.columns)
  for (let position = first; position < last; position++) {
    const color = state.grid[position]
    const tile = tileAt(position)
    if (color === '.' || fallingTargets.has(position)) {
      context.fillStyle = '#203240'; context.fillRect(tile.x + tile.w / 2, tile.y + tile.h / 2, 1, 1)
    } else if (color === 'O') drawCapsule(context, tile)
    else drawBlock(context, tile, color, danger.has(position), state.damage[position])
  }
  falls.forEach(event => {
    const source = tileAt(event.from); const target = tileAt(event.to)
    const tile = { ...target, y: source.y + (target.y - source.y) * ease }
    if (event.color === 'O') drawCapsule(context, tile)
    else drawBlock(context, tile, event.color)
  })
  if (motion && progress < 1) {
    context.save(); context.globalAlpha = (1 - progress) * .65
    motion.events.filter(event => event.type === 'clear').forEach(event => event.cells.forEach(position => {
      const tile = tileAt(position); const inset = progress * tile.w * .45
      drawBlock(context, { x: tile.x + inset, y: tile.y + inset, w: tile.w - inset * 2, h: tile.h - inset * 2 }, event.color)
    }))
    context.restore()
  }
  const player = tileAt(state.player)
  if (motion) {
    const source = { x: view.board.x + motion.playerX * view.cell + 1, y: view.board.y + (motion.playerY - camera) * view.cell + 1 }
    player.x = source.x + (player.x - source.x) * ease
    player.y = source.y + (player.y - source.y) * ease
  }
  drawCharacter(context, player)
  context.restore()
  const hasDanger = state.danger.some(position => position >= first && position < last && state.grid[position] !== 'O')
  const hint = saveFailed ? '存档未保存，请检查本机存储空间' : state.status !== 'playing' ? '本次挑战结束 · 点击右上角查看结果' : !state.started ? '首次操作开始 · 长按方向可连续钻地' : hasDanger ? '! 方块即将自动坠落，及时避让' : state.combo > 1 ? `${state.combo} 连锁！继续寻找补给` : `第 ${Math.min(Math.floor(state.depth / 100) + 1, level.targetDepth / 100)} 段矿层 · 氧气持续消耗`
  text(context, hint, view.width / 2, view.board.y + view.board.h + 17, 11, hasDanger || saveFailed ? '#ffd69a' : '#b4cbc9', 'center')
  control(context, view.pad.left, '←')
  control(context, view.pad.down, '↓  钻地', true)
  control(context, view.pad.right, '→')
  control(context, view.pad.up, '↑  向上钻')
  if (modal && progress >= 1) drawModal(context, view, state, modal, hasNext)
}

module.exports = { draw, drawCover, drawBlock, drawCharacter, drawCapsule, modalButtons }
