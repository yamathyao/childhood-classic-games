const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { browserBoot, modules } = require('./visual-qa.cjs')

async function main() {
  const output = path.resolve(__dirname, '../tmp/qa-twentyfour-native'); fs.mkdirSync(output, { recursive: true })
  const preview = path.join(output, 'preview.html'); const images = {}
  function collect(directory) {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, item.name)
      if (item.isDirectory()) collect(file)
      else if (/\.(png|jpg)$/.test(item.name)) images[path.relative(path.resolve(__dirname, '..'), file).replace(/\\/g, '/')] =
        `data:image/${item.name.endsWith('.png') ? 'png' : 'jpeg'};base64,` + fs.readFileSync(file).toString('base64')
    }
  }
  collect(path.resolve(__dirname, '../assets'))
  fs.writeFileSync(preview, '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>算 24 点 · 合集预览</title><style>html,body{margin:0;overflow:hidden;background:#efe6d4}canvas{width:100vw;height:100vh;touch-action:none;display:block}</style>' +
    '<canvas></canvas><script>(' + browserBoot.toString() + ')(' + JSON.stringify({ modules, images }).replace(/</g, '\\u003c') + ')</script></html>')
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXECUTABLE || undefined })
  try {
    for (const [width, height, menuTop] of [[320, 568, 24], [320, 568, 64], [375, 667, 24], [390, 844, 88]]) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 }); const errors = []
      page.on('pageerror', error => errors.push(error.message))
      const suffix = width + '-' + menuTop
      await page.addInitScript(() => localStorage.clear())
      await page.goto(pathToFileURL(preview).href)
      await page.waitForFunction(() => window.qa)
      await page.evaluate(top => {
        if (top > 24) { wx.getMenuButtonBoundingClientRect = () => ({ bottom: top - 8 }); qa.emit('WindowResize', {}) }
        const renderer = qa.load('games/twentyfour/renderer.js'); const draw = renderer.draw
        renderer.draw = args => {
          qa.twentyfour = args; qa.formulaCaret = null
          const c = args.context; const fillRect = c.fillRect
          c.fillRect = function (...rect) {
            if (this.fillStyle === '#315747' && rect[2] === 1 && rect[1] === args.view.formula.y + 11) qa.formulaCaret = rect
            return fillRect.apply(this, rect)
          }
          try { draw(args) } finally { c.fillRect = fillRect }
        }
      }, menuTop)
      const clickText = async label => {
        const point = await page.evaluate(label => qa.texts.find(item => item.text === label) || qa.texts.find(item => item.text.includes(label)), label)
        assert.ok(point, 'Missing label: ' + label); await page.mouse.click(point.x, point.y)
      }
      const tap = async name => {
        const rect = await page.evaluate(name => {
          const v = qa.twentyfour.view
          return v[name] || v.keys.find(key => key.key === name)
        }, name)
        assert.ok(rect, name); await page.mouse.click(rect.x + rect.w / 2, rect.y + rect.h / 2)
      }
      const enter = async () => {
        await page.evaluate(() => {
          const first = { clientX: innerWidth / 2, clientY: innerHeight - 130, identifier: 3 }
          const last = { ...first, clientY: -3000 }
          qa.emit('TouchStart', { changedTouches: [first], touches: [first] })
          qa.emit('TouchMove', { changedTouches: [last], touches: [last] })
          qa.emit('TouchEnd', { changedTouches: [last], touches: [] })
        })
        await clickText('算 24 点')
        await page.screenshot({ path: path.join(output, 'detail-' + suffix + '.png') })
        await clickText('开始计算')
      }
      await enter()
      const assertFits = async () => {
        const fits = await page.evaluate(() => {
          const v = qa.twentyfour.view
          return v.cards.every(rect => rect.x >= 0 && rect.x + rect.w <= innerWidth + .01 && rect.y >= v.top + 65 && rect.y + rect.h <= v.swap.y) &&
            v.keys.every(rect => rect.w >= 44 && rect.h >= 36 && rect.y + rect.h <= innerHeight - v.bottom)
        }); assert.ok(fits, 'Native layout: ' + suffix)
      }
      await assertFits(); await page.screenshot({ path: path.join(output, 'ready-' + suffix + '.png') })
      await tap('help'); await page.screenshot({ path: path.join(output, 'help-' + suffix + '.png') })
      await tap('7'); assert.equal(await page.evaluate(() => qa.twentyfour.state.expression), '')
      await tap('close')
      const formulaPoint = async cursor => page.evaluate(cursor => {
        const { context: c, state: s, view: v } = qa.twentyfour
        const drawn = qa.texts.find(t => t.text === s.expression)
        c.save(); c.font = `${v.compact ? 20 : 22}px monospace`
        const x = drawn.x + c.measureText(s.expression.slice(0, cursor)).width; c.restore()
        return { x, y: v.formula.y + v.formula.h / 2, origin: drawn.x, cursor: s.cursor, caret: qa.formulaCaret[0] }
      }, cursor)
      const assertCaret = async cursor => {
        const p = await formulaPoint(cursor)
        assert.equal(p.cursor, cursor); assert.ok(Math.abs(p.caret - p.x) < .01, 'Caret follows actual text width')
        return p
      }
      const shortFormula = '(6−4)×3÷2+1'
      for (const key of shortFormula) await tap(key)
      for (let cursor = shortFormula.length; cursor >= 0; cursor--) {
        await assertCaret(cursor)
        if (cursor) await tap('left')
      }
      for (let cursor = 0; cursor <= shortFormula.length; cursor++) {
        const p = await formulaPoint(cursor); await page.mouse.click(p.x, p.y); await assertCaret(cursor)
      }
      await page.screenshot({ path: path.join(output, 'cursor-' + suffix + '.png') })
      await tap('clear')
      const longFormula = shortFormula.repeat(5)
      for (const key of longFormula) await tap(key)
      const end = await assertCaret(longFormula.length)
      await tap('left'); assert.equal((await assertCaret(longFormula.length - 1)).origin, end.origin)
      const target = longFormula.length - 6; const point = await formulaPoint(target)
      await page.mouse.click(point.x, point.y)
      assert.equal((await assertCaret(target)).origin, end.origin)
      await tap('7')
      assert.equal(await page.evaluate(() => qa.twentyfour.state.expression), longFormula.slice(0, target) + '7' + longFormula.slice(target))
      await page.screenshot({ path: path.join(output, 'cursor-scrolled-' + suffix + '.png') })
      for (let cursor = target + 1; cursor > 0; cursor--) await tap('left')
      await assertCaret(0)
      for (let cursor = 0; cursor < longFormula.length + 1; cursor++) await tap('right')
      await assertCaret(longFormula.length + 1)
      await tap('clear')
      await tap('hint'); await tap('hint')
      const firstCard = await page.evaluate(() => qa.twentyfour.view.cards[0])
      await page.mouse.click(firstCard.x + 12, firstCard.y + 20)
      assert.equal(await page.evaluate(() => qa.twentyfour.state.expression), '3'); await tap('clear')
      for (const key of ['(', '6', '+', '4', '−', '2', ')', '×', '3']) await tap(key)
      await tap('submit'); assert.equal(await page.evaluate(() => qa.twentyfour.state.completed), true)
      assert.equal(await page.evaluate(() => qa.twentyfour.state.solved), 1)
      await page.screenshot({ path: path.join(output, 'success-' + suffix + '.png') })
      await tap('delete'); await tap('3'); await tap('submit'); assert.equal(await page.evaluate(() => qa.twentyfour.state.solved), 1)
      await page.evaluate(() => qa.emit('Hide', {})); const snapshot = await page.evaluate(() => JSON.stringify(qa.twentyfour.state))
      await tap('7'); await page.evaluate(() => qa.emit('Show', {})); assert.equal(await page.evaluate(() => JSON.stringify(qa.twentyfour.state)), snapshot)
      await tap('back')
      assert.equal(await page.evaluate(() => qa.events.TouchStart.size), 1)
      await page.evaluate(() => {
        const first = { clientX: innerWidth / 2, clientY: innerHeight - 130, identifier: 4 }; const last = { ...first, clientY: -3000 }
        qa.emit('TouchStart', { changedTouches: [first], touches: [first] }); qa.emit('TouchMove', { changedTouches: [last], touches: [last] }); qa.emit('TouchEnd', { changedTouches: [last], touches: [] })
      })
      await clickText('算 24 点'); await clickText('继续计算')
      assert.deepEqual(await page.evaluate(() => JSON.parse(JSON.stringify(qa.twentyfour.state))), JSON.parse(snapshot))
      await tap('submit'); assert.equal(await page.evaluate(() => qa.twentyfour.state.round), 2)
      await tap('7'); await tap('left'); await tap('3'); assert.equal(await page.evaluate(() => qa.twentyfour.state.expression), '37')
      await tap('submit'); assert.ok(await page.evaluate(() => qa.twentyfour.feedback.type === 'error'))
      await page.setViewportSize({ width: 375, height: 812 })
      await page.waitForFunction(() => qa.twentyfour.view.width === innerWidth && qa.twentyfour.view.height === innerHeight)
      await assertFits()
      assert.equal(await page.evaluate(() => qa.twentyfour.state.expression), '37')
      await tap('back'); assert.equal(await page.evaluate(() => qa.events.TouchStart.size), 1)
      assert.deepEqual(errors, []); console.log(`${width}x${height}, safe top ${menuTop}: measured caret, click positioning, scrolling, collection entry, cards, keyboard, solve, resume, resize and lifecycle passed`)
      await page.close()
    }
  } finally { await browser.close() }
  console.log('Preview: ' + preview)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
