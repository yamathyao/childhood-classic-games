function layout(screen) {
  const { width, height, top, bottom } = screen
  const controlsTop = height - bottom - 145
  const radius = 34
  return { ...screen,
    back: { x: 16, y: top + 4, w: 110, h: 36 },
    pause: { x: width - 80, y: top + 4, w: 64, h: 36 },
    clean: { x: width - 174, y: top + 4, w: 86, h: 36 },
    scene: { x: 0, y: top + 112, w: width, h: Math.max(140, controlsTop - top - 112) },
    charge: { x: width / 2, y: height - bottom - 69, radius },
    restart: { x: width / 2 - 74, y: height - bottom - 101, w: 148, h: 58 },
    controlsTop }
}

function hitCharge(view, touch) {
  return Math.hypot(touch.clientX - view.charge.x, touch.clientY - view.charge.y) <= view.charge.radius + 10
}

module.exports = { layout, hitCharge }
