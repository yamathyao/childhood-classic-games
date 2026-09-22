const { palette: P, background, text, box, button, selectionButton, contains } = require('../../common/canvas.js')
const { levels, getLevel, defaultLevel } = require('../klotski/levels.js')
const { drawBoard, drawLevelPicker } = require('../klotski/renderer.js')
const { loadPortraits } = require('../klotski/art.js')
const { create } = require('../klotski/rules.js')
const { levels: sokobanLevels, getLevel: getSokobanLevel, defaultLevel: defaultSokobanLevel } = require('../sokoban/levels.js')
const { create: createSokoban } = require('../sokoban/rules.js')
const { drawGoal, drawCrate, drawMover, drawVoid, drawWall, drawFloor } = require('../sokoban/renderer.js')
const { drawCover: drawTetrisCover } = require('../tetris/renderer.js')

function drawSokobanPreview(c, rect, level) {
  const rules = createSokoban(level)
  const state = rules.initialState()
  const cell = Math.min(rect.w / rules.board.width, rect.h / rules.board.height)
  const board = { x: rect.x + (rect.w - cell * rules.board.width) / 2, y: rect.y, w: cell * rules.board.width, h: cell * rules.board.height }
  box(c, { x: board.x - 6, y: board.y - 6, w: board.w + 12, h: board.h + 12 }, '#aaa36c', 8, '#5c5e3d')
  box(c, { x: board.x - 2, y: board.y - 2, w: board.w + 4, h: board.h + 4 }, null, 5, 'rgba(255,255,220,.4)')
  for (let y = 0; y < rules.board.height; y++) for (let x = 0; x < rules.board.width; x++) {
    const position = y * rules.board.width + x
    const tile = { x: board.x + x * cell + 1, y: board.y + y * cell + 1, w: cell - 2, h: cell - 2 }
    if (rules.board.walls.has(position)) drawWall(c, tile, x, y)
    else if (rules.board.voids && rules.board.voids.has(position)) drawVoid(c, tile)
    else drawFloor(c, tile, x, y)
    if (rules.board.goals.has(position)) drawGoal(c, { board, cell }, x, y)
  }
  state.boxes.forEach((position, index) => {
    const x = position % rules.board.width; const y = Math.floor(position / rules.board.width)
    const crateRect = { x: board.x + (x + .09) * cell, y: board.y + (y + .09) * cell, w: cell * .82, h: cell * .82 }
    drawCrate(c, crateRect, rules.isMatched(state, index), cell, index)
  })
  const px = state.player % rules.board.width; const py = Math.floor(state.player / rules.board.width)
  drawMover(c, board.x + (px + .5) * cell, board.y + (py + .5) * cell, cell)
}

function homeCardLayout(screen, scroll = 0) {
  const { width, height, top, bottom } = screen
  const cardHeight = Math.min(260, Math.max(170, Math.floor((height - top - bottom - 170) / 2)))
  const cardGap = 16
  const cardX = 22
  const cardW = width - cardX * 2
  const firstY = top + 128 - scroll
  const cards = [0, 1, 2].map(index => ({ x: cardX, y: firstY + index * (cardHeight + cardGap), w: cardW, h: cardHeight }))
  const preview = card => ({ x: card.x + 18, y: card.y + 66, w: card.w - 36, h: Math.max(72, card.h - 94) })
  const contentBottom = top + 128 + (cardHeight + cardGap) * 2 + cardHeight
  const maxScroll = Math.max(0, contentBottom - (height - bottom - 18))
  return { cards, preview, cardHeight, maxScroll }
}

