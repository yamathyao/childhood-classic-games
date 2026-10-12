const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { browserBoot, modules } = require('./visual-qa.cjs')
const rules = require('../games/office/rules.js')
const { fullBin } = require('./office-pile.cjs')

async function main() {
  const output = path.resolve(__dirname, '../tmp/qa-office')
  fs.mkdirSync(output, { recursive: true })
  const preview = path.join(output, 'preview.html')
  fs.writeFileSync(preview, '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>办公室投篮 · 本地预览</title><style>html,body{margin:0;overflow:hidden}canvas{width:100vw;height:100vh;touch-action:none;display:block}</style><canvas></canvas><script>(' + browserBoot.toString() + ')(' + JSON.stringify({ modules, images: {} }).replace(/</g, '\\u003c') + ')</script>')
  const featuresOnly = process.argv.includes('--features-only')
  const overflowing = featuresOnly ? null : rules.snapshot(fullBin())
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXECUTABLE || undefined })
  try {
    for (const [width, height] of [[320, 568], [375, 667], [390, 844]]) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 })
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(pathToFileURL(preview).href)
      await page.waitForFunction(() => window.qa)
      const click = async label => {
        const t = await page.evaluate(label => qa.texts.find(t => t.text === label) || qa.texts.find(t => t.text.includes(label)), label)
        assert.ok(t, 'missing control: ' + label); await page.mouse.click(t.x, t.y)
      }
      const scrollToOffice = () => page.evaluate(() => {
        const t = { clientX: 180, clientY: innerHeight - 100, identifier: 99 }
        const end = { ...t, clientY: -2000 }
        qa.emit('TouchStart', { changedTouches: [t], touches: [t] })
        qa.emit('TouchMove', { changedTouches: [end], touches: [end] })
        qa.emit('TouchEnd', { changedTouches: [end], touches: [] })
      })
      await scrollToOffice()
      await page.screenshot({ path: path.join(output, `collection-${width}.png`) })
      await click('办公室投篮')
      await page.screenshot({ path: path.join(output, `detail-${width}.png`) })
      await click('进入办公室')
      const view = await page.evaluate(() => qa.load('games/office/layout.js').layout(qa.load('common/screen.js').measure()))
      const throwPaper = async milliseconds => {
        await page.mouse.move(view.charge.x, view.charge.y); await page.mouse.down()
        await page.waitForTimeout(milliseconds); await page.mouse.up()
      }
      // Observe the drawn crosshair, then reproduce the high-angle reversal with real swipes.
      await page.evaluate(() => {
        const c = document.querySelector('canvas').getContext('2d'); const arc = c.arc.bind(c)
        c.arc = (x, y, radius, ...rest) => {
          if (radius === 10) qa.aimMark = { x, y }
          return arc(x, y, radius, ...rest)
        }
      })
      const dragAim = async dy => {
        const x = width / 2; const y = view.scene.y + view.scene.h / 2
        await page.mouse.move(x, y); await page.mouse.down()
        await page.mouse.move(x, y + dy); await page.mouse.up()
      }
      await dragAim(0)
      const original = await page.evaluate(() => qa.aimMark)
      const pitchScale = await page.evaluate(() => {
        const r = qa.load('games/office/rules.js'); const screen = qa.load('common/screen.js').measure()
        const rect = qa.load('games/office/layout.js').layout(screen).scene
        return qa.load('games/office/renderer.js').aimGuide(rect, r.initialState()).pitchScale
      })
      await dragAim(-(.96 - .48) * pitchScale)
      const high = await page.evaluate(() => qa.aimMark)
      assert.ok(high.y < original.y)
      await dragAim(-8)
      const raised = await page.evaluate(() => qa.aimMark)
      assert.ok(Math.abs(raised.y - high.y + 8) < 1.5, 'Up swipes must still move the crosshair up at high angles')
      await page.screenshot({ path: path.join(output, `aim-high-${width}.png`) })
      await page.mouse.move(view.charge.x, view.charge.y); await page.mouse.down()
      await page.waitForTimeout(550)
      assert.deepEqual(await page.evaluate(() => qa.aimMark), raised, 'Charging cannot move the direction crosshair')
      assert.ok(await page.evaluate(() => qa.texts.every(t => !/落点|轨迹|碰撞点/.test(t.text))), 'Charging cannot show landing or trajectory hints')
      await page.screenshot({ path: path.join(output, `aim-high-charging-${width}.png`) })
      await page.evaluate(() => qa.emit('TouchCancel', {})); await page.mouse.up()
      await dragAim(35)
      const lowered = await page.evaluate(() => qa.aimMark)
      assert.ok(Math.abs(lowered.y - raised.y - 35) < 1.5)
      const pitch = await page.evaluate(() => wx.getStorageSync('office.paper-toss.v1').pitch)
      await dragAim((pitch - .48) * pitchScale)
      assert.ok(Math.abs((await page.evaluate(() => qa.aimMark)).y - original.y) < 1.5)
      if (featuresOnly) {
        await page.screenshot({ path: path.join(output, `office-${width}.png`) })
        await page.mouse.move(view.charge.x, view.charge.y); await page.mouse.down()
        await page.waitForTimeout(550)
        await page.screenshot({ path: path.join(output, `charging-${width}.png`) })
        await page.evaluate(() => qa.emit('TouchCancel', {})); await page.mouse.up()
      }
      if (!featuresOnly) {
      const opacity = await page.evaluate(() => {
        const renderer = qa.load('games/office/renderer.js')
        const rules = qa.load('games/office/rules.js')
        const screen = qa.load('common/screen.js').measure()
        const view = qa.load('games/office/layout.js').layout(screen)
        function render(ball) {
          const canvas = wx.createOffscreenCanvas({ width: screen.width * 2, height: screen.height * 2 })
          const context = canvas.getContext('2d'); context.scale(2, 2)
          const state = rules.initialState()
          // Keep the aim preview away from the bin when measuring its opacity.
          state.yaw = -.6
          if (ball) state.balls.push(ball)
          renderer.draw({ context, view, state })
          return context.getImageData(0, 0, canvas.width, canvas.height).data
        }
        const empty = render(null)
        const hidden = render({ id: 1, x: rules.BIN.x, y: rules.BIN.bottom + rules.RADIUS, z: rules.BIN.z })
        const exposed = render({ id: 1, x: rules.BIN.x, y: rules.BIN.height + rules.RADIUS * 1.5, z: rules.BIN.z })
        let hiddenDifference = 0; let exposedDifference = 0
        for (let index = 0; index < empty.length; index++) {
          if (empty[index] !== hidden[index]) hiddenDifference++
          if (empty[index] !== exposed[index]) exposedDifference++
        }
        return { hiddenDifference, exposedDifference }
      })
      assert.equal(opacity.hiddenDifference, 0, 'The opaque bin must hide paper resting at its bottom')
      assert.ok(opacity.exposedDifference > 100, 'Paper above the rim must remain visible')
      await page.screenshot({ path: path.join(output, `office-${width}.png`) })
      await page.mouse.move(view.charge.x, view.charge.y); await page.mouse.down()
      await page.waitForTimeout(550)
      await page.screenshot({ path: path.join(output, `charging-${width}.png`) })
      // Capturing a screenshot can take variable time while the button is held.
      // Cancel that preview gesture, then test an uninterrupted 1120 ms throw.
      await page.evaluate(() => qa.emit('TouchCancel', {}))
      await page.mouse.up()
      assert.equal(await page.evaluate(() => wx.getStorageSync('office.paper-toss.v1').throws), 0)
      await page.mouse.down()
      await page.waitForTimeout(1120)
      await page.mouse.up()
      await page.waitForTimeout(180)
      await page.screenshot({ path: path.join(output, `flight-${width}.png`) })
      await page.waitForTimeout(3500)
      let saved = await page.evaluate(() => wx.getStorageSync('office.paper-toss.v1'))
      assert.equal(saved.throws, 1); assert.equal(saved.scored, 1)
      assert.equal(saved.balls.length, 1); assert.equal(saved.balls[0].asleep, true)
      await page.screenshot({ path: path.join(output, `hit-${width}.png`) })
      // Dragging the scene changes both direction axes, but never throws.
      await page.mouse.move(width / 2, view.scene.y + view.scene.h / 2); await page.mouse.down()
      await page.mouse.move(width / 2 + 45, view.scene.y + view.scene.h / 2 - 30); await page.mouse.up()
      saved = await page.evaluate(() => wx.getStorageSync('office.paper-toss.v1'))
      assert.ok(saved.yaw > 0 && saved.pitch > .48); assert.equal(saved.throws, 1)
      await click('暂停')
      await page.screenshot({ path: path.join(output, `pause-${width}.png`) })
      await click('游戏合集')
      assert.equal(await page.evaluate(() => qa.events.TouchStart.size), 1)
      // Seed a physically simulated pile to inspect retained paper and depth ordering.
      await page.evaluate(() => {
        const r = qa.load('games/office/rules.js'); const state = r.initialState()
        for (let shot = 0; shot < 18; shot++) {
          r.launch(state, 1120)
          for (let frame = 0; frame < 180; frame++) r.tick(state, 1000 / 60)
        }
        state.yaw = r.DEFAULT_AIM.yaw - .28; r.launch(state, 250)
        for (let frame = 0; frame < 480; frame++) r.tick(state, 1000 / 60)
        state.yaw = r.DEFAULT_AIM.yaw
        wx.setStorageSync(r.SAVE_KEY, r.snapshot(state))
      })
      await scrollToOffice(); await click('办公室投篮'); await click('继续投篮')
      await page.screenshot({ path: path.join(output, `pile-${width}.png`) })
      saved = await page.evaluate(() => wx.getStorageSync('office.paper-toss.v1'))
      assert.equal(saved.balls.length, 19); assert.ok(saved.scored >= 10)
      await page.reload(); await page.waitForFunction(() => window.qa)
      await scrollToOffice(); await click('办公室投篮'); await click('继续投篮')
      assert.equal(await page.evaluate(() => wx.getStorageSync('office.paper-toss.v1').balls.length), 19)
      // Manual cleanup starts fresh counters while preserving the player's aim.
      await click('清理纸团')
      saved = await page.evaluate(() => wx.getStorageSync('office.paper-toss.v1'))
      assert.equal(saved.balls.length, 0); assert.equal(saved.cleared, 0)
      assert.equal(saved.throws, 0); assert.equal(saved.scored, 0)
      await page.reload(); await page.waitForFunction(() => window.qa)
      await scrollToOffice(); await click('办公室投篮'); await click('进入办公室')
      assert.equal(await page.evaluate(() => wx.getStorageSync('office.paper-toss.v1').balls.length), 0)
      await throwPaper(1120)
      await page.waitForFunction(() => wx.getStorageSync('office.paper-toss.v1').balls[0]?.asleep, null, { timeout: 6000 })
      saved = await page.evaluate(() => wx.getStorageSync('office.paper-toss.v1'))
      assert.equal(saved.balls.length, 1); assert.equal(saved.balls[0].scored, true)
      const serial = saved.reactionSerial
      for (let miss = 1; miss <= 4; miss++) {
        await throwPaper(200)
        await page.waitForFunction(expected => wx.getStorageSync('office.paper-toss.v1').reactionSerial === expected,
          serial + miss, { timeout: 6000 })
        saved = await page.evaluate(() => wx.getStorageSync('office.paper-toss.v1'))
        assert.equal(saved.missStreak, miss)
        const dialogue = require('../games/office/dialogue.js').LINES.find(line => line.id === saved.reaction.id)
        assert.ok(await page.evaluate(prefix => qa.texts.some(t => t.text.startsWith(prefix)), dialogue.text.slice(0, 5)))
        assert.equal(dialogue.mood, miss === 4 ? 'angry' : miss === 3 ? 'warning' : 'mild')
        await page.screenshot({ path: path.join(output, `bubble-${miss}-${width}.png`) })
      }
      await page.waitForFunction(() => wx.getStorageSync('office.paper-toss.v1').balls.length === 1,
        null, { timeout: 8000 })
      saved = await page.evaluate(() => wx.getStorageSync('office.paper-toss.v1'))
      assert.equal(saved.cleared, 4); assert.equal(saved.throws, 5)
      assert.equal(saved.scored, 1); assert.equal(saved.balls[0].scored, true)
      await page.screenshot({ path: path.join(output, `auto-clean-${width}.png`) })
      // The shared fixture falls under gravity into a full bin; rendering must expose the pile and spill.
      await click('游戏合集')
      await page.evaluate(state => wx.setStorageSync('office.paper-toss.v1', state), overflowing)
      await scrollToOffice(); await click('办公室投篮'); await click('继续投篮')
      await click('暂停')
      // Capture the scene without the pause overlay, using the same retained physics state.
      await page.evaluate(() => {
        const screen = qa.load('common/screen.js').measure()
        qa.load('games/office/renderer.js').draw({ context: document.querySelector('canvas').getContext('2d'),
          view: qa.load('games/office/layout.js').layout(screen),
          state: qa.load('games/office/rules.js').restore(wx.getStorageSync('office.paper-toss.v1')) })
      })
      await page.screenshot({ path: path.join(output, `overflow-${width}.png`) })
      await click('清理纸团')
      assert.equal(await page.evaluate(() => wx.getStorageSync('office.paper-toss.v1').balls.length), 0)
      await click('游戏合集')
      await page.evaluate(() => {
        const r = qa.load('games/office/rules.js'); const state = r.initialState(); const person = r.PEOPLE[0]
        state.yaw = Math.atan2(person.x - r.ORIGIN.x, person.z - r.ORIGIN.z)
        wx.setStorageSync(r.SAVE_KEY, r.snapshot(state))
      })
      await scrollToOffice(); await click('办公室投篮'); await click('进入办公室')
      // Actual controls launch into the visible co-worker. Outcomes must react on contact.
      for (let hit = 1; hit <= 3; hit++) {
        await throwPaper(hit === 1 ? 600 : 800)
        await page.waitForFunction(count => wx.getStorageSync('office.paper-toss.v1').personHits[0] === count,
          hit, { timeout: 6000 })
        saved = await page.evaluate(() => wx.getStorageSync('office.paper-toss.v1'))
        const line = require('../games/office/dialogue.js').LINES.find(line => line.id === saved.reaction.id)
        assert.equal(line.kind, 'hit'); assert.equal(line.speaker, 0)
        assert.equal(line.mood, hit === 1 ? 'surprised' : hit === 2 ? 'warning' : 'angry')
        assert.equal(saved.balls[0].personHit.part, 'body')
        await page.screenshot({ path: path.join(output, `person-hit-${hit}-${width}.png`) })
        if (hit < 3) await page.waitForTimeout(4800)
      }
      await page.waitForFunction(() => wx.getStorageSync('office.paper-toss.v1').cleared === 3,
        null, { timeout: 8000 })
      assert.equal(await page.evaluate(() => wx.getStorageSync('office.paper-toss.v1').balls.length), 0)
      await throwPaper(800)
      await page.waitForFunction(() => wx.getStorageSync('office.paper-toss.v1').balls[0]?.personHit?.part === 'head',
        null, { timeout: 6000 })
      saved = await page.evaluate(() => wx.getStorageSync('office.paper-toss.v1'))
      assert.equal(require('../games/office/dialogue.js').LINES.find(line => line.id === saved.reaction.id).mood, 'hurt')
      await page.screenshot({ path: path.join(output, `head-hit-${width}.png`) })
      await click('清理纸团')
      }
      // Inspect all prop outcomes produced by real deterministic throws.
      for (const [id, pitch, held] of [['cup', .12, 1400], ['plant', .28, 1520], ['bell', .36, 1280]]) {
        await click('游戏合集')
        await page.evaluate(({ id, pitch, held }) => {
          const r = qa.load('games/office/rules.js'); const s = r.initialState()
          const prop = r.PROPS.find(prop => prop.id === id)
          s.yaw = Math.atan2(prop.x + prop.w / 2 - r.ORIGIN.x, prop.z - r.ORIGIN.z); s.pitch = pitch
          const ball = r.launch(s, held)
          for (let step = 0; step < 240 && !ball.propHit; step++) r.tick(s, r.STEP * 1000)
          if (ball.propHit !== id) throw new Error('Prop unreachable: ' + id)
          wx.setStorageSync(r.SAVE_KEY, r.snapshot(s))
        }, { id, pitch, held })
        await scrollToOffice(); await click('办公室投篮'); await click('继续投篮')
        await page.screenshot({ path: path.join(output, `${id}-${width}.png`) })
      }
      assert.ok(await page.evaluate(() => qa.texts.some(t => t.text.includes('GAME OVER'))))
      const ended = await page.evaluate(() => wx.getStorageSync('office.paper-toss.v1'))
      await page.mouse.move(40, view.scene.y + 100); await page.mouse.down()
      await page.mouse.move(140, view.scene.y + 80); await page.mouse.up()
      assert.equal(await page.evaluate(() => wx.getStorageSync('office.paper-toss.v1').throws), ended.throws)
      await page.reload(); await page.waitForFunction(() => window.qa)
      await scrollToOffice(); await click('办公室投篮'); await click('继续投篮')
      assert.ok(await page.evaluate(() => qa.texts.some(t => t.text.includes('GAME OVER'))))
      await click('重新开始')
      assert.equal(await page.evaluate(() => wx.getStorageSync('office.paper-toss.v1').throws), 0)
      // The eighth hit uses the actual controls, including boss input gating.
      await click('游戏合集')
      await page.evaluate(() => {
        const r = qa.load('games/office/rules.js'); const s = r.initialState(); const p = r.PEOPLE[0]
        s.yaw = Math.atan2(p.x - r.ORIGIN.x, p.z - r.ORIGIN.z)
        s.throws = 7; s.cleared = 7; s.nextId = 8; s.totalPersonHits = 7
        wx.setStorageSync(r.SAVE_KEY, r.snapshot(s))
      })
      await scrollToOffice(); await click('办公室投篮'); await click('继续投篮')
      await throwPaper(800)
      await page.waitForFunction(() => wx.getStorageSync('office.paper-toss.v1').gameOver === 'people', null, { timeout: 6000 })
      await page.screenshot({ path: path.join(output, `boss-${width}.png`) })
      await click('重新开始')
      assert.equal(await page.evaluate(() => wx.getStorageSync('office.paper-toss.v1').totalPersonHits), 0)
      assert.deepEqual(errors, [])
      console.log(`${width}x${height}: ${featuresOnly ? 'aim and props/boss/restart/reload' : 'aim, collisions, prop outcomes, boss/game over, cleanup, overflow and reload'} passed`)
      await page.close()
    }
  } finally { await browser.close() }
  console.log('Preview: ' + preview)
}

main().catch(error => { console.error(error); process.exitCode = 1 })
