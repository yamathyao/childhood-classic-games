const { resize } = require('./common/screen.js')
const home = require('./games/index/game.js')
const klotski = require('./games/klotski/game.js')
const sokoban = require('./games/sokoban/game.js')
const tetris = require('./games/tetris/game.js')

const canvas = wx.createCanvas()
const context = canvas.getContext('2d')
let screen = resize(canvas, context)
let scene = null

function showScene(module, options = {}) {
  if (scene) scene.dispose()
  scene = null
  try {
    scene = module.start({ canvas, context, screen, ...options })
  } catch (error) {
    console.error('[childhood-classic-games] scene failed', error)
    context.fillStyle = '#efe6d4'
    context.fillRect(0, 0, screen.width, screen.height)
    context.fillStyle = '#843d32'
    context.font = '16px sans-serif'
    context.fillText('加载失败，请重新打开游戏', 24, screen.top + 80)
  }
}

function goHome() {
  showScene(home, { openGame: (id, selectedLevel) => {
    if (id === 'klotski') showScene(klotski, { goHome, levelId: selectedLevel })
    if (id === 'sokoban') showScene(sokoban, { goHome, levelId: selectedLevel })
    if (id === 'tetris') showScene(tetris, { goHome })
  } })
}

if (wx.onWindowResize) wx.onWindowResize(() => {
  screen = resize(canvas, context)
  if (scene) scene.resize(screen)
})
if (wx.onHide) wx.onHide(() => { if (scene) scene.hide() })
if (wx.onShow) wx.onShow(() => { if (scene) scene.show() })
goHome()
