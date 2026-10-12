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
if (require.main === module) main()
module.exports = { fixture }
