// Gravity-filled bin fixture shared by physics and visual checks.
const rules = require('../games/office/rules.js')
function fullBin(count = 110) {
  const state = rules.initialState()
  for (let index = 0; index < count; index++) {
    const ball = rules.launch(state, 0)
    Object.assign(ball, { x: rules.BIN.x + Math.sin(index * 2.39996) * .11,
      z: rules.BIN.z + Math.cos(index * 2.39996) * .11, y: rules.BIN.height + .7,
      vx: 0, vy: 0, vz: 0, resolved: true })
    for (let frame = 0; frame < 72; frame++) rules.tick(state, 1000 / 60)
  }
  for (let frame = 0; frame < 480; frame++) rules.tick(state, 1000 / 60)
  return state
}
module.exports = { fullBin }
