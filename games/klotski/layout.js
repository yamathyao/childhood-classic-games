function layout(screen) {
  const { width, height, top, bottom } = screen
  const boardY = top + 142
  const cell = Math.min(88, (width - 56) / 4, (height - bottom - boardY - 184) / 5)
  const board = { x: (width - cell * 4) / 2, y: boardY, w: cell * 4, h: cell * 5 }
  const controlsY = board.y + board.h + 61
  const buttonW = (Math.min(width - 48, 400) - 12) / 2
  const controlsX = (width - buttonW * 2 - 12) / 2
  const dialogW = Math.min(310, width - 36)
  const dialog = { x: (width - dialogW) / 2, y: (height - 250) / 2, w: dialogW, h: 250 }
  return {
    ...screen, board, cell,
    back: { x: 20, y: top, w: 88, h: 36 },
    picker: { x: width - 126, y: top, w: 48, h: 36 },
    help: { x: width - 68, y: top, w: 48, h: 36 },
    undo: { x: controlsX, y: controlsY, w: buttonW, h: 44 },
    reset: { x: controlsX + buttonW + 12, y: controlsY, w: buttonW, h: 44 },
    exit: { x: controlsX, y: controlsY + 54, w: buttonW * 2 + 12, h: 38 },
    dialog,
    cancel: { x: dialog.x + 20, y: dialog.y + 190, w: (dialogW - 50) / 2, h: 42 },
    confirm: { x: dialog.x + dialogW / 2 + 5, y: dialog.y + 190, w: (dialogW - 50) / 2, h: 42 }
  }
}
function dialogLayout(view, type) {
  if (type !== 'won') return { dialog: view.dialog, cancel: view.cancel, confirm: view.confirm }
  const dialog = { ...view.dialog, y: (view.height - 278) / 2, h: 278 }
  const buttonWidth = (dialog.w - 50) / 2
  return {
    dialog,
    cancel: { x: dialog.x + 20, y: dialog.y + 154, w: buttonWidth, h: 44 },
    confirm: { x: dialog.x + 30 + buttonWidth, y: dialog.y + 154, w: buttonWidth, h: 44 },
    next: { x: dialog.x + 20, y: dialog.y + 208, w: dialog.w - 40, h: 48 }
  }
}

module.exports = { layout, dialogLayout }
