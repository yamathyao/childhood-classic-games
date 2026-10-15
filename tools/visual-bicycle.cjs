const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { browserBoot, modules } = require('./visual-qa.cjs')

async function main() {
  const output = path.resolve(__dirname, '../tmp/qa-bicycle'); fs.mkdirSync(output, { recursive: true })
  const preview = path.join(output, 'preview.html')
  const images = {}
  const performanceReport = []
  for (const name of ['rider.png', 'props.png', 'panorama.jpg', 'earth.jpg']) {
    images['assets/bicycle/' + name] = `data:image/${name.endsWith('.jpg') ? 'jpeg' : 'png'};base64,` +
      fs.readFileSync(path.resolve(__dirname, '../assets/bicycle', name)).toString('base64')
  }
  fs.writeFileSync(preview, '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>自行车大冒险 · 本地预览</title><style>html,body{margin:0;overflow:hidden}canvas{width:100vw;height:100vh;touch-action:none;display:block}</style>' +
    '<canvas></canvas><script>(' + browserBoot.toString() + ')(' + JSON.stringify({ modules, images }).replace(/</g, '\\u003c') + ')</script>')
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXECUTABLE || undefined })
  try {
    for (const [width, height] of [[320, 568], [375, 667], [390, 844]]) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 }); const errors = []
      page.on('pageerror', error => errors.push(error.message)); await page.goto(pathToFileURL(preview).href)
      await page.waitForFunction(() => window.qa)
      const click = async (label, holdMs = 0) => {
        const t = await page.evaluate(label => qa.texts.find(t => t.text === label) || qa.texts.find(t => t.text.includes(label)), label)
        assert.ok(t, 'Missing: ' + label)
        await page.mouse.move(t.x, t.y); await page.mouse.down()
        if (holdMs) await page.waitForTimeout(holdMs)
        await page.mouse.up()
      }
      await page.evaluate(() => {
        const t = { clientX: 160, clientY: innerHeight - 110, identifier: 91 }; const end = { ...t, clientY: -2000 }
        qa.emit('TouchStart', { changedTouches: [t], touches: [t] }); qa.emit('TouchMove', { changedTouches: [end], touches: [end] })
        qa.emit('TouchEnd', { changedTouches: [end], touches: [] })
      })
      await page.screenshot({ path: path.join(output, `collection-${width}.png`) })
      await click('自行车大冒险'); await page.screenshot({ path: path.join(output, `detail-${width}.png`) })
      await page.evaluate(() => {
        qa.load('games/bicycle/rules.js').randomSeed = () => 0
        const renderer = qa.load('games/bicycle/renderer.js'); const original = renderer.draw
        renderer.draw = args => { qa.bicycleState = args.state; qa.bicycleView = args.view; qa.bicyclePaused = args.paused; qa.bicycleArt = args.art; qa.bicycleArgs = args; original(args) }
      })
      await click('进入山野')
      await page.waitForFunction(() => qa.bicycleArt.rider && qa.bicycleArt.props && qa.bicycleArt.panorama && qa.bicycleArt.earth)
      await page.screenshot({ path: path.join(output, `ready-${width}.png`) })
      await click('出发  →'); await page.waitForTimeout(180)
      await page.screenshot({ path: path.join(output, `ride-${width}.png`) })
      const action = await page.evaluate(() => qa.bicycleView.action)
      await page.mouse.move(action.x + action.w / 2, action.y + action.h / 2); await page.mouse.down()
      await page.waitForTimeout(280)
      const heldState = await page.evaluate(() => ({ ...qa.bicycleState }))
      assert.ok(heldState.rotation > .08 && heldState.omega < 0 && !heldState.grounded, JSON.stringify(heldState))
      await page.screenshot({ path: path.join(output, `flip-${width}.png`) })
      await page.mouse.up()
      const released = await page.evaluate(() => ({ angle: qa.bicycleState.angle, rotation: qa.bicycleState.rotation, omega: qa.bicycleState.omega }))
      await page.waitForTimeout(70)
      const afterRelease = await page.evaluate(() => ({ ...qa.bicycleState }))
      assert.equal(afterRelease.held, false)
      if (!afterRelease.grounded && afterRelease.status === 'running') {
        assert.ok(Math.abs(afterRelease.omega) < Math.abs(released.omega), 'Release brakes spin')
        assert.ok(Math.abs(afterRelease.angle - released.angle) < .4, 'Braking preserves a small amount of inertia')
      }
      else if (afterRelease.grounded) assert.equal(afterRelease.rotation, 0, 'Landing clears airborne progress')
      else assert.equal(afterRelease.status, 'crashing', 'An unstable short hop can hit the ground during braking')
      await click('暂停'); const frozen = await page.evaluate(() => qa.bicycleState.x)
      await page.waitForTimeout(150); assert.equal(await page.evaluate(() => qa.bicycleState.x), frozen)
      await page.screenshot({ path: path.join(output, `paused-${width}.png`) })
      await page.evaluate(() => {
        const r = qa.load('games/bicycle/rules.js'); const s = qa.bicycleState; const x = r.OBSTACLE_OFFSET - 80
        Object.assign(s, { x, speed: 360, distance: (x - 80) / 8, angle: r.roadAngle(x), omega: 0, grounded: true,
          held: false, vy: 0, landingTime: 0, dropLip: null, cameraZoom: 1, rotation: 0, airFlips: 0,
          status: 'running', crashMotion: null, crashReason: '', tricking: false })
        s.y = r.supportY(x, s.angle); s.cameraY = r.terrain(x)
      })
      await click('继续速降')
      await page.waitForFunction(() => qa.bicycleState.status === 'crashing', null, { timeout: 2000 })
      assert.equal(await page.evaluate(() => qa.bicycleState.crashReason), '撞上山石')
      const impact = await page.evaluate(() => ({ distance: qa.bicycleState.distance, score: qa.bicycleState.score, angle: qa.bicycleState.angle }))
      await page.waitForTimeout(250)
      assert.equal(await page.evaluate(() => qa.bicycleState.status), 'crashing')
      assert.ok(await page.evaluate(angle => qa.bicycleState.angle > angle + .4 && qa.bicycleState.angle < angle + Math.PI * 2, impact.angle))
      assert.equal(await page.evaluate(() => qa.texts.some(t => t.text === '这趟冒险，先到这里')), false)
      await page.screenshot({ path: path.join(output, `crash-roll-${width}.png`) })
      await click('暂停', 100); const frozenRoll = await page.evaluate(() => JSON.stringify(qa.bicycleState))
      await page.waitForTimeout(150); assert.equal(await page.evaluate(() => JSON.stringify(qa.bicycleState)), frozenRoll)
      await click('继续速降')
      await page.waitForFunction(() => qa.bicycleState.crashMotion.settled && qa.bicycleState.status === 'crashing')
      const restingPose = await page.evaluate(() => ({ x: qa.bicycleState.x, y: qa.bicycleState.y, angle: qa.bicycleState.angle }))
      await page.screenshot({ path: path.join(output, `crash-rest-${width}.png`) })
      await page.waitForTimeout(80)
      assert.deepEqual(await page.evaluate(() => ({ x: qa.bicycleState.x, y: qa.bicycleState.y, angle: qa.bicycleState.angle })), restingPose)
      await page.waitForFunction(() => qa.bicycleState.status === 'over', null, { timeout: 2000 })
      assert.equal(await page.evaluate(() => qa.bicycleState.distance), impact.distance)
      assert.equal(await page.evaluate(() => qa.bicycleState.score), impact.score)
      await page.screenshot({ path: path.join(output, `over-${width}.png`) })
      assert.ok(await page.evaluate(() => wx.getStorageSync('bicycle.records.v1').distance > 0))
      await click('再骑一次'); assert.equal(await page.evaluate(() => qa.bicycleState.status), 'running')
      // Observe an automatic ramp launch and ride through a natural ramp later in the route.
      await page.waitForFunction(() => !qa.bicycleState.grounded && qa.bicycleState.message.includes('木跳台'), null, { timeout: 5000 })
      await page.screenshot({ path: path.join(output, `ramp-${width}.png`) })
      await page.waitForFunction(() => qa.bicycleState.grounded, null, { timeout: 4000 })
      await page.evaluate(() => {
        const r = qa.load('games/bicycle/rules.js'); const s = qa.bicycleState
        // Set up a late-route scene through the actual rule model for visual inspection.
        s.x = r.feature(1).lip - 40; s.angle = r.roadAngle(s.x); s.y = r.supportY(s.x, s.angle)
        s.cameraY = r.terrain(s.x); s.cameraZoom = 1; s.grounded = true; s.vy = 0; s.omega = 0; s.landingTime = 0
      })
      await page.waitForFunction(() => !qa.bicycleState.grounded && qa.bicycleState.message.includes('自然大跳台'), null, { timeout: 3000 })
      await page.screenshot({ path: path.join(output, `natural-${width}.png`) })
      await page.evaluate(() => {
        const r = qa.load('games/bicycle/rules.js'); const s = qa.bicycleState
        s.x = r.feature(2).lip - 80; s.angle = r.roadAngle(s.x); s.y = r.supportY(s.x, s.angle)
        s.cameraY = r.terrain(s.x); s.cameraZoom = 1; s.grounded = true; s.vy = 0; s.omega = 0; s.landingTime = 0; s.dropLip = null
      })
      await page.waitForFunction(() => !qa.bicycleState.grounded && qa.bicycleState.message.includes('断崖飞落'), null, { timeout: 3000 })
      const dropY = await page.evaluate(() => qa.bicycleState.y)
      await page.waitForTimeout(250)
      assert.ok(await page.evaluate(y => qa.bicycleState.y > y && qa.bicycleState.status === 'running', dropY))
      await page.screenshot({ path: path.join(output, `drop-${width}.png`) })
      await page.waitForFunction(() => qa.bicycleState.grounded, null, { timeout: 4000 })
      for (const index of [3, 4]) {
        await page.evaluate(index => {
          const r = qa.load('games/bicycle/rules.js'); const s = qa.bicycleState
          s.x = r.feature(index).lip - 60; s.angle = r.roadAngle(s.x); s.y = r.supportY(s.x, s.angle)
          s.cameraY = r.terrain(s.x); s.cameraZoom = 1; s.grounded = true; s.vy = 0; s.omega = 0; s.landingTime = 0; s.dropLip = null
        }, index)
        await page.waitForFunction(() => !qa.bicycleState.grounded, null, { timeout: 3000 })
        await page.waitForTimeout(120)
        await page.screenshot({ path: path.join(output, `${index === 3 ? 'small' : 'big'}-slope-${width}.png`) })
      }
      await click('暂停')
      for (const [index, name] of [[0, 'camp'], [1, 'highway'], [2, 'railway'], [0, 'airborne'], [0, 'crash'], [0, 'roof']]) {
        const measurement = await page.evaluate(({ index, name }) => {
          const r = qa.load('games/bicycle/rules.js'); const s = qa.bicycleState
          const x = index === 0 ? r.landmark(0).x - 45 : r.route(index).lip + 80
          Object.assign(s, { x, distance: (x - 80) / 8, time: 12, speed: 500, angle: r.rideAngle(x), grounded: true, held: false,
            rotation: 0, omega: 0, landingTime: 0, crashMotion: null, messageTime: 0, dropLip: null, supportId: null, tricking: false, airFlips: 0, status: 'running', cameraZoom: 1 })
          s.y = r.supportY(x, s.angle); s.cameraY = r.rideHeight(x)
          if (name === 'airborne') {
            s.y -= 320; s.cameraY -= 170; s.cameraZoom = .55; s.grounded = false; s.angle = -.6
          } else if (name === 'crash') {
            s.x = r.OBSTACLE_OFFSET - 80; s.angle = r.roadAngle(s.x); s.y = r.supportY(s.x, s.angle)
            s.distance = (s.x - 80) / 8; s.cameraY = r.terrain(s.x)
            for (let i = 0; i < 60; i++) r.tick(s, 8)
          } else if (name === 'roof') {
            const van = r.surfaces(0, r.SECTION).find(item => item.kind === 'van')
            s.x = van.x - 20; s.angle = van.angle; s.y = r.supportY(s.x, s.angle, van.key) - 4
            s.vy = 80; s.speed = 300; s.grounded = false
            for (let i = 0; i < 30 && !s.grounded && s.status === 'running'; i++) r.tick(s, 8)
            if (s.status !== 'running' || s.supportId !== van.key) throw new Error('Failed camper roof landing')
            s.cameraY = r.terrain(s.x)
          }
          const args = { ...qa.bicycleArgs, paused: false }; const render = qa.load('games/bicycle/renderer.js').draw
          const c = args.context; const original = c.drawImage; let calls = 0
          c.drawImage = function(...args) { calls++; return original.apply(this, args) }
          const samples = []; let maxImages = 0
          try {
            for (let i = 0; i < 180; i++) {
              s.time += 1 / 60; calls = 0; const start = performance.now(); render(args)
              if (i >= 30) samples.push(performance.now() - start)
              maxImages = Math.max(maxImages, calls)
            }
          } finally { c.drawImage = original }
          samples.sort((a, b) => a - b)
          return { medianMs: +samples[Math.floor(samples.length / 2)].toFixed(3),
            p95Ms: +samples[Math.floor(samples.length * .95)].toFixed(3), maxImages }
        }, { index, name })
        performanceReport.push({ width, height, scene: name, ...measurement })
        assert.ok(measurement.maxImages < 60, 'bounded visible sprites and texture draws even when zoomed out')
        await page.screenshot({ path: path.join(output, `${name}-${width}.png`) })
      }
      await page.evaluate(() => {
        const r = qa.load('games/bicycle/rules.js'); const s = qa.bicycleState
        Object.assign(s, r.initialState()); r.begin(s); s.x = 1100; s.angle = r.roadAngle(s.x); s.y = r.supportY(s.x, s.angle)
        r.press(s); s.y -= 3000
        for (let i = 0; i < 500 && s.rotation < 2 * r.TAU; i++) r.tick(s, 8)
        if (s.airFlips !== 2 || s.flips !== 0) throw new Error('Live double flip count mismatch')
        r.release(s); for (let i = 0; i < 20; i++) r.tick(s, 8)
        s.y = r.supportY(s.x, s.angle) + .01; s.vy = 100
        if (!r.land(s) || s.flips !== 2 || s.score !== 300) throw new Error('Double flip landing count mismatch')
        s.cameraY = r.terrain(s.x); s.cameraZoom = 1
        qa.load('games/bicycle/renderer.js').draw({ ...qa.bicycleArgs, paused: false })
      })
      await page.screenshot({ path: path.join(output, `double-flip-${width}.png`) })
      const routeChecks = await page.evaluate(() => {
        const r = qa.load('games/bicycle/rules.js')
        const start = x => {
          const s = r.initialState(); Object.assign(s, { x, status: 'running', speed: 500, distance: (x - 80) / 8,
            angle: r.rideAngle(x) }); s.y = r.supportY(x, s.angle); return s
        }
        return [1, 2, 4, 5].map(index => {
          const item = r.route(index); const s = start(item.lip - 90)
          let airborne = false; let landed = false
          for (let i = 0; i < 240 && s.status === 'running' && s.x < item.end + 70; i++) {
            r.tick(s, 8)
            if (!s.grounded) airborne = true
            if (airborne && s.grounded && s.x > item.lip && s.x < item.deckEnd) landed = true
          }
          return { index, airborne, landed, survived: s.status === 'running', cleared: s.routeCleared, score: s.score }
        })
      })
      assert.deepEqual(routeChecks, [1, 2, 4, 5].map(index => ({ index, airborne: true, landed: true, survived: true, cleared: index, score: 50 })))
      for (const [index, name] of [[1, 'highway-drop'], [2, 'tunnel-drop']]) {
        await page.evaluate(index => {
          const r = qa.load('games/bicycle/rules.js'); const item = r.route(index); const s = qa.bicycleState
          const x = item.lip - 80
          Object.assign(s, { x, status: 'running', speed: 500, distance: (x - 80) / 8, angle: r.roadAngle(x),
            grounded: true, held: false, vy: 0, omega: 0, landingTime: 0, crashMotion: null, dropLip: null, messageTime: 0, cameraZoom: 1 })
          s.y = r.supportY(x, s.angle); s.cameraY = r.terrain(x)
          for (let i = 0; i < 36; i++) r.tick(s, 8)
          qa.load('games/bicycle/renderer.js').draw({ ...qa.bicycleArgs, paused: false })
        }, index)
        assert.equal(await page.evaluate(() => qa.bicycleState.grounded), false, 'crossing is a real fall')
        await page.screenshot({ path: path.join(output, `${name}-${width}.png`) })
      }
      const newSeeds = []
      for (const seed of [90123, 77191]) {
        await page.evaluate(seed => {
          const r = qa.load('games/bicycle/rules.js'); r.randomSeed = () => seed
          qa.bicycleState.status = 'over'
          qa.load('games/bicycle/renderer.js').draw({ ...qa.bicycleArgs, paused: true })
        }, seed)
        await click('再骑一次')
        const actual = await page.evaluate(() => ({ seed: qa.bicycleState.seed,
          sections: Array.from({ length: 6 }, (_, i) => {
            const r = qa.load('games/bicycle/rules.js'); return [r.profile(i).name, r.route(i).kind, r.feature(i).lip]
          }) }))
        assert.equal(actual.seed, seed); newSeeds.push(actual.sections)
        await click('暂停')
        for (let index = 0; index < 3; index++) {
          await page.evaluate(index => {
            const r = qa.load('games/bicycle/rules.js'); const s = qa.bicycleState; const item = r.route(index)
            const x = item.kind === 'camp' ? r.landmark(index).x - 45 : item.lip + 80
            Object.assign(s, r.initialState()); s.x = x; s.status = 'running'; s.angle = r.roadAngle(x)
            s.y = r.supportY(x, s.angle); s.cameraY = r.terrain(x); s.distance = (x - 80) / 8
            qa.load('games/bicycle/renderer.js').draw({ ...qa.bicycleArgs, paused: false })
          }, index)
          await page.screenshot({ path: path.join(output, `random-${seed}-${index}-${width}.png`) })
        }
      }
      assert.notDeepEqual(newSeeds[0], newSeeds[1], 'restart really changes the route')
      await page.evaluate(() => qa.emit('Hide', {})); const background = await page.evaluate(() => qa.bicycleState.x)
      await page.waitForTimeout(180); assert.equal(await page.evaluate(() => qa.bicycleState.x), background)
      await page.evaluate(() => qa.emit('Show', {})); assert.equal(await page.evaluate(() => qa.bicyclePaused), true)
      await click('游戏合集'); assert.equal(await page.evaluate(() => qa.events.TouchStart.size), 1)
      assert.ok(await page.evaluate(() => qa.bicycleArt.rider === null && qa.bicycleArt.panorama === null), 'Exit releases image references')
      assert.deepEqual(errors, []); await page.close()
      console.log(`${width}×${height}: fresh randomized routes on restart, accurate double flips, single fall, camper roofs, crossings, performance and lifecycle OK`)
    }
  } finally { await browser.close() }
  fs.writeFileSync(path.join(output, 'performance.json'), JSON.stringify(performanceReport, null, 2) + '\n')
  console.log(JSON.stringify(performanceReport))
  console.log('Preview: ' + preview)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
