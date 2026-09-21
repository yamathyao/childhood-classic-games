const { palette: P, background, text, box, button, selectionButton, contains } = require('../../common/canvas.js')
const { levels, getLevel, defaultLevel } = require('../klotski/levels.js')
const { drawBoard, drawLevelPicker } = require('../klotski/renderer.js')
const { loadPortraits } = require('../klotski/art.js')
const { create } = require('../klotski/rules.js')

function start({ context: c, screen: initialScreen, openGame }) {
  let screen = initialScreen
  let active = true
  let pressed = null
  let startButton
  let levelButton
  let pickerOpen = false
  let pickerLayout
  let pickerPage = 0
  let selectedId = defaultLevel.id
  try { selectedId = getLevel(wx.getStorageSync('klotski.currentLevel')).id } catch (error) {}
  let selectedLevel = getLevel(selectedId)
  let selectedRules = create(selectedLevel)
  let saved = null
  function loadSelected() {
    selectedLevel = getLevel(selectedId)
    selectedRules = create(selectedLevel)
    try { saved = selectedRules.restore(wx.getStorageSync(`klotski.${selectedId}.v1`)) } catch (error) { saved = null }
  }
  loadSelected()
  const art = loadPortraits(repaint)

  function repaint() {
    if (!active) return
    const { width, height, top, bottom } = screen
    background(c, width, height)
    text(c, '童 年 游 戏 馆', 25, top + 25, 12, P.wine)
    text(c, '重拾方寸间的乐趣', 24, top + 69, 27, P.ink, 'left', true)
    text(c, '熟悉的规则，值得再玩一次。', 25, top + 103, 13, P.muted)
    const card = { x: 22, y: top + 135, w: width - 44, h: Math.min(460, height - top - bottom - 175) }
    box(c, card, 'rgba(255,250,237,.65)', 16, '#d0bea0')
    text(c, '01  /  经典益智', card.x + 18, card.y + 25, 11, P.muted)
    text(c, '华容道', card.x + 18, card.y + 60, 27, P.ink, 'left', true)
    levelButton = { x: card.x + card.w - 132, y: card.y + 39, w: 114, h: 38 }
    selectionButton(c, levelButton, '选择对局')
    const cell = Math.min(46, (card.h - 176) / 5)
    const board = { x: (width - cell * 4) / 2, y: card.y + 99, w: cell * 4, h: cell * 5 }
    drawBoard(c, board, cell, selectedLevel.pieces, null, null, art.portraits)
    startButton = { x: card.x + 18, y: card.y + card.h - 60, w: card.w - 36, h: 42 }
    const hasProgress = saved && saved.steps > 0 && !selectedRules.isWon(saved.pieces)
    button(c, startButton, hasProgress ? `继续解局 · ${saved.steps} 步` : '进入棋局  →', true)
    text(c, '更多童年游戏，陆续入馆', width / 2, card.y + card.h + 25, 11, P.muted, 'center')
    if (pickerOpen) {
      pickerLayout = {
        width, height, picker: { x: 16, y: top + 116, w: width - 32, h: Math.min(height - top - bottom - 132, 430) },
        levelRows: [], levelPage: pickerPage,
        levelClose: { x: width - 16 - 54, y: top + 116 + 12, w: 38, h: 34 }
      }
      drawLevelPicker(c, pickerLayout, levels, selectedId)
    }
  }

  function onStart(e) {
    if (!active || pressed) return
    const t = e.changedTouches[0] || e.touches[0]
    if (pickerOpen) {
      const row = pickerLayout && pickerLayout.levelRows.find(item => contains(item, t))
      if (contains(pickerLayout && pickerLayout.levelClose, t)) pressed = { ...t, action: 'close' }
      else if (contains(pickerLayout && pickerLayout.levelPrev, t)) pressed = { ...t, action: 'prev' }
      else if (contains(pickerLayout && pickerLayout.levelNext, t)) pressed = { ...t, action: 'next' }
      else if (row) pressed = { ...t, action: row.id }
      return
    }
    if (contains(levelButton, t)) pressed = { ...t, action: 'levels' }
    else if (contains(startButton, t)) pressed = { ...t, action: 'start' }
  }
  function onEnd(e) {
    if (!active || !pressed) return
    const t = e.changedTouches.find(touch => touch.identifier === pressed.identifier)
    if (!t) return
    const tap = Math.hypot(t.clientX - pressed.clientX, t.clientY - pressed.clientY) < 16
    const action = pressed.action
    pressed = null
    if (!tap) return
    if (action === 'start') openGame('klotski', selectedId)
    else if (action === 'levels') {
      pickerPage = Math.floor(Math.max(0, levels.findIndex(level => level.id === selectedId)) / 8)
      pickerOpen = true; repaint()
    }
    else if (action === 'close') { pickerOpen = false; repaint() }
    else if (action === 'prev') { pickerPage = Math.max(0, pickerPage - 1); repaint() }
    else if (action === 'next') { pickerPage = Math.min(Math.ceil(levels.length / 8) - 1, pickerPage + 1); repaint() }
    else if (levels.some(level => level.id === action)) {
      selectedId = action
      try { wx.setStorageSync('klotski.currentLevel', selectedId) } catch (error) {}
      loadSelected(); pickerOpen = false; repaint()
    }
  }
  function cancel() { pressed = null }
  wx.onTouchStart(onStart)
  wx.onTouchEnd(onEnd)
  wx.onTouchCancel(cancel)
  repaint()
  return {
    resize(nextScreen) { cancel(); screen = nextScreen; repaint() },
    hide: cancel,
    show: repaint,
    dispose() {
      active = false
      cancel()
      art.dispose()
      wx.offTouchStart(onStart)
      wx.offTouchEnd(onEnd)
      wx.offTouchCancel(cancel)
    }
  }
}
module.exports = { start }
