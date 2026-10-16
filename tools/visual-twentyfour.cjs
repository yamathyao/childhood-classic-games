const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

async function main() {
  const output = path.resolve(__dirname, '../tmp/qa-twentyfour')
  fs.mkdirSync(output, { recursive: true })
  const preview = path.resolve(__dirname, 'previews/twentyfour/index.html')
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXECUTABLE || undefined })
  try {
    for (const [width, height] of [[320, 568], [375, 667], [390, 844], [1280, 900]]) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 })
      const errors = []; page.on('pageerror', error => errors.push(error.message))
      await page.goto(pathToFileURL(preview).href)
      const value = () => page.locator('#expression').inputValue()
      const action = name => page.locator(`[data-action="${name}"]`).click()
      const key = name => page.locator(`[data-key="${name}"]`).click()
      const feedback = () => page.locator('.feedback').textContent()
      const layout = await page.evaluate(() => {
        const keys = [...document.querySelectorAll('.key')].map(key => { const box = key.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height, bottom: box.bottom } })
        const goal = document.querySelector('.target strong').getBoundingClientRect()
        const cards = document.querySelector('.cards').getBoundingClientRect()
        const footer = document.querySelector('.display-footer').getBoundingClientRect()
        const workspace = document.querySelector('.workspace').getBoundingClientRect()
        return { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, keys,
          goalBottom: goal.bottom, cardsTop: cards.top, footerBottom: footer.bottom, workspaceTop: workspace.top }
      })
      assert.ok(layout.width <= width && layout.height <= height, `Overflow ${width}: ${JSON.stringify(layout)}`)
      assert.ok(layout.keys.every(key => key.width >= 44 && key.height >= 36 && key.height <= 40 && key.x >= 0 && key.bottom <= height), `Unusable keys at ${width}`)
      assert.ok(layout.goalBottom <= layout.cardsTop && layout.footerBottom < layout.workspaceTop - 3, `Overlapping display at ${width}: ${JSON.stringify(layout)}`)
      await page.screenshot({ path: path.join(output, `ready-${width}.png`) })

      await page.getByRole('button', { name: '查看玩法' }).click()
      assert.equal(await page.locator('dialog').evaluate(dialog => dialog.open), true)
      await page.getByRole('button', { name: '知道了，开始算' }).click()
      await page.getByRole('button', { name: '数字 3', exact: true }).click(); assert.equal(await value(), '3')
      await action('delete'); assert.equal(await value(), '')
      await action('hint'); assert.match(await feedback(), /6 \+ 4/)
      await action('hint'); assert.match(await feedback(), /参考/); assert.equal(await page.locator('#solved-count').textContent(), '0')
      await action('clear')
      for (const symbol of ['(', '6', '+', '4', '−', '2', ')', '×', '3']) await key(symbol)
      assert.equal(await value(), '(6+4−2)×3'); assert.equal(await page.locator('.card.used').count(), 4)
      await page.screenshot({ path: path.join(output, `input-${width}.png`) })
      await action('submit'); assert.match(await feedback(), /正好 24/)
      assert.equal(await page.locator('#solved-count').textContent(), '1')
      await page.screenshot({ path: path.join(output, `success-${width}.png`) })

      await action('clear'); await page.keyboard.type('(6+4-2)*3'); await page.keyboard.press('Enter')
      assert.match(await feedback(), /正好 24/); assert.equal(await page.locator('#solved-count').textContent(), '1', 'Do not count the same puzzle twice')
      await action('clear'); await page.keyboard.type('3+4+6+2'); await action('submit'); assert.match(await feedback(), /15/)
      await action('clear'); await page.keyboard.type('6*4'); await action('submit'); assert.match(await feedback(), /各用一次/)
      await action('clear'); await page.keyboard.type('6/(4-4)'); await action('submit'); assert.match(await feedback(), /除数不能是 0/)
      await action('clear'); await page.keyboard.type('(6+4'); await action('submit'); assert.match(await feedback(), /括号/)

      await action('clear'); await page.keyboard.type('36'); await page.keyboard.press('ArrowLeft'); await page.keyboard.type('+'); assert.equal(await value(), '3+6')
      await page.keyboard.press('Backspace'); assert.equal(await value(), '36'); await page.keyboard.press('Delete'); assert.equal(await value(), '3')
      await action('clear'); await page.keyboard.type('123'); await page.locator('#expression').evaluate(input => input.setSelectionRange(0, 3)); await key('6'); assert.equal(await value(), '6')
      await page.locator('#expression').evaluate(input => {
        const clipboardData = new DataTransfer(); clipboardData.setData('text', 'alert(1)')
        input.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
      })
      assert.equal(await value(), '6'); assert.match(await feedback(), /只能粘贴/)

      const signature = () => page.locator('.card .number').allTextContents()
      const first = (await signature()).sort().join(','); const seen = new Set([first])
      for (let i = 0; i < 30; i++) {
        await page.locator('.swap').click(); const current = (await signature()).sort().join(',')
        assert.ok(!seen.has(current), 'Do not repeat a puzzle within the deck'); seen.add(current)
      }
      await page.locator('.swap').click(); assert.notEqual((await signature()).sort().join(','), [...seen].pop())
      assert.equal(await value(), ''); assert.equal(await page.locator('.card.used').count(), 0)
      assert.equal(await page.locator('#solved-count').textContent(), '1'); assert.equal(await page.locator('.round-number').textContent(), '第 32 题')
      await action('clear'); await page.keyboard.type('1'.repeat(70)); assert.equal((await value()).length, 64)
      assert.match(await feedback(), /太长/)
      assert.deepEqual(errors, [])
      console.log(`${width}x${height}: layout, keyboard, cursor, answer validation, hints, score and nonrepeating questions passed`)
      await page.close()
    }
  } finally { await browser.close() }
  console.log('Preview: ' + preview)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
