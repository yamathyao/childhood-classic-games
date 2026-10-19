const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

async function main() {
  const output = path.resolve(__dirname, '../tmp/qa-roadtrip'); fs.mkdirSync(output, { recursive: true })
  const root = path.resolve(__dirname, 'previews/roadtrip')
  const server = http.createServer((request, response) => {
    const name = new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html'
    if (!/^[a-z-]+\.(html|css|js)$/.test(name)) { response.writeHead(404).end(); return }
    fs.readFile(path.join(root, name), (error, data) => {
      if (error) { response.writeHead(404).end(); return }
      response.setHeader('Content-Type', name.endsWith('.html') ? 'text/html; charset=utf-8' : name.endsWith('.css') ? 'text/css' : 'text/javascript')
      response.end(data)
    })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  let browser
  const report = []
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXECUTABLE || undefined })
    const address = `http://127.0.0.1:${server.address().port}/`
    const sizes = [[1440, 1000], [1280, 900], [768, 1024], [390, 844], [320, 568]]
      .filter(([width]) => !process.env.ROADTRIP_VIEWPORT || String(width) === process.env.ROADTRIP_VIEWPORT)
    for (const [width, height] of sizes) {
      console.log(`Checking ${width} × ${height}`)
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce' })
      const screenshot = async name => {
        if (process.env.ROADTRIP_SKIP_SCREENSHOTS === '1') return
        await page.waitForTimeout(150)
        await page.screenshot({ path: path.join(output, name), fullPage: true, animations: 'disabled', timeout: 15000 })
      }
      const errors = []; page.on('pageerror', error => errors.push(error.message))
      await page.addInitScript(() => {
        let api
        Object.defineProperty(window, 'RoadRules', {
          get: () => api,
          set(value) {
            api = value; const original = api.create
            api.create = options => { window.roadState = original({ ...options, seed: 31 }); return window.roadState }
          }
        })
      })
      await page.goto(address)
      await page.waitForFunction(() => document.querySelectorAll('.car-choice').length === 6)
      assert.equal(await page.locator('#road').count(), 0, 'The selection page contains no driving scene')
      assert.equal(await page.evaluate(() => typeof window.roadState), 'undefined', 'Selection does not start a game')
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Selection overflow at ${width}`)
      await screenshot(`selection-${width}.png`)
      await page.getByRole('button', { name: 'PORSCHE 911', exact: true }).click()
      await page.getByRole('button', { name: '高峰', exact: true }).click()
      await page.getByRole('button', { name: '手动驾驶', exact: true }).click()
      await page.reload()
      assert.equal(await page.locator('[data-model="1"]').getAttribute('aria-pressed'), 'true')
      assert.equal(await page.locator('[data-density="busy"]').getAttribute('aria-pressed'), 'true')
      assert.equal(await page.locator('[data-mode="manual"]').getAttribute('aria-pressed'), 'true')
      await page.getByRole('button', { name: '松弛', exact: true }).click()
      await page.getByRole('button', { name: /自动巡航/ }).click()
      await page.locator('#start').click()
      await page.waitForURL('**/drive.html')
      await page.waitForFunction(() => window.roadState && roadState.status === 'running')
      assert.equal(await page.locator('.car-choice, [data-mode], [data-density]').count(), 0, 'The game contains no selection controls')
      assert.equal(await page.evaluate(() => roadState.model), 1)
      assert.equal(await page.evaluate(() => roadState.density), 'easy')
      assert.equal(await page.evaluate(() => roadState.phase), 'entering')
      assert.match(await page.locator('#warning-title').textContent(), /匝道汇入/)
      const sceneScreenshot = async name => {
        if (process.env.ROADTRIP_SKIP_SCREENSHOTS === '1') return
        await page.locator('#pause').click()
        await page.evaluate(() => { document.querySelector('#overlay').hidden = true })
        await screenshot(`${name}-${width}.png`)
        await page.locator('#pause').click()
      }
      await sceneScreenshot('entry')
      const bounds = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
        controls: [...document.querySelectorAll('.touch-controls button')].map(button => {
          const r = button.getBoundingClientRect(); return { left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
        }) }))
      assert.ok(bounds.width <= width && bounds.height <= height, `Game overflow at ${width}: ${JSON.stringify(bounds)}`)
      assert.ok(bounds.controls.every(r => r.left >= 0 && r.right <= width && r.bottom <= height && r.height >= 40 && r.width >= 40))
      await page.locator('#pause').click()
      await screenshot(`drive-${width}.png`)
      await page.locator('#overlay-action').click()
      await page.evaluate(() => { Object.assign(roadState, { phase: 'driving', distance: 150, lane: 1, targetLane: 1 }); roadState.traffic = [] })
      await page.locator('#road').focus(); await page.keyboard.press('ArrowRight')
      await page.waitForFunction(() => roadState.lane > 1.7)
      await page.keyboard.down('ArrowUp'); await page.waitForFunction(() => roadState.speed * 3.6 > 100); await page.keyboard.up('ArrowUp')
      await page.evaluate(() => { Object.assign(roadState, { distance: 285, lane: 1, targetLane: 1, speed: 10 }); roadState.traffic = [] })
      await page.waitForFunction(() => document.querySelector('#warning-title').textContent.includes('4 → 3'))
      await sceneScreenshot('narrowing')
      await page.evaluate(() => { Object.assign(roadState, { distance: 700, lane: 0, targetLane: 0, speed: 10 }); roadState.traffic = [] })
      await page.waitForFunction(() => document.querySelector('#warning-title').textContent.includes('3 → 2'))
      await sceneScreenshot('taper')
      await page.evaluate(() => { Object.assign(roadState, { distance: 840, lane: 0, targetLane: 0, speed: 10 }); roadState.traffic = [] })
      await page.waitForFunction(() => document.querySelector('#route-lanes').textContent === '2 车道')
      await sceneScreenshot('curve')
      await page.evaluate(() => {
        Object.assign(roadState, { distance: 450, lane: 1, targetLane: 1, speed: 35, lastCamera: -1,
          score: 0, distancePoints: 0, skillPoints: 0, penaltyPoints: 0, distanceBank: 0, speedingTickets: 0 })
        roadState.traffic = []
      })
      await page.waitForFunction(() => !document.querySelector('#camera-alert').hidden)
      assert.equal(await page.locator('#camera-alert').evaluate(el => el.classList.contains('speeding')), true)
      await sceneScreenshot('camera-warning')
      await page.evaluate(() => { Object.assign(roadState, { distance: 499.9, speed: 35 }); roadState.traffic = [] })
      await page.locator('#road').focus(); await page.keyboard.down('ArrowUp')
      await page.waitForFunction(() => roadState.speedingTickets === 1)
      await page.keyboard.up('ArrowUp')
      await page.waitForFunction(() => document.querySelector('#score-feedback').dataset.kind === 'penalty' && !document.querySelector('#score-feedback').hidden)
      assert.match(await page.locator('#score').textContent(), /-200/)
      await screenshot(`camera-capture-${width}.png`)
      await page.evaluate(() => {
        const exit = RoadRoute.exitAt(0)
        Object.assign(roadState, { distance: exit.start - 75, lane: 2, targetLane: 2, speed: 15 })
        roadState.traffic = []
      })
      await page.waitForFunction(() => !document.querySelector('#exit-button').hidden)
      await sceneScreenshot('exit-road')
      await page.locator('#exit-button').click()
      assert.equal(await page.evaluate(() => roadState.exitRequested), true)
      await page.locator('#road').focus(); await page.keyboard.press('KeyE')
      assert.equal(await page.evaluate(() => roadState.exitRequested), false)
      await page.keyboard.press('KeyE')
      await page.waitForFunction(() => roadState.phase === 'exiting')
      await page.evaluate(() => { roadState.distance = roadState.chosenExit.start + 60 })
      await page.waitForTimeout(100)
      await sceneScreenshot('exit-ramp')
      await page.evaluate(() => { roadState.distance = roadState.chosenExit.end - .05 })
      await page.waitForFunction(() => roadState.status === 'finished')
      assert.match(await page.locator('#overlay-title').textContent(), /本程结束/)
      assert.equal(await page.locator('#result-summary').isVisible(), true)
      assert.equal(await page.locator('#result-score').textContent(), String(await page.evaluate(() => roadState.score)))
      assert.equal(await page.locator('#result-penalty').textContent(), '−200')
      const resultBounds = await page.locator('#overlay-action').boundingBox()
      const sceneBounds = await page.locator('#scene').boundingBox()
      assert.ok(resultBounds.y >= sceneBounds.y && resultBounds.y + resultBounds.height <= sceneBounds.y + sceneBounds.height, `Result action fits at ${width}`)
      const finalScore = await page.evaluate(() => roadState.score)
      await page.waitForTimeout(100); assert.equal(await page.evaluate(() => roadState.score), finalScore)
      await screenshot(`result-${width}.png`)
      await page.locator('#overlay-action').click()
      assert.equal(await page.evaluate(() => roadState.phase), 'entering')
      assert.equal(await page.evaluate(() => roadState.score), 0)
      assert.equal(await page.locator('#result-summary').isVisible(), false)
      await page.keyboard.press('Space'); assert.equal(await page.evaluate(() => roadState.status), 'paused')
      const frozen = await page.evaluate(() => roadState.distance); await page.waitForTimeout(100)
      assert.equal(await page.evaluate(() => roadState.distance), frozen)
      // Returning to selection restores the car, mode and density; starting again uses the new choice.
      await page.locator('#back-to-setup').click(); await page.waitForURL(address)
      assert.equal(await page.locator('#road').count(), 0)
      assert.equal(await page.locator('[data-model="1"]').getAttribute('aria-pressed'), 'true')
      assert.equal(await page.locator('[data-mode="cruise"]').getAttribute('aria-pressed'), 'true')
      await page.getByRole('button', { name: '手动驾驶', exact: true }).click()
      await page.locator('#start').click(); await page.waitForURL('**/drive.html')
      await page.waitForFunction(() => window.roadState && roadState.mode === 'manual')
      await page.evaluate(() => { Object.assign(roadState, { phase: 'driving', distance: 150, lane: 1, targetLane: 1 }); roadState.traffic = [] })
      await page.locator('#road').focus(); await page.keyboard.down('ArrowLeft')
      await page.waitForFunction(() => roadState.lane < .65); await page.keyboard.up('ArrowLeft')
      const lane = await page.evaluate(() => roadState.lane)
      await page.waitForTimeout(100); assert.equal(await page.evaluate(() => roadState.lane), lane)
      const gas = page.locator('[data-control="accelerate"]'); const box = await gas.boundingBox()
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down(); await page.waitForTimeout(300); await page.mouse.up()
      assert.equal(await gas.evaluate(button => button.classList.contains('held')), false)
      await page.evaluate(() => {
        Object.assign(roadState, { lane: 1, targetLane: 1, speed: 40 })
        roadState.traffic = [{ id: 900, lane: 2, z: 7, model: 2, speed: 20, desired: 20, passed: false }]
      })
      await page.locator('#road').focus(); await page.keyboard.down('ArrowUp')
      await page.waitForFunction(() => roadState.overtakes > 0); await page.keyboard.up('ArrowUp')
      assert.equal(await page.evaluate(() => roadState.skillPoints), 20)
      await page.waitForFunction(() => document.querySelector('#score-feedback').dataset.kind === 'skill')
      await screenshot(`beautiful-driving-${width}.png`)
      await page.evaluate(() => { roadState.traffic = [{ id: 901, lane: 1, z: 5.6, model: 3, speed: 0, desired: 0, passed: false }] })
      await page.waitForFunction(() => roadState.status === 'crashed')
      assert.equal(await page.evaluate(() => roadState.score), 0)
      assert.equal(await page.locator('#result-score').textContent(), '0')
      assert.match(await page.locator('#overlay-title').textContent(), /积分清零/)
      await screenshot(`accident-${width}.png`)
      await page.locator('#overlay-action').click(); assert.equal(await page.evaluate(() => roadState.status), 'running')
      await page.locator('#help-open').click(); assert.equal(await page.locator('#help').evaluate(dialog => dialog.open), true)
      assert.equal(await page.evaluate(() => roadState.status), 'paused')
      await page.locator('#help-done').click(); await page.locator('#overlay-action').click()
      await page.evaluate(() => window.dispatchEvent(new Event('blur')))
      assert.equal(await page.evaluate(() => roadState.status), 'paused')
      await page.locator('#reset').click(); assert.equal(await page.evaluate(() => roadState.status), 'ready')
      await page.locator('#sound').click(); assert.equal(await page.locator('#sound').getAttribute('aria-label'), '关闭声音')
      await page.locator('#sound').click()
      await page.locator('#scene-start').click(); assert.equal(await page.evaluate(() => roadState.status), 'running')
      await page.locator('#back-to-setup').click(); await page.waitForURL(address)
      assert.equal(await page.locator('[data-mode="manual"]').getAttribute('aria-pressed'), 'true')
      // Browser history restores a paused game, never a hidden active run.
      await page.goBack(); await page.waitForURL('**/drive.html')
      await page.waitForFunction(() => window.roadState)
      assert.ok(['running', 'paused'].includes(await page.evaluate(() => roadState.status)))
      assert.deepEqual(errors, [], `Browser errors at ${width}`)
      report.push({ width, height, errors, passed: true, screenshots: process.env.ROADTRIP_SKIP_SCREENSHOTS !== '1' })
      await page.close()
    }
    const reportName = process.env.ROADTRIP_VIEWPORT ? `report-${process.env.ROADTRIP_VIEWPORT}.json` : 'report.json'
    fs.writeFileSync(path.join(output, reportName), JSON.stringify(report, null, 2))
    console.log(`Roadtrip: ${report.length} viewports passed; points, cameras, exit settlement, separate pages and driving interactions verified.`)
  } finally {
    if (browser) await browser.close()
    await new Promise(resolve => server.close(resolve))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
