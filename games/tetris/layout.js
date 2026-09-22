function layout(screen) {
  const { width, height, top, bottom } = screen
  const compact = height < 630
  const headerHeight = compact ? 104 : 132
  const controlHeight = compact ? 88 : 96
  const boardTop = top + headerHeight
  const controlsTop = height - bottom - controlHeight
  const boardGap = compact ? 10 : 14
  const maxBoardHeight = Math.max(20 * 12, controlsTop - boardTop - boardGap)
  const cell = Math.min(34, (width - 36) / 10, maxBoardHeight / 20)
  const board = {
    x: (width - cell * 10) / 2,
    y: boardTop + Math.max(0, (maxBoardHeight - cell * 20) / 2),
    w: cell * 10,
    h: cell * 20
  }
  const buttonGap = 8
  const buttonW = (width - 44 - buttonGap * 2) / 3
  const rowX = (width - buttonW * 3 - buttonGap * 2) / 2
  const rowH = compact ? 38 : 42
  const secondW = (width - 44 - buttonGap) / 2
  const secondX = (width - secondW * 2 - buttonGap) / 2
  const statY = top + (compact ? 64 : 72)
  const statW = Math.min(72, (width - 126) / 3)
  const statX = 18
  const dialogW = Math.min(316, width - 32)
  const dialogH = compact ? 242 : 260
  return {
    ...screen,
    compact,
    board,
    cell,
    preview: { x: width - 86, y: top + (compact ? 42 : 48), w: 66, h: 66 },
    stats: {
      score: { x: statX, y: statY, w: statW, h: 42 },
      lines: { x: statX + statW + 6, y: statY, w: statW, h: 42 },
      level: { x: statX + (statW + 6) * 2, y: statY, w: statW, h: 42 }
    },
    back: { x: 16, y: top + 2, w: 94, h: 32 },
    reset: { x: width - 174, y: top + 2, w: 54, h: 32 },
    pause: { x: width - 116, y: top + 2, w: 48, h: 32 },
    help: { x: width - 62, y: top + 2, w: 46, h: 32 },
    pad: {
      left: { x: rowX, y: controlsTop, w: buttonW, h: rowH },
      rotate: { x: rowX + buttonW + buttonGap, y: controlsTop, w: buttonW, h: rowH },
      right: { x: rowX + (buttonW + buttonGap) * 2, y: controlsTop, w: buttonW, h: rowH }
    },
    softDrop: { x: secondX, y: controlsTop + rowH + 8, w: secondW, h: rowH },
    hardDrop: { x: secondX + secondW + buttonGap, y: controlsTop + rowH + 8, w: secondW, h: rowH },
    dialog: { x: (width - dialogW) / 2, y: Math.max(top + 48, Math.min((height - dialogH) / 2, height - bottom - dialogH)), w: dialogW, h: dialogH }
  }
}

module.exports = { layout }
