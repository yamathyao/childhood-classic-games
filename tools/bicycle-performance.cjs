const fs = require('node:fs')
const path = require('node:path')
const { performance } = require('node:perf_hooks')
const r = require('../games/bicycle/rules.js')

function measure(work, count = 12) {
  for (let i = 0; i < 4; i++) work()
  const samples = []
  for (let i = 0; i < count; i++) { const start = performance.now(); work(); samples.push(performance.now() - start) }
  samples.sort((a, b) => a - b)
  return { medianMs: +samples[Math.floor(count / 2)].toFixed(3), p95Ms: +samples[Math.floor(count * .95)].toFixed(3) }
}
let checksum = 0
const seed = 20261015
r.setWorldSeed(seed)
const terrain = measure(() => {
  for (let frame = 0; frame < 300; frame++) {
    const center = 10000 + frame * 8
    for (let x = center - 180; x < center + 480; x += 7) checksum += r.terrain(x)
  }
})
const physics = measure(() => {
  const s = r.initialState(seed); r.begin(s); let jumped = -1
  for (let frame = 0; frame < 6000; frame++) {
    const obstacle = r.surfaces(s.x, s.x + 350)[0]
    if (s.status === 'running' && s.grounded && obstacle && obstacle.key !== jumped && obstacle.x - s.x < s.speed * (obstacle.kind === 'van' ? .55 : .35)) {
      r.press(s); r.release(s); jumped = obstacle.key
    }
    r.tick(s, 16)
    if (s.status === 'over') throw new Error('Benchmark route crashed: ' + s.crashReason)
  }
  checksum += s.x
})
const report = { seed, terrain, physics, checksum: Number.isFinite(checksum) }
const output = path.resolve(__dirname, '../tmp/qa-bicycle'); fs.mkdirSync(output, { recursive: true })
const beforeFile = path.join(output, 'cpu-before.json')
if (process.argv.includes('--save-before')) fs.writeFileSync(beforeFile, JSON.stringify(report, null, 2) + '\n')
else {
  if (fs.existsSync(beforeFile)) {
    const before = JSON.parse(fs.readFileSync(beforeFile, 'utf8'))
    report.before = before
    report.baselineComparable = before.seed === seed
    if (report.baselineComparable) {
      report.speedup = { terrain: +(before.terrain.medianMs / terrain.medianMs).toFixed(2), physics: +(before.physics.medianMs / physics.medianMs).toFixed(2) }
    }
  }
  fs.writeFileSync(path.join(output, 'cpu-after.json'), JSON.stringify(report, null, 2) + '\n')
}
console.log(JSON.stringify(report, null, 2))
