function layout(screen) {
  const { width, height, top = 0, bottom = 0 } = screen
  const action = { x: 24, y: height - bottom - 91, w: width - 48, h: 64 }
  const scene = { x: 0, y: top + 115, w: width, h: Math.max(150, action.y - top - 134) }
  const panel = { x: 24, y: scene.y + Math.max(8, (scene.h - 186) / 2), w: width - 48, h: Math.min(186, scene.h - 16) }
  return { width, height, top, bottom, scene, action, panel,
    back: { x: 14, y: top + 2, w: 110, h: 32 }, pause: { x: width - 72, y: top + 2, w: 58, h: 32 },
    groundY: scene.y + scene.h * .64, riderX: width * .25, scale: Math.min(.92, width / 420) }
}
module.exports = { layout }
