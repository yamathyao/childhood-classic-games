// Repeatable CPU benchmark. Canvas calls are mocked; device GPU cost is not measured.
const { performance } = require('node:perf_hooks')
const rules = require('../games/office/rules.js')
const renderer = require('../games/office/renderer.js')
const { layout } = require('../games/office/layout.js')

function fixture(count) {
  const state = rules.initialState()
  for (let index = 0; index < count; index++) {
    const ball = rules.launch(state, 0)
    Object.assign(ball, { x: .05 + (index % 16) * .145, y: rules.RADIUS,
      z: 1.2 + Math.floor(index / 16) * .145, vx: 0, vy: 0, vz: 0, asleep: true, resolved: true })
  }
  return state
}
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
function measure(callback) {
  callback()
  const runs = []
  for (let run = 0; run < 5; run++) { const start = performance.now(); callback(); runs.push(performance.now() - start) }
  return +median(runs).toFixed(2)
}
function main() {
  const context = Object.fromEntries(['clearRect', 'fillRect', 'beginPath', 'moveTo', 'lineTo',
    'quadraticCurveTo', 'closePath', 'arc', 'fill', 'stroke', 'save', 'restore', 'clip', 'fillText'].map(name => [name, () => {}]))
  const view = layout({ width: 375, height: 667, top: 24, bottom: 16 })
  for (const count of [0, 40, 160]) {
    const state = fixture(count)
    const physics = measure(() => {
      const live = rules.restore(rules.snapshot(state)); rules.launch(live, 1120)
      for (let frame = 0; frame < 120; frame++) rules.tick(live, 1000 / 60)
    })
    const render = measure(() => { for (let frame = 0; frame < 60; frame++) renderer.draw({ context, view, state }) })
    console.log(JSON.stringify({ settledPaper: count, physics120FramesMs: physics, render60FramesMs: render }))
  }
}
async function browserMain() {
  const assert = require('node:assert/strict')
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
  const { browserBoot, modules } = require('./visual-qa.cjs')
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXECUTABLE || undefined })
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2 })
    await page.setContent('<canvas></canvas>')
    // Load only the office modules, without starting the collection's animation.
    await page.addScriptTag({ content: '(' + browserBoot.toString() + ')(' + JSON.stringify({
      modules: { ...modules, 'game.js': '' }, images: {}
    }).replace(/</g, '\\u003c') + ')' })
    const results = await page.evaluate(states => {
      const r = qa.load('games/office/rules.js'); const renderer = qa.load('games/office/renderer.js')
      const view = qa.load('games/office/layout.js').layout({ width: 375, height: 667, top: 24, bottom: 16, dpr: 2 })
      const surface = document.querySelector('canvas'); surface.width = 750; surface.height = 1334
      const context = surface.getContext('2d'); context.scale(2, 2)
      let creates = 0
      const create = wx.createOffscreenCanvas
      wx.createOffscreenCanvas = options => { creates++; return create(options) }
      const pixels = () => context.getImageData(0, 0, surface.width, surface.height).data
      const compare = (a, b) => {
        let changed = 0; let maximum = 0
        for (let index = 0; index < a.length; index++) { const delta = Math.abs(a[index] - b[index]); if (delta) changed++; maximum = Math.max(maximum, delta) }
        return { changed, maximum }
      }
      function render(state, cached, nextView = view) {
        wx.createOffscreenCanvas = cached ? options => { creates++; return create(options) } : undefined
        renderer.draw({ context, view: nextView, state, charging: true, power: .5 })
      }
      function time(state, cached) {
        const runs = []
        render(state, cached)
        for (let run = 0; run < 5; run++) {
          const start = performance.now()
          for (let frame = 0; frame < 60; frame++) render(state, cached)
          // Flush native drawing so this includes Canvas work, not just commands.
          pixels(); runs.push(performance.now() - start)
        }
        return +runs.sort((a, b) => a - b)[2].toFixed(2)
      }
      const output = states.map(saved => {
        const state = r.restore(saved)
        render(state, false); const direct = pixels()
        render(state, true); const cached = pixels()
        return { settledPaper: state.balls.length, direct60FramesMs: time(state, false),
          cached60FramesMs: time(state, true), pixels: compare(direct, cached) }
      })
      const state = r.restore(states[1]); const checks = []
      function check(label) {
        render(state, true); const cached = pixels()
        render(state, false); checks.push({ label, ...compare(cached, pixels()) })
      }
      check('stationary cache reuse')
      const line = qa.load('games/office/dialogue.js').LINES.find(line => line.mood === 'angry')
      state.reaction = { id: line.id, remaining: 3 }; check('reaction change')
      state.propHits.cup = true; check('tipped prop')
      state.cleanupIn = .7; check('cleanup fade')
      state.balls.pop(); check('paper removed')
      r.launch(state, 800); check('flying paper bypasses cache')
      state.gameOver = 'people'; check('boss')
      const beforeResize = creates
      state.balls.forEach(ball => { ball.asleep = true })
      render(state, true, { ...view, scene: { ...view.scene, h: view.scene.h - 12 } })
      return { measurements: output, checks, resizeRecreatesCache: creates > beforeResize }
    }, [0, 40, 160].map(count => rules.snapshot(fixture(count))))
    for (const result of results.measurements) {
      console.log(JSON.stringify(result))
    }
    console.log(JSON.stringify(results.checks))
    // Native Canvas can round a few antialiased edge channels by one when a
    // premultiplied offscreen image is composited onto the main surface.
    for (const check of [...results.measurements.map(result => result.pixels), ...results.checks]) {
      assert.ok(check.maximum <= 1 && check.changed <= 100, check.label || 'cached/direct pixel comparison')
    }
    assert.equal(results.resizeRecreatesCache, true)
    console.log('Native Canvas pixels, cache invalidation, flight fallback and resize passed')
  } finally { await browser.close() }
}
if (require.main === module) {
  if (process.argv.includes('--browser')) browserMain().catch(error => { console.error(error); process.exitCode = 1 })
  else main()
}
module.exports = { fixture }
