const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { browserBoot, modules } = require('./visual-qa.cjs')

async function main() {
  const output = path.resolve(__dirname, '../tmp/qa-textbattle')
  fs.mkdirSync(output, { recursive: true })
  const preview = path.join(output, 'preview.html')
  const images = { 'assets/textbattle/fighters-2d.png': 'data:image/png;base64,' + fs.readFileSync(path.resolve(__dirname, '../assets/textbattle/fighters-2d.png')).toString('base64') }
  fs.writeFileSync(preview, '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>文字对战 · 本地验收</title><style>html,body{margin:0;overflow:hidden}canvas{width:100vw;height:100vh;touch-action:none;display:block}</style><canvas></canvas><script>(' + browserBoot.toString() + ')(' + JSON.stringify({ modules, images }).replace(/</g, '\\u003c') + ')</script>')
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXECUTABLE || undefined })
  try {
    for (const [width, height] of [[320, 568], [375, 667], [390, 844]]) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 })
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(pathToFileURL(preview).href)
      const trackDrawing = () => page.evaluate(() => {
        const c = document.querySelector('canvas').getContext('2d')
        const fill = c.fillText.bind(c); const clear = c.clearRect.bind(c)
        qa.drawn = []
        c.fillText = (value, x, y, ...args) => {
          qa.drawn.push({ text: String(value), x, y, font: c.font, align: c.textAlign, color: c.fillStyle, width: c.measureText(String(value)).width })
          fill(value, x, y, ...args)
        }
        c.clearRect = (...args) => { qa.drawn = []; clear(...args) }
      })
      await trackDrawing()
      const click = async label => {
        const target = await page.evaluate(value => {
          const visible = qa.texts.slice().reverse()
          return visible.find(item => item.text === value) || visible.find(item => item.text.includes(value))
        }, label)
        assert.ok(target, 'Missing control: ' + label)
        await page.mouse.click(target.x, target.y)
      }
      const swipeHome = () => page.evaluate(() => {
        const start = { clientX: 180, clientY: innerHeight - 100, identifier: 7 }
        const end = { ...start, clientY: start.clientY - 1800 }
        qa.emit('TouchStart', { changedTouches: [start], touches: [start] })
        qa.emit('TouchMove', { changedTouches: [end], touches: [end] })
        qa.emit('TouchEnd', { changedTouches: [end], touches: [] })
      })
      if (!process.argv.includes('--feedback-only')) {
      await swipeHome()
      await page.screenshot({ path: path.join(output, `collection-${width}.png`) })
      await click('文字对战')
      await page.screenshot({ path: path.join(output, `detail-${width}.png`) })
      await click('进入游戏')
      const genderRect = await page.evaluate(() => qa.load('games/textbattle/layout.js').layout(qa.load('common/screen.js').measure()).gender)
      await page.mouse.click(genderRect.x + genderRect.w / 2, genderRect.y + genderRect.h / 2)
      assert.equal(await page.evaluate(() => wx.getStorageSync('textbattle.v5').player.gender), 'female')
      await page.screenshot({ path: path.join(output, `female-${width}.png`) })
      await page.mouse.click(genderRect.x + genderRect.w / 2, genderRect.y + genderRect.h / 2)
      assert.equal(await page.evaluate(() => wx.getStorageSync('textbattle.v5').player.gender), 'male')
      const randomNameRect = await page.evaluate(() => {
        const { layout, nameControls } = qa.load('games/textbattle/layout.js')
        return nameControls(layout(qa.load('common/screen.js').measure()), wx.getStorageSync('textbattle.v5').player.name).randomName
      })
      const oldName = await page.evaluate(() => wx.getStorageSync('textbattle.v5').player.name)
      await page.mouse.click(randomNameRect.x + 17, randomNameRect.y + 17)
      assert.notEqual(await page.evaluate(() => wx.getStorageSync('textbattle.v5').player.name), oldName)
      assert.ok(await page.evaluate(() => ['male', 'female'].includes(wx.getStorageSync('textbattle.v5').player.gender)))
      await click('改名')
      await page.evaluate(() => qa.emit('KeyboardConfirm', { value: '江湖第一剑客长名' }))
      assert.equal(await page.evaluate(() => wx.getStorageSync('textbattle.v5').player.name), '江湖第一剑客长名')
      assert.ok(await page.evaluate(() => {
        const view = qa.load('games/textbattle/layout.js').layout(qa.load('common/screen.js').measure())
        const title = qa.drawn.find(item => item.text === '江湖第一剑客长名' && item.y === view.arena.y + 31)
        return title && title.x - title.width / 2 >= view.arena.x + 12 && title.x + title.width / 2 < view.gender.x
      }))
      assert.ok(await page.evaluate(() => {
        const { layout, nameControls } = qa.load('games/textbattle/layout.js')
        const view = layout(qa.load('common/screen.js').measure())
        const controls = nameControls(view, wx.getStorageSync('textbattle.v5').player.name)
        const label = qa.drawn.find(item => item.text === '· 改名')
        return label && controls.randomName.x - label.x - label.width >= 6 &&
          controls.randomName.x - label.x - label.width <= 18 &&
          controls.randomName.x + controls.randomName.w + 6 <= view.reroll.x
      }))
      const movedDice = await page.evaluate(() => {
        const { layout, nameControls } = qa.load('games/textbattle/layout.js')
        return nameControls(layout(qa.load('common/screen.js').measure()), wx.getStorageSync('textbattle.v5').player.name).randomName
      })
      const beforeDice = await page.evaluate(() => wx.getStorageSync('textbattle.v5'))
      await page.mouse.click(movedDice.x + 17, movedDice.y + 17)
      const afterDice = await page.evaluate(() => wx.getStorageSync('textbattle.v5'))
      assert.notEqual(afterDice.player.name, beforeDice.player.name)
      assert.deepEqual(afterDice.player.stats, beforeDice.player.stats)
      assert.deepEqual(afterDice.enemy, beforeDice.enemy)
      await click('改名')
      await page.evaluate(() => qa.emit('KeyboardConfirm', { value: '江湖第一剑客长名' }))
      const selectWeapon = async id => {
        const weaponRect = await page.evaluate(value => {
          const view = qa.load('games/textbattle/layout.js').layout(qa.load('common/screen.js').measure())
          const index = qa.load('games/textbattle/rules.js').weapons.findIndex(item => item.id === value)
          return view.weapons[index]
        }, id)
        await page.mouse.click(weaponRect.x + weaponRect.w / 2, weaponRect.y + weaponRect.h / 2)
      }
      for (const id of ['sword', 'saber', 'spear', 'dual', 'axe', 'halberd']) {
        await selectWeapon(id)
        assert.equal(await page.evaluate(() => wx.getStorageSync('textbattle.v5').weapon), id)
        const panels = await page.evaluate(() => {
          const view = qa.load('games/textbattle/layout.js').layout(qa.load('common/screen.js').measure())
          return Object.values(view.attributes).map(rect => qa.texts.filter(item => item.x > rect.x && item.x < rect.x + rect.w && item.y > rect.y && item.y < rect.y + rect.h).map(item => item.text))
        })
        assert.equal(panels.length, 2)
        for (const [index, title] of ['我方', '敌方'].entries()) {
          assert.ok(panels[index].includes(title))
          for (const label of ['生命', '攻速 /s', '攻击', '暴击', '防御', '闪避']) assert.ok(panels[index].includes(label))
        }
        assert.equal(panels[1].filter(value => value === '？').length, 6)
        assert.ok(panels[1].includes('武势 0'))
        assert.ok(!panels[1].filter(value => !value.startsWith('武势 ')).some(value => /\d/.test(value)))
        await page.screenshot({ path: path.join(output, `weapon-${id}-${width}.png`) })
      }
      await selectWeapon('saber')
      for (const name of ['强攻', '守御', '游斗']) {
        await click(name)
        assert.ok(await page.evaluate(value => qa.texts.some(item => item.text.startsWith(value + '：')), name))
      }
      await click('武器技 ›')
      const beforeGuide = await page.evaluate(() => wx.getStorageSync('textbattle.v5'))
      assert.ok(beforeGuide.enemy.kind === undefined)
      assert.ok(await page.evaluate(() => qa.load('games/textbattle/rules.js').enemyNames.includes(wx.getStorageSync('textbattle.v5').enemy.name)))
      assert.ok(await page.evaluate(() => qa.texts.some(item => item.text === '玩法指南')))
      await page.screenshot({ path: path.join(output, `skills-${width}.png`) })
      assert.ok(await page.evaluate(() => {
        const r = qa.load('games/textbattle/layout.js').layout(qa.load('common/screen.js').measure()).guideDialog
        const descriptions = qa.load('games/textbattle/rules.js').weaponSkills.map(item => item.description)
        const drawn = qa.drawn.filter(item => descriptions.includes(item.text))
        return drawn.length === 6 && drawn.every(item => item.font.includes('12px') && item.x + item.width <= r.x + r.w - 12)
      }))
      await click('克制图谱')
      assert.ok(await page.evaluate(() => qa.drawn.filter(item => item.text === '→').length === 6 && qa.drawn.filter(item => item.text === '←').length === 6 && qa.drawn.filter(item => item.text === '=').length === 24))
      assert.ok(await page.evaluate(() => {
        const rules = qa.load('games/textbattle/rules.js')
        const r = qa.load('games/textbattle/layout.js').layout(qa.load('common/screen.js').measure()).guideDialog
        const start = qa.drawn.map(item => item.text).lastIndexOf('玩法指南')
        const rows = qa.drawn.slice(start).filter(item => item.y >= r.y && item.y < r.y + r.h)
        return !rows.some(item => /刀客|卫士|刺客|力士|铁壁|影袭/.test(item.text)) &&
          rules.weapons.every(weapon => rows.filter(item => item.text === weapon.name).length === 2) &&
          rows.every(item => {
            const left = item.x - (item.align === 'center' ? item.width / 2 : item.align === 'right' ? item.width : 0)
            return left >= r.x && left + item.width <= r.x + r.w
          })
      }))
      assert.deepEqual(await page.evaluate(() => wx.getStorageSync('textbattle.v5')), beforeGuide)
      await page.screenshot({ path: path.join(output, `relations-${width}.png`) })
      await click('武势机制')
      assert.ok(await page.evaluate(() => {
        const r = qa.load('games/textbattle/layout.js').layout(qa.load('common/screen.js').measure()).guideDialog
        const start = qa.drawn.map(item => item.text).lastIndexOf('玩法指南')
        const rows = qa.drawn.slice(start).filter(item => item.y >= r.y && item.y < r.y + r.h)
        return rows.some(item => item.text.includes('+1.6武势')) && rows.some(item => item.text.includes('+1.1武势')) &&
          rows.some(item => item.text.includes('额外+6武势')) && rows.some(item => item.text.includes('闪避者+8武势')) &&
          rows.every(item => {
            const left = item.x - (item.align === 'center' ? item.width / 2 : item.align === 'right' ? item.width : 0)
            return left >= r.x && left + item.width <= r.x + r.w
          })
      }))
      assert.deepEqual(await page.evaluate(() => wx.getStorageSync('textbattle.v5')), beforeGuide)
      await page.screenshot({ path: path.join(output, `momentum-guide-${width}.png`) })
      await click('基础玩法'); await page.screenshot({ path: path.join(output, `help-${width}.png`) })
      await click('知道了')
      await click('强攻')
      assert.ok(await page.evaluate(() => {
        const view = qa.load('games/textbattle/layout.js').layout(qa.load('common/screen.js').measure())
        const lastWeapon = view.weapons[5]
        return view.stances[0].y - lastWeapon.y - lastWeapon.h >= 26 &&
          view.log.h >= 20 && view.log.y >= view.stances[0].y + view.stances[0].h + 8 &&
          view.action.y - view.log.y - view.log.h === 8
      }))
      await page.screenshot({ path: path.join(output, `prepare-${width}.png`) })
      await click('玩法')
      assert.equal(await page.evaluate(() => qa.texts.filter(item => item.text === '？').length), 12)
      await page.screenshot({ path: path.join(output, `stats-${width}.png`) })
      await click('知道了'); await click('开始交战')
      assert.equal(await page.evaluate(() => qa.texts.filter(item => item.text === '？').length), 0)
      await page.waitForTimeout(1600)
      await page.screenshot({ path: path.join(output, `fight-${width}.png`) })
      await click('暂停')
      const paused = await page.evaluate(() => wx.getStorageSync('textbattle.v5'))
      assert.ok(paused.elapsedMs >= 1500 && paused.logs.length > 0)
      await page.waitForTimeout(350)
      assert.deepEqual(await page.evaluate(() => wx.getStorageSync('textbattle.v5')), paused)
      await click('继续交战')
      await page.waitForTimeout(400)
      await page.evaluate(() => qa.emit('Hide', {}))
      await page.evaluate(() => qa.emit('Show', {}))
      assert.ok(await page.evaluate(() => qa.texts.some(item => item.text === '交战已暂停')))
      await page.reload()
      await trackDrawing()
      await swipeHome(); await click('文字对战'); await click('继续挑战')
      assert.ok(await page.evaluate(() => qa.texts.some(item => item.text === '交战已暂停')))
      await click('继续交战'); await click('暂停交战')
      assert.ok(await page.evaluate(() => {
        const rows = qa.drawn.filter(item => /^\d+\.\d+s/.test(item.text))
        const view = qa.load('games/textbattle/layout.js').layout(qa.load('common/screen.js').measure())
        return rows.length > 0 && rows.every(item => item.font.includes('14px') &&
          item.x + item.width <= view.log.x + view.log.w - 12 && item.y + 7 <= view.log.y + view.log.h)
      }))
      await page.screenshot({ path: path.join(output, `log-${width}.png`) })
      const tactics = await page.evaluate(() => qa.load('games/textbattle/layout.js').layout(qa.load('common/screen.js').measure()).tactics)
      await page.mouse.click(tactics.x + tactics.w / 2, tactics.y + tactics.h / 2)
      const lockedWeapon = await page.evaluate(() => wx.getStorageSync('textbattle.v5').weapon)
      await click('克制图谱'); await click('武器技能')
      assert.equal(await page.evaluate(() => wx.getStorageSync('textbattle.v5').weapon), lockedWeapon)
      await click('继续交战'); await click('暂停交战')
      await click('继续交战'); await click('游戏合集')
      assert.equal(await page.evaluate(() => qa.events.TouchStart.size), 1)
      // Use a valid near-victory save to exercise the real scheduler and result controls.
      await page.evaluate(() => {
        const rules = qa.load('games/textbattle/rules.js')
        const state = rules.initialState(10); rules.startFight(state)
        state.enemy.hp = 1; state.player.cooldown = 0
        wx.setStorageSync(rules.saveKey, rules.snapshot(state))
      })
      await swipeHome(); await click('文字对战'); await click('继续挑战'); await click('继续交战')
      await page.waitForFunction(() => qa.texts.some(item => item.text === '此战告捷'))
      await page.screenshot({ path: path.join(output, `won-${width}.png`) })
      await click('查看战报')
      assert.ok(await page.evaluate(() => !qa.texts.some(item => item.text === '此战告捷') &&
        qa.texts.some(item => item.text === '查看战斗结果') &&
        !qa.texts.some(item => /^(暴击 )?−\d+$/.test(item.text))))
      await page.screenshot({ path: path.join(output, `result-log-${width}.png`) })
      await click('查看战斗结果'); await click('下一战')
      assert.ok(await page.evaluate(() => wx.getStorageSync('textbattle.v5').progression.pending))
      await page.screenshot({ path: path.join(output, `growth-${width}.png`) })
      const growthCard = await page.evaluate(() => qa.load('games/textbattle/layout.js').layout(qa.load('common/screen.js').measure()).growthCards[0])
      await page.mouse.click(growthCard.x + growthCard.w / 2, growthCard.y + growthCard.h / 2)
      const next = await page.evaluate(() => wx.getStorageSync('textbattle.v5'))
      assert.equal(next.progression.pending, false)
      assert.equal(next.round, 2); assert.equal(next.player.hp, next.player.stats.maxHp)
      assert.equal(await page.evaluate(() => qa.texts.filter(item => item.text === '？').length), 6)
      await selectWeapon('axe')
      assert.equal(await page.evaluate(() => wx.getStorageSync('textbattle.v5').weapon), next.weapon)
      assert.ok(await page.evaluate(() => qa.texts.some(item => item.text === '武器 · 本轮已锁定')))
      await click('记录')
      assert.ok(await page.evaluate(() => qa.texts.some(item => item.text === '1 连胜')))
      await click('新挑战'); await click('取消')
      await page.evaluate(() => {
        const c = document.querySelector('canvas').getContext('2d')
        const view = qa.load('games/textbattle/layout.js').layout(qa.load('common/screen.js').measure())
        for (const [key, label, size] of [['home', '‹ 游戏合集', 12], ['restart', '重新开始', 11], ['info', '玩法', 12], ['pause', '记录', 12]]) {
          c.font = `600 ${size}px serif`
          if (c.measureText(label).width > view[key].w - 8) throw new Error('Header label overflow: ' + label)
        }
      })
      await click('重新开始')
      assert.ok(await page.evaluate(() => qa.texts.some(item => item.text === '重新开始挑战？')))
      await page.screenshot({ path: path.join(output, `restart-confirm-${width}.png`) })
      await click('取消')
      assert.equal(await page.evaluate(() => wx.getStorageSync('textbattle.v5').round), 2)
      await click('重新开始')
      const restartConfirm = await page.evaluate(() => {
        const view = qa.load('games/textbattle/layout.js').layout(qa.load('common/screen.js').measure())
        return { x: view.modalPrimary.x + view.modalPrimary.w / 2, y: view.modalPrimary.y + view.modalPrimary.h / 2 }
      })
      await page.mouse.click(restartConfirm.x, restartConfirm.y)
      assert.equal(await page.evaluate(() => wx.getStorageSync('textbattle.v5').round), 1)
      assert.equal(await page.evaluate(() => wx.getStorageSync('textbattle.v5').streak), 0)
      await selectWeapon('axe')
      assert.equal(await page.evaluate(() => wx.getStorageSync('textbattle.v5').weapon), 'axe')
      await page.screenshot({ path: path.join(output, `restarted-${width}.png`) })
      // Inspect a real charged save without altering it through guide interactions.
      await click('游戏合集')
      await page.evaluate(() => {
        const rules = qa.load('games/textbattle/rules.js')
        const state = rules.initialState(42); rules.startFight(state)
        state.player.combat.momentum = rules.momentum.max; state.enemy.combat.momentum = 6543
        wx.setStorageSync(rules.saveKey, rules.snapshot(state))
      })
      await swipeHome(); await click('文字对战'); await click('继续挑战')
      assert.ok(await page.evaluate(() => qa.texts.some(item => item.text === '武势 待发') && qa.texts.some(item => item.text === '武势 65')))
      await page.screenshot({ path: path.join(output, `momentum-ready-${width}.png`) })
      await click('继续交战')
      await page.waitForFunction(() => wx.getStorageSync('textbattle.v5').logs.some(item => item.side === 'player' && item.skill))
      await click('暂停')
      assert.ok(await page.evaluate(() => wx.getStorageSync('textbattle.v5').player.combat.momentum < qa.load('games/textbattle/rules.js').momentum.max))
      await click('继续交战')
      await click('游戏合集')
      assert.equal(await page.evaluate(() => qa.events.TouchStart.size), 1)
      // Fill a valid paused save to check the enlarged log's oldest/newest scroll boundaries.
      await page.evaluate(() => {
        const rules = qa.load('games/textbattle/rules.js')
        const state = rules.initialState(12); rules.startFight(state)
        state.elapsedMs = 7900
        state.logs = Array.from({ length: 80 }, (_, i) => ({ side: i % 2 ? 'enemy' : 'player', damage: 20, critical: false, dodged: false, time: i * 100 }))
        wx.setStorageSync(rules.saveKey, rules.snapshot(state))
      })
      await swipeHome(); await click('文字对战'); await click('继续挑战'); await click('继续交战'); await click('暂停交战')
      const scrollLog = async delta => page.evaluate(distance => {
        const r = qa.load('games/textbattle/layout.js').layout(qa.load('common/screen.js').measure()).log
        const t = { clientX: r.x + r.w / 2, clientY: r.y + r.h / 2, identifier: 9 }
        qa.emit('TouchStart', { changedTouches: [t], touches: [t] })
        const moved = { ...t, clientY: t.clientY + distance }
        qa.emit('TouchMove', { changedTouches: [moved], touches: [moved] })
        qa.emit('TouchEnd', { changedTouches: [moved], touches: [] })
      }, delta)
      await scrollLog(3000)
      assert.ok(await page.evaluate(() => {
        const rows = qa.drawn.filter(item => /^\d+\.\d+s/.test(item.text))
        const view = qa.load('games/textbattle/layout.js').layout(qa.load('common/screen.js').measure())
        return rows.length === view.logPageSize && rows[0].text.startsWith('0.0s')
      }))
      await page.screenshot({ path: path.join(output, `log-oldest-${width}.png`) })
      await scrollLog(-3000)
      assert.ok(await page.evaluate(() => {
        const rows = qa.drawn.filter(item => /^\d+\.\d+s/.test(item.text))
        return rows[rows.length - 1].text.startsWith('7.9s')
      }))
      await page.screenshot({ path: path.join(output, `log-newest-${width}.png`) })
      await click('继续交战'); await click('游戏合集')
      }
      // Deterministic render fixtures inspect every skill at the same phase.
      // The live scene is now idle in the collection; no combat timer is used.
      await page.evaluate(async () => {
        const image = wx.createImage()
        await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = 'assets/textbattle/fighters-2d.png' })
        qa.feedbackArt = { image }
      })
      for (const weapon of ['sword', 'saber', 'spear', 'dual', 'axe', 'halberd']) {
        await page.evaluate(id => {
          const rules = qa.load('games/textbattle/rules.js')
          const visual = qa.load('games/textbattle/feedback.js')
          const state = rules.initialState(42); rules.configure(state, 'weapon', id); rules.startFight(state)
          state.player.name = '沈墨望'; state.enemy.weapon = 'halberd'
          state.player.combat.momentum = 10000
          const feedback = visual.createFeedback(state, 1000)
          state.player.combat.momentum = 1800; state.enemy.combat.momentum = 3300
          state.player.combat.ward = id === 'halberd'
          state.enemy.hp -= 37
          visual.recordEvents(feedback, state, [{ side: 'player', damage: 37, critical: true, dodged: false,
            skill: rules.weaponSkill(id).id, time: 0 }], 1200)
          const view = qa.load('games/textbattle/layout.js').layout(qa.load('common/screen.js').measure())
          qa.load('games/textbattle/renderer.js').draw(document.querySelector('canvas').getContext('2d'), view, state,
            { modal: null, best: [], feedback, now: 1330, art: qa.feedbackArt })
          qa.feedbackFixture = { view, state, feedback }
        }, weapon)
        const labelCheck = await page.evaluate(() => {
          const arena = qa.feedbackFixture.view.arena
          const ability = qa.load('games/textbattle/rules.js').weaponSkill(qa.feedbackFixture.state.weapon).short + ' · 发动'
          const labels = qa.drawn.filter(item => item.y < arena.y + arena.h && item.color !== '#0d1c2e' && ['暴击', '−37', ability].includes(item.text))
          return { arena, labels, valid: labels.length === 3 && labels.every(item => item.y >= arena.y + 15 && item.y < arena.y + arena.h - 3 &&
            item.x - item.width / 2 >= arena.x && item.x + item.width / 2 <= arena.x + arena.w) }
        })
        assert.ok(labelCheck.valid, JSON.stringify(labelCheck))
        await page.screenshot({ path: path.join(output, `skill-${weapon}-${width}.png`) })
        if (weapon === 'halberd') assert.ok(await page.evaluate(() => qa.drawn.some(item => item.text === '护身')))
      }
      await page.evaluate(() => {
        const { view, state } = qa.feedbackFixture
        const visual = qa.load('games/textbattle/feedback.js')
        const feedback = visual.createFeedback(state, 1000)
        visual.recordEvents(feedback, state, [{ side: 'enemy', damage: 0, critical: false, dodged: true, time: 0 }], 1200)
        qa.load('games/textbattle/renderer.js').draw(document.querySelector('canvas').getContext('2d'), view, state,
          { modal: null, best: [], feedback, now: 1290, art: qa.feedbackArt })
      })
      assert.ok(await page.evaluate(() => qa.drawn.some(item => item.text === '闪避') && !qa.drawn.some(item => item.text === '−0')))
      await page.screenshot({ path: path.join(output, `dodge-${width}.png`) })
      await page.evaluate(() => {
        const { view, state } = qa.feedbackFixture
        const visual = qa.load('games/textbattle/feedback.js')
        const feedback = visual.createFeedback(state, 1000)
        state.enemy.combat.ward = true
        visual.recordEvents(feedback, state, [
          { side: 'player', damage: 37, critical: true, guarded: true, skill: 'halberd-ward', time: 0 },
          { side: 'enemy', damage: 20, critical: false, guarded: true, skill: 'halberd-ward', time: 0 }
        ], 1200)
        qa.load('games/textbattle/renderer.js').draw(document.querySelector('canvas').getContext('2d'), view, state,
          { modal: null, best: [], feedback, now: 1330, art: qa.feedbackArt })
      })
      assert.ok(await page.evaluate(() => {
        const arena = qa.feedbackFixture.view.arena
        const labels = qa.drawn.filter(item => item.y < arena.y + arena.h && item.color !== '#0d1c2e' &&
          ['架势 · 发动', '暴击 · 格挡', '格挡', '−37', '−20'].includes(item.text))
        return labels.length === 6 && labels.every(item => item.x - item.width / 2 > arena.x && item.x + item.width / 2 < arena.x + arena.w)
      }))
      await page.screenshot({ path: path.join(output, `simultaneous-${width}.png`) })
      assert.deepEqual(errors, [])
      console.log(`${width}x${height}: ${process.argv.includes('--feedback-only') ? 'all six skill notices, damage, critical, ward and dodge labels passed' : 'collection, detail, combat, pause, save/restore, battle log, victory, next round, records and all six skill effects passed'}`)
      await page.close()
    }
  } finally { await browser.close() }
  console.log('Preview: ' + preview)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
