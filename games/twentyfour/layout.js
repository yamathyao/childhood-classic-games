const KEY_ROWS = [['7', '8', '9', '÷', 'delete'], ['4', '5', '6', '×', '('],
  ['1', '2', '3', '−', ')'], ['hint', '0', 'clear', '+', 'submit']]

function layout(screen) {
  const { width, height, top = 24, bottom = 16 } = screen
  const compact = height - top - bottom < 590
  const pad = width < 360 ? 20 : 24
  const keyH = compact ? 36 : 40; const gap = 5
  const keyboardW = Math.min(290, width - pad * 2)
  const keyboardY = height - bottom - 10 - keyH * 4 - gap * 3
  const keys = KEY_ROWS.flatMap((row, y) => row.map((key, x) => ({ key,
    x: (width - keyboardW) / 2 + x * ((keyboardW - gap * 4) / 5 + gap), y: keyboardY + y * (keyH + gap),
    w: (keyboardW - gap * 4) / 5, h: keyH })))
  const formulaH = compact ? 46 : 56
  const formula = { x: pad, y: keyboardY - 34 - formulaH, w: width - pad * 2, h: formulaH }
  const workspaceY = formula.y - 32
  const overlap = Math.min(30, width * .07)
  const cardH = Math.min((width - pad * 2 + 3 * overlap) / 4 * 1.4, workspaceY - (top + 77) - 43)
  const cardW = cardH / 1.4; const deckWidth = cardW * 4 - overlap * 3
  const cardsY = top + 77 + Math.max(0, (workspaceY - 43 - top - 77 - cardH) / 2)
  const cards = Array.from({ length: 4 }, (_, i) => ({ x: (width - deckWidth) / 2 + i * (cardW - overlap), y: cardsY, w: cardW, h: cardH }))
  const panel = { x: 20, y: top + 54, w: width - 40, h: Math.min(405, height - top - bottom - 76) }
  return { ...screen, pad, compact, keys, formula, workspaceY, cards, cardsY, cardH,
    back: { x: 8, y: top, w: 34, h: 36 }, help: { x: width - 54, y: top + 2, w: 34, h: 34 },
    swap: { x: width - pad - 75, y: workspaceY - 38, w: 75, h: 30 }, panel,
    close: { x: panel.x + 18, y: panel.y + panel.h - 57, w: panel.w - 36, h: 40 },
    left: { x: width - pad - 53, y: formula.y - 30, w: 26, h: 26 },
    right: { x: width - pad - 25, y: formula.y - 30, w: 26, h: 26 } }
}
module.exports = { layout }
