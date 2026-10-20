(function () {
  'use strict'
  function render(canvas, state, input = {}) {
    const ctx = canvas.getContext('2d')
    const w = canvas.clientWidth; const h = canvas.clientHeight
    if (!w || !h) return
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    RoadArt.drawScene(ctx, { x: 0, y: 0, w, h }, state, input)
  }
  function thumbnail(canvas, model) {
    const ctx = canvas.getContext('2d'); canvas.width = 124; canvas.height = 136
    ctx.setTransform(1.6, 0, 0, 1.6, 62, 67)
    RoadArt.drawCar(ctx, model, 0, 0)
  }
  window.RoadRenderer = { render, thumbnail }
})()
