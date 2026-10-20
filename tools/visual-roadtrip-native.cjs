const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { browserBoot, modules } = require('./visual-qa.cjs')

async function main() {
  const output = path.resolve(__dirname, '../tmp/qa-roadtrip-native'); fs.mkdirSync(output, { recursive: true })
  const images = {}; const root = path.resolve(__dirname, '..')
  function collect(directory) {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, item.name)
      if (item.isDirectory()) collect(file)
      else if (/\.(png|jpg)$/.test(item.name)) images[path.relative(root, file).replace(/\\/g, '/')] =
        `data:image/${item.name.endsWith('.png') ? 'png' : 'jpeg'};base64,` + fs.readFileSync(file).toString('base64')
    }
  }
  collect(path.join(root, 'assets'))
  const preview = path.join(output, 'preview.html')
  fs.writeFileSync(preview, '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>滴滴叭叭 · 微信小游戏本地预览</title><style>html,body{margin:0;overflow:hidden;background:#efe6d4}canvas{width:100vw;height:100vh;touch-action:none;display:block}</style>' +
    '<canvas></canvas><script>(' + browserBoot.toString() + ')(' + JSON.stringify({ modules, images }).replace(/</g, '\\u003c') + ')</script></html>')
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXECUTABLE || undefined })
  const report = []
  try {
    const sizes = [[320, 568, 24], [320, 568, 64], [375, 667, 24], [390, 844, 88]]
      .filter(([w, , top]) => !process.env.ROADTRIP_NATIVE_VIEWPORT || process.env.ROADTRIP_NATIVE_VIEWPORT === w + '-' + top)
    for (const [width, height, top] of sizes) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: +(process.env.ROADTRIP_NATIVE_DPR || 1), reducedMotion: 'reduce' })
      const errors = []; page.on('pageerror', error => errors.push(error.message)); const suffix = width + '-' + top
      await page.addInitScript(() => { localStorage.clear(); localStorage.setItem('collection.order.v1', JSON.stringify(['roadtrip'])) })
      await page.goto(pathToFileURL(preview).href); await page.waitForFunction(() => window.qa)
      await page.evaluate(top => {
        if (top > 24) { wx.getMenuButtonBoundingClientRect = () => ({ bottom: top - 8 }); qa.emit('WindowResize', {}) }
        const renderer = qa.load('games/roadtrip/renderer.js'); const original = renderer.draw
        renderer.draw = args => { qa.roadtrip = args; original(args) }
      }, top)
      const clickText = async label => {
        const p = await page.evaluate(label => qa.texts.find(t => t.text === label) || qa.texts.find(t => t.text.includes(label)), label)
        assert.ok(p, label); await page.mouse.click(p.x, p.y)
      }
      const tap = async (key, index) => {
        const r = await page.evaluate(({ key, index }) => {
          const v = qa.roadtrip.view
          return index == null ? v[key] || v.controls.find(r => r.key === key) : v[key][index]
        }, { key, index })
        assert.ok(r, key); await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2)
      }
      const screenshot = async name => {
        if (process.env.ROADTRIP_SKIP_SCREENSHOTS === '1') return
        await page.screenshot({ path: path.join(output, name + '-' + suffix + '.png'), animations: 'disabled', timeout: 15000 })
      }
      await screenshot('home'); await clickText('滴滴叭叭'); await screenshot('detail'); await clickText('选择座驾')
      assert.equal(await page.evaluate(() => qa.roadtrip.page), 'setup')
      const fits = await page.evaluate(() => {
        const v = qa.roadtrip.view
        return v.densityY + 76 < v.start.y && v.scene.h > 240 && [...v.cars, ...v.modes, ...v.controls, v.start].every(r =>
          r.x >= 0 && r.y >= v.top && r.x + r.w <= innerWidth && r.y + r.h <= innerHeight - v.bottom)
      }); assert.ok(fits, 'Layout ' + suffix)
      await screenshot('setup'); await tap('help'); await screenshot('help'); await tap('close')
      await tap('cars', 4); await tap('modes', 1); await tap('densities', 1); await tap('start')
      assert.equal(await page.evaluate(() => qa.roadtrip.state.phase), 'entering'); await screenshot('entry')
      await page.evaluate(() => {
        const a = qa.roadtrip; Object.assign(a.state, { phase: 'driving', distance: 150, lane: 1, targetLane: 1, traffic: [] })
        const t = key => { const r = a.view.controls.find(r => r.key === key); return { identifier: key === 'left' ? 10 : 20, clientX: r.x + r.w / 2, clientY: r.y + r.h / 2 } }
        qa.emit('TouchStart', { changedTouches: [t('left')], touches: [t('left')] })
        qa.emit('TouchStart', { changedTouches: [t('accelerate')], touches: [t('left'), t('accelerate')] })
      })
      await page.waitForTimeout(150)
      assert.ok(await page.evaluate(() => qa.roadtrip.input.left && qa.roadtrip.input.accelerate && qa.roadtrip.state.lane < 1))
      await page.evaluate(() => qa.emit('Hide', {})); const frozen = await page.evaluate(() => JSON.stringify(qa.roadtrip.state))
      await page.waitForTimeout(150); await page.evaluate(() => qa.emit('Show', {}))
      assert.equal(await page.evaluate(() => JSON.stringify(qa.roadtrip.state)), frozen)
      assert.equal(await page.evaluate(() => qa.roadtrip.input.accelerate), false); await screenshot('paused'); await tap('resume')
      // Observe real timed traffic decisions, including a blocked passing lane.
      for (const blocked of [false, true]) {
        await page.evaluate(blocked => {
          const s = qa.roadtrip.state
          Object.assign(s, { phase: 'driving', distance: 450, lane: 2, targetLane: 2, speed: 20, noticeTime: 0,
            traffic: [{ id: 201, model: 1, lane: 1, targetLane: 1, z: 4, speed: 26, desired: 28, laneCooldown: 0 },
              { id: 202, model: 5, lane: 1, targetLane: 1, z: 36, speed: 15, desired: 15 }] })
          if (blocked) s.traffic.push({ id: 203, model: 0, lane: 0, targetLane: 0, z: 6, speed: 26, desired: 26 })
        }, blocked)
        await page.waitForFunction(blocked => {
          const car = qa.roadtrip.state.traffic.find(car => car.id === 201)
          return blocked ? car.targetLane === 1 && car.speed < 25.5 : car.targetLane === 0 && car.lane < .6
        }, blocked)
        assert.equal(await page.evaluate(() => qa.roadtrip.state.status), 'running')
        await screenshot(blocked ? 'traffic-braking' : 'traffic-overtaking')
      }
      await page.evaluate(() => Object.assign(qa.roadtrip.state, { mode: 'cruise', phase: 'driving', distance: 120,
        lane: 1, targetLane: 1, speed: 20, noticeTime: 0,
        traffic: [{ id: 301, model: 0, lane: 2, targetLane: 2, z: 9.2, speed: 20, desired: 20 }] }))
      await tap('right')
      assert.equal(await page.evaluate(() => qa.roadtrip.state.targetLane), 2, 'A near-bumper gap allows a player lane change')
      await page.waitForFunction(() => qa.roadtrip.state.lane > 1.5)
      assert.equal(await page.evaluate(() => qa.roadtrip.state.status), 'running')
      await screenshot('tight-pass')
      await page.evaluate(() => { qa.roadtrip.state.mode = 'manual' })
      const themes = await page.evaluate(() => qa.load('games/roadtrip/scenery.js').THEMES.map(t => t.id))
      for (let i = 0; i < themes.length; i++) {
        await page.evaluate(i => Object.assign(qa.roadtrip.state, { phase: 'driving', distance: i * 320 + 144, lane: 1, targetLane: 1,
          traffic: [], speed: 20, noticeTime: 0, scoreEventTime: 0, exitRequested: false, chosenExit: null }), i)
        await page.waitForTimeout(50)
        assert.equal(await page.evaluate(() => qa.load('games/roadtrip/scenery.js').themeAt(qa.roadtrip.state.distance).id), themes[i])
        await screenshot('scenery-' + themes[i])
      }
      await page.evaluate(() => Object.assign(qa.roadtrip.state, { distance: 7 * 320 + 88, traffic: [], noticeTime: 0 }))
      await page.waitForTimeout(50); await screenshot('bridge-tower')
      await page.evaluate(() => Object.assign(qa.roadtrip.state, { phase: 'driving', distance: 240, lane: 1, targetLane: 1, traffic: [], speed: 20 }))
      await page.waitForTimeout(50); await screenshot('narrowing')
      await page.evaluate(() => Object.assign(qa.roadtrip.state, { distance: 499.98, speed: 100 / 3.6, traffic: [], score: 0,
        distancePoints: 0, skillPoints: 0, penaltyPoints: 0, distanceBank: 0, lastCamera: -1, scoreEvent: null, scoreEventTime: 0 }))
      await page.waitForFunction(() => qa.roadtrip.state.speedingTickets === 1)
      assert.equal(await page.evaluate(() => qa.roadtrip.state.penaltyPoints), 200); await screenshot('camera-penalty')
      // The third lane is a physical exit; drive through without tapping the assist button.
      await page.evaluate(() => Object.assign(qa.roadtrip.state, { distance: 1575, speed: 20, lane: 2, targetLane: 2, traffic: [], scoreEventTime: 0, exitRequested: false }))
      await page.waitForTimeout(40); await screenshot('exit-approach')
      assert.equal(await page.evaluate(() => qa.load('games/roadtrip/route.js').sample(qa.roadtrip.state.distance).lanes), 3)
      await page.waitForFunction(() => qa.roadtrip.state.phase === 'exiting')
      await screenshot('exit')
      await page.evaluate(() => { const s = qa.roadtrip.state; s.distance = s.chosenExit.end - .01 })
      await page.waitForFunction(() => qa.roadtrip.state.status === 'finished'); await screenshot('result')
      const record = await page.evaluate(() => JSON.parse(localStorage.getItem('roadtrip.records.v1')))
      assert.equal(record.trips, 1); assert.equal(record.arrivals, 1)
      await page.evaluate(() => { qa.emit('Hide', {}); qa.emit('Show', {}) })
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('roadtrip.records.v1'))), record)
      await tap('choose'); await tap('back'); assert.equal(await page.evaluate(() => qa.events.TouchStart.size), 1)
      // Reloaded settings persist; browsing and returning does not leave active game listeners.
      await clickText('滴滴叭叭'); await clickText('选择座驾')
      assert.equal(await page.evaluate(() => qa.roadtrip.settings.model), 4)
      assert.equal(await page.evaluate(() => qa.roadtrip.settings.mode), 'manual')
      await tap('back'); assert.deepEqual(errors, [], suffix)
      report.push({ width, height, top, themes, passed: true }); console.log(suffix + ': collection, setup, ' + themes.length + ' landscapes, touch, lifecycle, camera, exit and settlement passed')
      await page.close()
    }
  } finally { await browser.close() }
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
  console.log('Preview: ' + preview)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
