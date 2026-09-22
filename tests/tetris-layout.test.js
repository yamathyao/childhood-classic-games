const assert = require('node:assert/strict')
const { test } = require('node:test')
const { layout } = require('../games/tetris/layout.js')

test('keeps board and controls inside the safe area on compact and tall phones', () => {
  for (const screen of [
    { width: 320, height: 568, top: 24, bottom: 16 },
    { width: 375, height: 667, top: 60, bottom: 16 },
    { width: 390, height: 844, top: 60, bottom: 34 }
  ]) {
    const view = layout(screen)
    assert.equal(view.board.w, view.cell * 10)
    assert.equal(view.board.h, view.cell * 20)
    assert.ok(view.cell >= 12)
    for (const rect of [view.board, view.preview, view.back, view.help, view.pause,
      view.pad.left, view.pad.rotate, view.pad.right, view.softDrop, view.hardDrop, view.dialog]) {
      assert.ok(rect.x >= 0 && rect.y >= screen.top, `${screen.width}x${screen.height} x/y`)
      assert.ok(rect.x + rect.w <= screen.width && rect.y + rect.h <= screen.height - screen.bottom,
        `${screen.width}x${screen.height} bounds`)
    }
    assert.ok(view.board.y > view.preview.y + view.preview.h,
      `${screen.width}x${screen.height} board clears the header preview`)
  }
})

test('button rectangles do not overlap the board', () => {
  const view = layout({ width: 375, height: 667, top: 24, bottom: 16 })
  assert.ok(view.board.y + view.board.h <= view.pad.left.y)
  assert.ok(view.pad.left.x + view.pad.left.w <= view.pad.rotate.x)
  assert.ok(view.pad.rotate.x + view.pad.rotate.w <= view.pad.right.x)
})
