const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { browserBoot, modules } = require('./visual-qa.cjs')

async function main() {
  const output = path.resolve(__dirname, '../tmp/qa-driller')
  fs.mkdirSync(output, { recursive: true })
  const preview = path.join(output, 'preview.html')
  fs.writeFileSync(preview, '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>钻地挑战 · 验收预览</title><style>html,body{margin:0;overflow:hidden}canvas{width:100vw;height:100vh;touch-action:none;display:block}</style><canvas></canvas><script>(' + browserBoot.toString() + ')(' + JSON.stringify({ modules, images: {} }).replace(/</g, '\\u003c') + ')</script>')
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXECUTABLE || undefined })
  try {
    for (const [width, height] of [[320, 568], [375, 667], [390, 844]]) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 })
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(pathToFileURL(preview).href)
      await page.waitForFunction(() => window.qa && qa.texts.some(item => item.text.includes('童 年 游 戏 馆')))
      const materialMetrics = await page.evaluate(() => {
        const renderer = qa.load('games/driller/renderer.js')
        const level = qa.load('games/driller/levels.js').levels[0]
        const state = qa.load('games/driller/rules.js').create(level).initialState(42)
        const screen = qa.load('common/screen.js').measure()
        const view = qa.load('games/driller/layout.js').layout(screen, level)
        const surfaces = [0, 1].map(() => {
          const surface = wx.createOffscreenCanvas({ width: screen.width * screen.dpr, height: screen.height * screen.dpr })
          const context = surface.getContext('2d')
          context.scale(screen.dpr, screen.dpr)
          return context
        })
        const [direct, cached] = surfaces
        const painter = renderer.createRenderer()
        const args = { view, level, state, modal: null, best: 0 }
        for (let index = 0; index < 10; index++) {
          const position = view.columns * (2 + Math.floor(index / 5)) + 1 + index % 5
          state.grid[position] = 'X'; state.damage[position] = index % 5
          if (index >= 5) state.danger.push(position)
        }
        renderer.draw({ ...args, context: direct })
        painter.draw({ ...args, context: cached })
        const original = direct.getImageData(0, 0, direct.canvas.width, direct.canvas.height).data
        const optimized = cached.getImageData(0, 0, cached.canvas.width, cached.canvas.height).data
        let totalDifference = 0
        for (let index = 0; index < original.length; index++) totalDifference += Math.abs(original[index] - optimized[index])
        const meanDifference = totalDifference / original.length
        painter.dispose()
        return { meanDifference }
      })
      assert.ok(materialMetrics.meanDifference < 3, 'Texture atlas changed the materials: ' + JSON.stringify(materialMetrics))
      const click = async label => {
        const target = await page.evaluate(value => qa.texts.find(item => item.text === value) || qa.texts.find(item => item.text.includes(value)), label)
        assert.ok(target, 'Missing control: ' + label)
        await page.mouse.click(target.x, target.y)
      }
      await page.evaluate(() => {
        const start = { clientX: 180, clientY: innerHeight - 100, identifier: 77 }
        const end = { ...start, clientY: start.clientY - 1100 }
        qa.emit('TouchStart', { changedTouches: [start], touches: [start] })
        qa.emit('TouchMove', { changedTouches: [end], touches: [end] })
        qa.emit('TouchEnd', { changedTouches: [end], touches: [] })
      })
      await page.screenshot({ path: path.join(output, `collection-${width}.png`) })
      await click('钻地挑战')
      await page.screenshot({ path: path.join(output, `detail-${width}.png`) })
      await click('选择关卡')
      await page.screenshot({ path: path.join(output, `picker-${width}.png`) })
      await click('500 米 · 标准挑战')
      await click('进入游戏')
      await page.screenshot({ path: path.join(output, `board-${width}.png`) })
      await click('←')
      await page.waitForTimeout(1200)
      await click('暂停')
      await page.screenshot({ path: path.join(output, `pause-${width}.png`) })
      const oxygen = await page.evaluate(() => wx.getStorageSync('driller.arcade-500.v2').oxygen)
      assert.ok(oxygen < 100 && oxygen > 95)
      await page.waitForTimeout(500)
      assert.equal(await page.evaluate(() => wx.getStorageSync('driller.arcade-500.v2').oxygen), oxygen)
      await click('返回合集')
      await page.evaluate(() => {
        const level = qa.load('games/driller/levels.js').levels[0]
        const rules = qa.load('games/driller/rules.js').create(level)
        const state = rules.initialState()
        state.grid = state.grid.map((color, position) => color === '#' ? '#' : position < rules.width * (rules.height - 2) ? '.' : 'A')
        state.player = (rules.height - 3) * rules.width + 5
        state.depth = level.targetDepth - 1
        state.started = true; state.steps = 1
        wx.setStorageSync(rules.saveKey, rules.snapshot(state))
        const start = { clientX: 180, clientY: innerHeight - 100, identifier: 76 }
        const end = { ...start, clientY: start.clientY - 1100 }
        qa.emit('TouchStart', { changedTouches: [start], touches: [start] })
        qa.emit('TouchMove', { changedTouches: [end], touches: [end] })
        qa.emit('TouchEnd', { changedTouches: [end], touches: [] })
      })
      await click('钻地挑战')
      await click('继续 · 499 米')
      await click('继续探索')
      await click('↓  钻地')
      await page.waitForFunction(() => qa.texts.some(item => item.text === '下一关'))
      await page.screenshot({ path: path.join(output, `won-${width}.png`) })
      await click('下一关')
      assert.equal(await page.evaluate(() => wx.getStorageSync('driller.currentLevel')), 'arcade-1000')
      await click('游戏合集')
      assert.equal(await page.evaluate(() => qa.events.TouchStart.size), 1)
      await page.evaluate(() => {
        const start = { clientX: 180, clientY: innerHeight - 100, identifier: 78 }
        const end = { ...start, clientY: start.clientY - 1100 }
        qa.emit('TouchStart', { changedTouches: [start], touches: [start] })
        qa.emit('TouchMove', { changedTouches: [end], touches: [end] })
        qa.emit('TouchEnd', { changedTouches: [end], touches: [] })
      })
      await click('钻地挑战')
      await click('选择关卡')
      await click('1000 米 · 深井挑战')
      await click('进入游戏')
      assert.equal(await page.evaluate(() => wx.getStorageSync('driller.currentLevel')), 'arcade-1000')
      await page.screenshot({ path: path.join(output, `challenge-${width}.png`) })
      await click('↓  钻地')
      await page.waitForTimeout(230)
      await page.screenshot({ path: path.join(output, `danger-${width}.png`) })
      assert.deepEqual(errors, [])
      console.log(`${width}x${height}: collection, two courses, real-time oxygen, pause, final-meter fixture and next course passed`)
      await page.close()
    }
  } finally { await browser.close() }
  console.log('Screenshots: ' + output)
}

main().catch(error => { console.error(error); process.exitCode = 1 })