function start({ context: c, screen: initialScreen, openGame }) {
  let screen = initialScreen
  let active = true
  let pressed = null
  let pickerOpen = false
  let pickerLayout
  let pickerPage = 0
  let detailGame = null
  let homeCards = {}
  let homeScroll = 0
  let homeScrollMax = 0
  let scrollFrame = null
  let detailBack
  let detailSelect
  let detailEnter
  let selectedId = defaultLevel.id
  let selectedSokobanId = defaultSokobanLevel.id
  try { selectedId = getLevel(wx.getStorageSync('klotski.currentLevel')).id } catch (error) {}
  try { selectedSokobanId = getSokobanLevel(wx.getStorageSync('sokoban.currentLevel')).id } catch (error) {}
  let selectedLevel = getLevel(selectedId)
  let selectedRules = create(selectedLevel)
  let saved = null
  let selectedSokobanLevel = getSokobanLevel(selectedSokobanId)
  let selectedSokobanRules = createSokoban(selectedSokobanLevel)
  let sokobanSaved = null
  let tetrisSaved = null
  function loadSelected() {
    selectedLevel = getLevel(selectedId)
    selectedRules = create(selectedLevel)
    try { saved = selectedRules.restore(wx.getStorageSync(`klotski.${selectedId}.v1`)) } catch (error) { saved = null }
    selectedSokobanLevel = getSokobanLevel(selectedSokobanId)
    selectedSokobanRules = createSokoban(selectedSokobanLevel)
    try { sokobanSaved = selectedSokobanRules.restore(wx.getStorageSync(selectedSokobanRules.saveKey)) } catch (error) { sokobanSaved = null }
    try { tetrisSaved = wx.getStorageSync('tetris.v1') } catch (error) { tetrisSaved = null }
  }
  loadSelected()
  const art = loadPortraits(repaint)

  function repaint() {
    if (!active) return
    const { width, height, top, bottom } = screen
    background(c, width, height)
    if (detailGame) {
      drawDetail()
      return
    }
    text(c, '童 年 游 戏 馆', 25, top + 25, 12, P.wine)
    text(c, '重拾方寸间的乐趣', 24, top + 69, 27, P.ink, 'left', true)
    text(c, '熟悉的规则，值得再玩一次。', 25, top + 103, 13, P.muted)
    const home = homeCardLayout(screen, homeScroll)
    const [card, second, third] = home.cards
    const cardHeight = home.cardHeight
    const listTop = top + 118
    const listBottom = height - bottom - 22
    c.save()
    c.beginPath(); c.moveTo(0, listTop); c.lineTo(width, listTop); c.lineTo(width, listBottom); c.lineTo(0, listBottom); c.closePath(); c.clip()
    if (card.y + card.h > top && card.y < height - bottom) {
      box(c, card, 'rgba(255,250,237,.65)', 16, '#d0bea0')
      text(c, '01  /  经典益智', card.x + 18, card.y + 22, 10, P.muted)
      text(c, '华容道', card.x + 18, card.y + 51, 23, P.ink, 'left', true)
      const preview = home.preview(card)
      const cell = Math.min(28, preview.w / 4, preview.h / 5)
      const board = { x: preview.x + (preview.w - cell * 4) / 2, y: preview.y + (preview.h - cell * 5) / 2, w: cell * 4, h: cell * 5 }
      drawBoard(c, board, cell, selectedLevel.pieces, null, null, art.portraits)
      text(c, '点击卡片查看详情', width / 2, card.y + card.h - 18, 10, P.muted, 'center')
    }
    if (second.y + second.h > top && second.y < height - bottom) {
      box(c, second, 'rgba(255,250,237,.65)', 16, '#d0bea0')
      text(c, '02  /  经典益智', second.x + 18, second.y + 22, 10, P.muted)
      text(c, '推箱子', second.x + 18, second.y + 51, 23, P.ink, 'left', true)
      drawSokobanPreview(c, home.preview(second), selectedSokobanLevel)
      text(c, '点击卡片查看详情', width / 2, second.y + second.h - 18, 10, P.muted, 'center')
    }
    if (third.y + third.h > top && third.y < height - bottom) {
      box(c, third, 'rgba(255,250,237,.65)', 16, '#d0bea0')
      text(c, '03  /  经典街机', third.x + 18, third.y + 22, 10, P.muted)
      text(c, '俄罗斯方块', third.x + 18, third.y + 51, 23, P.ink, 'left', true)
      drawTetrisCover(c, home.preview(third), { compact: true })
      text(c, '点击卡片查看详情', width / 2, third.y + third.h - 18, 10, P.muted, 'center')
    }
    c.restore()
    homeScrollMax = home.maxScroll
    text(c, homeScrollMax > 0 ? '上下滑动浏览 · 点击卡片查看详情' : '点击卡片查看详情', width / 2, height - bottom - 8, 10, P.muted, 'center')
    homeCards = { klotski: card, sokoban: second, tetris: third }
    if (pickerOpen) {
      pickerLayout = {
        width, height, picker: { x: 16, y: top + 116, w: width - 32, h: Math.min(height - top - bottom - 132, 430) },
        levelRows: [], levelPage: pickerPage,
        levelClose: { x: width - 16 - 54, y: top + 116 + 12, w: 38, h: 34 }
      }
      drawLevelPicker(c, pickerLayout, levels, selectedId)
    }
  }

  function drawSokobanPicker() {
    const { width, height, top, bottom } = screen
    const picker = { x: 16, y: top + 96, w: width - 32, h: Math.min(height - top - bottom - 112, 470) }
    const layout = { width, height, picker, close: { x: width - 70, y: picker.y + 12, w: 38, h: 34 }, rows: [], page: pickerPage }
    pickerLayout = layout
    c.fillStyle = 'rgba(52,55,33,.5)'; c.fillRect(0, 0, width, height)
    box(c, picker, '#f1e5bd', 16, '#777449')
    box(c, { x: picker.x + 5, y: picker.y + 5, w: picker.w - 10, h: picker.h - 10 }, null, 12, 'rgba(255,255,224,.48)')
    text(c, '选择关卡', picker.x + picker.w / 2, picker.y + 28, 22, '#26333a', 'center', true)
    text(c, '26 关基础教学 + 20 关 XSokoban 挑战 · 独立存档', picker.x + picker.w / 2, picker.y + 54, 10, '#6f6945', 'center')
    text(c, '×', layout.close.x + layout.close.w / 2, layout.close.y + layout.close.h / 2, 24, '#5c6041', 'center')
    const pageSize = 8; const pageCount = Math.ceil(sokobanLevels.length / pageSize)
    const page = Math.min(pageCount - 1, pickerPage)
    const visible = sokobanLevels.slice(page * pageSize, page * pageSize + pageSize)
    const outer = 14; const gutter = 12; const columnW = (picker.w - outer * 2 - gutter) / 2
    visible.forEach((level, index) => {
      const row = { id: level.id, x: picker.x + outer + (index % 2) * (columnW + gutter), y: picker.y + 72 + Math.floor(index / 2) * 54, w: columnW, h: 46 }
      layout.rows.push(row)
      box(c, row, level.id === selectedSokobanId ? 'rgba(224,133,126,.26)' : 'rgba(255,249,221,.7)', 9, level.id === selectedSokobanId ? '#b95c65' : '#b7aa73')
      text(c, `${level.order}. ${level.name}`, row.x + 9, row.y + 16, 12, level.id === selectedSokobanId ? '#7d3542' : '#26333a', 'left', true)
      text(c, `${level.challenge} · ≥${level.minimumPushes} 推`, row.x + 9, row.y + 35, 8.5, '#6f6945')
    })
    layout.prev = { x: picker.x + 16, y: picker.y + picker.h - 40, w: 70, h: 28 }
    layout.next = { x: picker.x + picker.w - 86, y: picker.y + picker.h - 40, w: 70, h: 28 }
    button(c, layout.prev, '‹ 上一页', false, page > 0); button(c, layout.next, '下一页 ›', false, page < pageCount - 1)
    text(c, `${page + 1} / ${pageCount}`, picker.x + picker.w / 2, picker.y + picker.h - 21, 10, '#6f6945', 'center')
  }

  function drawDetail() {
    const { width, height, top, bottom } = screen
    detailBack = { x: 18, y: top + 5, w: 105, h: 32 }
    text(c, '‹  游戏合集', detailBack.x + 4, detailBack.y + 16, 13, detailGame === 'sokoban' ? '#566044' : P.muted)
    const isSokoban = detailGame === 'sokoban'
    const isTetris = detailGame === 'tetris'
    const title = isSokoban ? '推箱子' : isTetris ? '俄罗斯方块' : '华容道'
    const subtitle = isSokoban ? '经典仓库番 · 木箱与目标点' : isTetris ? '经典街机 · 七种方块与无限消行' : '一帅 · 五将 · 四兵'
    text(c, title, 24, top + 70, 31, isSokoban ? '#26333a' : P.ink, 'left', true)
    text(c, subtitle, 26, top + 101, 12, isSokoban ? '#6f6945' : P.muted)
    const cover = { x: 20, y: top + 122, w: width - 40, h: Math.min(310, Math.max(190, height * .38)) }
    box(c, cover, isSokoban ? '#aaa36c' : isTetris ? '#101c35' : 'rgba(255,250,237,.74)', 18, isSokoban ? '#5c5e3d' : isTetris ? '#c9ab68' : '#d0bea0')
    if (isSokoban) box(c, { x: cover.x + 6, y: cover.y + 6, w: cover.w - 12, h: cover.h - 12 }, null, 14, 'rgba(255,255,220,.38)')
    if (isSokoban) drawSokobanPreview(c, { x: cover.x + 26, y: cover.y + 18, w: cover.w - 52, h: cover.h - 36 }, selectedSokobanLevel)
    else if (isTetris) drawTetrisCover(c, { x: cover.x + 18, y: cover.y + 16, w: cover.w - 36, h: cover.h - 32 })
    else {
      const cell = Math.min((cover.w - 40) / 4, (cover.h - 34) / 5)
      drawBoard(c, { x: (width - cell * 4) / 2, y: cover.y + (cover.h - cell * 5) / 2, w: cell * 4, h: cell * 5 }, cell, selectedLevel.pieces, null, null, art.portraits)
    }
    const select = isTetris ? null : { x: 24, y: height - bottom - 102, w: (width - 56) / 2, h: 44 }
    const enter = isTetris ? { x: 24, y: height - bottom - 102, w: width - 48, h: 44 } : { x: select.x + select.w + 8, y: select.y, w: select.w, h: 44 }
    const actionY = select ? select.y : enter.y
    const info = { x: 20, y: cover.y + cover.h + 10, w: width - 40, h: Math.max(62, actionY - cover.y - cover.h - 22) }
    if (isSokoban) {
      box(c, info, '#f1e5bd', 12, '#b7aa73')
      text(c, '玩法核心', info.x + 14, info.y + 17, 13, '#566044', 'left', true)
      const lines = height < 620
        ? ['木箱只能推、不能拉；先规划顺序再动手。', '避开角落死局，利用回身空间把所有木箱送到目标点。']
        : ['箱子只能推、不能拉；每一步都会改变空间。', '先规划顺序，再利用回身空间处理窄门和深巷。', '避开角落死局，把全部木箱推到红色目标点。', `${selectedSokobanLevel.challenge} · ${selectedSokobanLevel.chapter} · ${selectedSokobanLevel.name}`]
      lines.forEach((line, index) => text(c, line, info.x + 14, info.y + 39 + index * 18, 12, '#4f573d', 'left'))
    } else if (isTetris) {
      box(c, info, 'rgba(255,250,237,.74)', 12, '#d0bea0')
      text(c, '玩法说明', info.x + 14, info.y + 17, 14, P.wine, 'left', true)
      const lines = height < 620
        ? ['移动、旋转方块，填满整行即可消除。', '下滑软降，上滑或按硬降快速落底。']
        : ['七种方块持续下落，填满整行即可消除。', '左右滑动移动，点击旋转；上滑或按硬降快速落底。', '消行越多等级越高，速度也会逐步加快。']
      lines.forEach((line, index) => text(c, line, info.x + 14, info.y + 41 + index * 19, 12, P.ink, 'left'))
    } else {
      box(c, info, 'rgba(255,250,237,.74)', 12, '#d0bea0')
      text(c, '玩法说明', info.x + 14, info.y + 17, 13, P.wine, 'left', true)
      const lines = ['在四列五行棋盘中，为曹操打开出口。', '棋子不可旋转，滑动与拖动都支持。', `当前布局：${selectedLevel.name}`]
      lines.forEach((line, index) => text(c, line, info.x + 14, info.y + 39 + index * 18, 12, P.ink, 'left'))
    }
    if (select) selectionButton(c, select, isSokoban ? '选择关卡 · 选局' : '选择对局')
    const savedValue = isSokoban ? sokobanSaved : isTetris ? tetrisSaved : saved
    const progress = isSokoban ? savedValue && savedValue.steps > 0 : isTetris ? savedValue && savedValue.started : savedValue && savedValue.steps > 0
    const enterLabel = isTetris
      ? (progress ? `继续游戏 · ${savedValue.score || 0} 分` : '进入游戏  →')
      : progress ? (isSokoban ? `继续推箱 · ${savedValue.steps} 步` : `继续解局 · ${savedValue.steps} 步`) : (isSokoban ? '进入游戏  →' : '进入棋局  →')
    button(c, enter, enterLabel, true)
    detailSelect = select; detailEnter = enter
    if (pickerOpen) {
      if (isSokoban) drawSokobanPicker()
      else {
        pickerLayout = { width, height, picker: { x: 16, y: top + 116, w: width - 32, h: Math.min(height - top - bottom - 132, 430) }, levelRows: [], levelPage: pickerPage,
          levelClose: { x: width - 70, y: top + 128, w: 38, h: 34 } }
        drawLevelPicker(c, pickerLayout, levels, selectedId)
      }
    }
  }

  function scheduleScrollRepaint() {
    if (!active || scrollFrame !== null) return
    if (typeof requestAnimationFrame === 'function') {
      scrollFrame = requestAnimationFrame(() => { scrollFrame = null; repaint() })
    } else repaint()
  }

  function cancelScrollRepaint() {
    if (scrollFrame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(scrollFrame)
    scrollFrame = null
  }

  function onStart(e) {
    if (!active || pressed) return
    const t = e.changedTouches[0] || e.touches[0]
    if (pickerOpen) {
      const rows = pickerLayout && (pickerLayout.levelRows || pickerLayout.rows)
      const row = rows && rows.find(item => contains(item, t))
      if (contains(pickerLayout && (pickerLayout.levelClose || pickerLayout.close), t)) pressed = { ...t, action: 'close' }
      else if (contains(pickerLayout && pickerLayout.levelPrev, t)) pressed = { ...t, action: 'prev' }
      else if (contains(pickerLayout && pickerLayout.levelNext, t)) pressed = { ...t, action: 'next' }
      else if (contains(pickerLayout && pickerLayout.prev, t)) pressed = { ...t, action: 'prev' }
      else if (contains(pickerLayout && pickerLayout.next, t)) pressed = { ...t, action: 'next' }
      else if (row) pressed = { ...t, action: row.id }
      return
    }
    if (detailGame) {
      if (contains(detailBack, t)) pressed = { ...t, action: 'back' }
      else if (contains(detailSelect, t)) pressed = { ...t, action: 'levels' }
      else if (contains(detailEnter, t)) pressed = { ...t, action: detailGame === 'sokoban' ? 'sokoban-start' : detailGame === 'tetris' ? 'tetris-start' : 'start' }
      return
    }
    if (contains(homeCards.klotski, t)) pressed = { ...t, action: 'detail-klotski', lastY: t.clientY, moved: false }
    else if (contains(homeCards.sokoban, t)) pressed = { ...t, action: 'detail-sokoban', lastY: t.clientY, moved: false }
    else if (contains(homeCards.tetris, t)) pressed = { ...t, action: 'detail-tetris', lastY: t.clientY, moved: false }
    else pressed = { ...t, action: 'home-scroll', lastY: t.clientY, moved: false }
  }
  function onMove(e) {
    if (!active || !pressed || detailGame || pickerOpen) return
    const t = (e.touches || e.changedTouches || []).find(touch => touch.identifier === pressed.identifier)
    if (!t) return
    const action = pressed.action
    if (action !== 'home-scroll' && action !== 'detail-klotski' && action !== 'detail-sokoban' && action !== 'detail-tetris') return
    if (Math.abs(t.clientY - pressed.clientY) >= 6) pressed.moved = true
    if (!pressed.moved) return
    const delta = pressed.lastY - t.clientY
    pressed.lastY = t.clientY
    if (delta) homeScroll = Math.max(0, Math.min(homeScrollMax, homeScroll + delta))
    scheduleScrollRepaint()
  }
  function onEnd(e) {
    if (!active || !pressed) return
    const t = e.changedTouches.find(touch => touch.identifier === pressed.identifier)
    if (!t) return
    const moved = pressed.moved === true
    const lastY = pressed.lastY
    const tap = !moved && Math.hypot(t.clientX - pressed.clientX, t.clientY - pressed.clientY) < 16
    const action = pressed.action
    const startY = pressed.clientY
    pressed = null
    if (action === 'home-scroll') {
      if (moved) homeScroll = Math.max(0, Math.min(homeScrollMax, homeScroll + (lastY - t.clientY)))
      else if (!tap) homeScroll = Math.max(0, Math.min(homeScrollMax, homeScroll + startY - t.clientY))
      repaint()
      return
    }
    if ((action === 'detail-klotski' || action === 'detail-sokoban' || action === 'detail-tetris') && (moved || !tap)) {
      homeScroll = Math.max(0, Math.min(homeScrollMax, homeScroll + (moved ? lastY - t.clientY : startY - t.clientY)))
      repaint()
      return
    }
    if (!tap) return
    if (action === 'detail-klotski') { detailGame = 'klotski'; pickerOpen = false; repaint() }
    else if (action === 'detail-sokoban') { detailGame = 'sokoban'; pickerOpen = false; repaint() }
    else if (action === 'detail-tetris') { detailGame = 'tetris'; pickerOpen = false; repaint() }
    else if (action === 'back') { detailGame = null; pickerOpen = false; repaint() }
    else if (action === 'start') openGame('klotski', selectedId)
    else if (action === 'sokoban-start') openGame('sokoban', selectedSokobanId)
    else if (action === 'tetris-start') openGame('tetris')
    else if (action === 'levels') {
      const source = detailGame === 'sokoban' ? sokobanLevels : levels
      const selected = detailGame === 'sokoban' ? selectedSokobanId : selectedId
      pickerPage = Math.floor(Math.max(0, source.findIndex(level => level.id === selected)) / 8)
      pickerOpen = true; repaint()
    }
    else if (action === 'close') { pickerOpen = false; repaint() }
    else if (action === 'prev') { pickerPage = Math.max(0, pickerPage - 1); repaint() }
    else if (action === 'next') {
      const source = detailGame === 'sokoban' ? sokobanLevels : levels
      pickerPage = Math.min(Math.ceil(source.length / 8) - 1, pickerPage + 1); repaint()
    }
    else if (levels.some(level => level.id === action)) {
      selectedId = action
      try { wx.setStorageSync('klotski.currentLevel', selectedId) } catch (error) {}
      loadSelected(); pickerOpen = false; repaint()
    }
    else if (sokobanLevels.some(level => level.id === action)) {
      selectedSokobanId = action
      try { wx.setStorageSync('sokoban.currentLevel', selectedSokobanId) } catch (error) {}
      loadSelected(); pickerOpen = false; repaint()
    }
  }
  function cancel() { pressed = null; cancelScrollRepaint() }
  wx.onTouchStart(onStart)
  if (wx.onTouchMove) wx.onTouchMove(onMove)
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
      cancelScrollRepaint()
      wx.offTouchStart(onStart)
      if (wx.offTouchMove) wx.offTouchMove(onMove)
      wx.offTouchEnd(onEnd)
      wx.offTouchCancel(cancel)
    }
  }
}
module.exports = { start, homeCardLayout }
