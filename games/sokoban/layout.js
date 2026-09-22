function layout(screen, board) {
  const { width, height, top, bottom } = screen
  const rows = board.height
  const cols = board.width
  const boardY = top + 132
  const buttonGap = 8
  const buttonW = Math.min(104, (width - 44 - buttonGap * 2) / 3)
  // Give the directional pad a comfortable touch target while reserving the
  // reduced board height above it on compact screens.
  const padSize = Math.min(height < 660 ? 48 : 54, (width - 54) / 3)
  const padX = (width - padSize * 3 - 8) / 2
  const padY = height - bottom - padSize * 2 - 12
  const playTop = boardY + (height < 660 ? 4 : 18)
  const maxBoardHeight = Math.max(1, padY - playTop - 116)
  const cell = Math.min(58, (width - 40) / cols, maxBoardHeight / rows)
  const boardHeight = cell * rows
  const boardRect = { x: (width - cell * cols) / 2, y: playTop + Math.max(0, (maxBoardHeight - boardHeight) / 2),
    w: cell * cols, h: boardHeight }
  // Keep the action row close to the directional pad instead of leaving a
  // large empty band below the board on taller screens.
  const controlsY = padY - 42 - 14
  const controlsX = (width - buttonW * 3 - buttonGap * 2) / 2
  return {
    ...screen, board: boardRect, cell,
    back: { x: 20, y: top, w: 92, h: 36 },
    picker: { x: width - 126, y: top, w: 48, h: 36 },
    help: { x: width - 68, y: top, w: 48, h: 36 },
    undo: { x: controlsX, y: controlsY, w: buttonW, h: 42 },
    reset: { x: controlsX + buttonW + buttonGap, y: controlsY, w: buttonW, h: 42 },
    exit: { x: controlsX + (buttonW + buttonGap) * 2, y: controlsY, w: buttonW, h: 42 },
    pad: {
      up: { x: padX + padSize + 4, y: padY, w: padSize, h: padSize },
      left: { x: padX, y: padY + padSize + 4, w: padSize, h: padSize },
      down: { x: padX + padSize + 4, y: padY + padSize + 4, w: padSize, h: padSize },
      right: { x: padX + (padSize + 4) * 2, y: padY + padSize + 4, w: padSize, h: padSize }
    },
    dialog: { x: (width - Math.min(310, width - 36)) / 2, y: (height - 250) / 2, w: Math.min(310, width - 36), h: 250 }
  }
}
module.exports = { layout }
