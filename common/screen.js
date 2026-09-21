function measure() {
  const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
  const width = info.windowWidth
  const height = info.windowHeight
  const safe = info.safeArea || { top: 0, bottom: height }
  let top = Math.max(24, safe.top || 0)
  if (wx.getMenuButtonBoundingClientRect) {
    const menu = wx.getMenuButtonBoundingClientRect()
    if (menu && menu.bottom) top = Math.max(top, menu.bottom + 8)
  }
  return { width, height, top, bottom: Math.max(16, height - (safe.bottom || height)),
    dpr: Math.min(3, info.pixelRatio || 1) }
}

function resize(canvas, context) {
  const screen = measure()
  canvas.width = Math.round(screen.width * screen.dpr)
  canvas.height = Math.round(screen.height * screen.dpr)
  context.scale(screen.dpr, screen.dpr)
  return screen
}

module.exports = { measure, resize }
