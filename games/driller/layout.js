function layout(screen, level) {
  const { width, height, top, bottom } = screen
  const columns = level.rows[0].length
  const cell = Math.min(36, (width - 28) / columns)
  const controlsY = height - bottom - 106
  const boardY = top + 142
  const visibleRows = Math.max(4, Math.floor((controlsY - boardY - 30) / cell))
  const board = { x: (width - cell * columns) / 2, y: boardY, w: cell * columns, h: visibleRows * cell }
  const gap = 10
  const controlWidth = (width - 36 - gap * 2) / 3
  const pad = Object.fromEntries(['left', 'down', 'right'].map((name, index) => [name, { x: 18 + index * (controlWidth + gap), y: controlsY, w: controlWidth, h: 58 }]))
  pad.up = { x: 18, y: controlsY + 68, w: width - 36, h: 36 }
  return { ...screen, cell, columns, board, visibleRows, rows: level.rows.length,
    back: { x: 18, y: top + 2, w: 100, h: 32 },
    reset: { x: width - 136, y: top + 2, w: 54, h: 32 },
    pause: { x: width - 72, y: top + 2, w: 54, h: 32 },
    oxygen: { x: 20, y: top + 115, w: width - 40, h: 12 },
    pad,
    dialog: { x: 20, y: (height - 302) / 2, w: width - 40, h: 302 } }
}

function cameraFor(state, view) { return Math.max(0, Math.min(view.rows - view.visibleRows, Math.floor(state.player / view.columns) - 3)) }

module.exports = { layout, cameraFor }
