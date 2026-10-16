function layout(screen) {
  const { width: w, height: h, top, bottom } = screen
  const cardH = Math.min(112, Math.max(74, (h - top - bottom - 340) / 2))
  const gap = 8; const cardW = (w - 40 - gap * 2) / 3
  const cars = Array.from({ length: 6 }, (_, i) => ({ x: 20 + (i % 3) * (cardW + gap), y: top + 157 + Math.floor(i / 3) * (cardH + gap), w: cardW, h: cardH }))
  const densityY = cars[5].y + cardH + 27
  const controlsY = h - bottom - 58
  const dashboard = { x: 16, y: controlsY - 75, w: w - 32, h: 65 }
  const scene = { x: 0, y: top + 42, w, h: dashboard.y - top - 50 }
  const modalH = Math.min(350, h - top - bottom - 24)
  const modal = { x: 18, y: top + (h - top - bottom - modalH) / 2, w: w - 36, h: modalH }
  return { ...screen, cars, densityY, dashboard, scene, modal,
    back: { x: 12, y: top, w: 105, h: 36 }, help: { x: w - 58, y: top, w: 46, h: 36 },
    pause: { x: w - 112, y: top, w: 48, h: 36 },
    modes: [0, 1].map(i => ({ x: 20 + i * (w - 32) / 2, y: top + 92, w: (w - 48) / 2, h: 34 })),
    densities: [0, 1, 2].map(i => ({ x: 20 + i * (cardW + gap), y: densityY, w: cardW, h: 32 })),
    start: { x: 20, y: h - bottom - 56, w: w - 40, h: 44 },
    controls: ['left', 'right', 'brake', 'accelerate'].map((key, i) => ({ key, x: 16 + i * (w - 24) / 4, y: controlsY, w: (w - 56) / 4, h: 48 })),
    exit: { x: w - 146, y: scene.y + scene.h - 48, w: 134, h: 36 },
    resume: { x: modal.x + 18, y: modal.y + modal.h - 112, w: modal.w - 36, h: 42 },
    choose: { x: modal.x + 18, y: modal.y + modal.h - 60, w: modal.w - 36, h: 40 },
    close: { x: modal.x + 18, y: modal.y + modal.h - 60, w: modal.w - 36, h: 40 }
  }
}
module.exports = { layout }
