function attributePanels(rect) {
  const gap = 10; const w = (rect.w - gap) / 2
  return { player: { x: rect.x, y: rect.y, w, h: rect.h }, enemy: { x: rect.x + w + gap, y: rect.y, w, h: rect.h } }
}
function nameControls(view, name) {
  const length = Math.max(1, name.length)
  const nameSize = Math.min(20, (view.name.w - 46) / length)
  const renameX = view.name.x + length * nameSize + 5
  const nameWidth = renameX - view.name.x + 36
  return {
    nameSize, renameX,
    name: { ...view.name, w: nameWidth },
    randomName: { ...view.randomName, x: view.name.x + nameWidth + 6 }
  }
}
function layout({ width, height, top = 0, bottom = 0 }) {
  const margin = 18; const w = width - margin * 2
  const compact = height - top - bottom < 570
  const arena = { x: margin, y: top + (compact ? 82 : 88), w, h: Math.min(170, Math.max(88, 90 + (height - top - bottom - 568) * .4)) }
  const attributes = attributePanels({ x: margin, y: arena.y + arena.h + 10, w, h: 100 })
  const weaponY = attributes.player.y + attributes.player.h + 22
  const weaponW = (w - 12) / 3
  const weapons = Array.from({ length: 6 }, (_, index) => ({ x: margin + index % 3 * (weaponW + 6), y: weaponY + Math.floor(index / 3) * 40, w: weaponW, h: 34 }))
  const stanceY = weaponY + (compact ? 100 : 108)
  const stanceHeight = compact ? 36 : 40
  const stances = Array.from({ length: 3 }, (_, index) => ({ x: margin + index * (w + 8) / 3, y: stanceY, w: (w - 16) / 3, h: stanceHeight }))
  const action = { x: margin, y: height - bottom - 54, w, h: 44 }
  const logY = stanceY + stanceHeight + 8
  const log = { x: margin, y: logY, w, h: Math.max(0, action.y - logY - 8) }
  const logHeaderHeight = log.h >= 78 ? 24 : 0
  const logFooterHeight = log.h >= 110 ? 20 : 0
  const logLineHeight = 24
  const logPageSize = Math.max(1, Math.floor((log.h - logHeaderHeight - logFooterHeight - 12) / logLineHeight))
  const dialog = { x: margin, y: (height - 370) / 2, w, h: 370 }
  const guideHeight = Math.min(480, height - top - bottom - 24)
  const guideDialog = { x: margin, y: top + (height - top - bottom - guideHeight) / 2, w, h: guideHeight }
  const growthDialog = { x: margin, y: top + (height - top - bottom - 420) / 2, w, h: 420 }
  const modalButton = (index, total = 2) => ({ x: dialog.x + 16 + index * (dialog.w - 24) / total,
    y: dialog.y + dialog.h - 60, w: (dialog.w - 32 - (total - 1) * 8) / total, h: 44 })
  return { width, height, top, bottom, arena, attributes, weapons, stances, action, log, dialog,
    logPageSize, logLineHeight, logHeaderHeight, logFooterHeight,
    gender: { x: arena.x + 12 + (arena.w - 36) / 2 - 34, y: arena.y + 20, w: 34, h: 21 },
    home: { x: 16, y: top + 4, w: 88, h: 32 },
    restart: { x: width - 200, y: top + 4, w: 76, h: 32 },
    info: { x: width - 118, y: top + 4, w: 44, h: 32 },
    pause: { x: width - 68, y: top + 4, w: 50, h: 32 },
    name: { x: margin, y: top + 43, w: w - 112, h: 34 },
    randomName: { x: width - 124, y: top + 43, w: 34, h: 34 },
    reroll: { x: width - 84, y: top + 45, w: 66, h: 30 },
    tactics: { x: width - 110, y: weaponY - 22, w: 92, h: 20 },
    guideDialog, growthDialog,
    growthCards: Array.from({ length: 3 }, (_, index) => ({ x: margin + 14, y: growthDialog.y + 88 + index * 92, w: w - 28, h: 80 })),
    growthHome: { x: margin + 14, y: growthDialog.y + 368, w: (w - 36) / 2, h: 36 },
    growthRestart: { x: margin + 22 + (w - 36) / 2, y: growthDialog.y + 368, w: (w - 36) / 2, h: 36 },
    guideTabs: Array.from({ length: 4 }, (_, index) => ({ x: guideDialog.x + 12 + index * (w - 18) / 4,
      y: guideDialog.y + 54, w: (w - 42) / 4, h: 30 })),
    guidePrimary: { ...modalButton(1), y: guideDialog.y + guideDialog.h - 56 },
    guideSecondary: { ...modalButton(0), y: guideDialog.y + guideDialog.h - 56 },
    modalPrimary: modalButton(1), modalSecondary: modalButton(0) }
}
module.exports = { layout, attributePanels, nameControls }
