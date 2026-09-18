// Development-only browser adapter. Production remains native WeChat Canvas.
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

const root = path.resolve(__dirname, '..')
const modules = {}
function collect(directory) {
  for (const item of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const name = path.posix.join(directory, item.name)
    if (item.isDirectory()) collect(name)
    else if (item.name.endsWith('.js')) modules[name] = fs.readFileSync(path.join(root, name), 'utf8')
  }
}
for (const directory of ['common', 'games']) collect(directory)
modules['game.js'] = fs.readFileSync(path.join(root, 'game.js'), 'utf8')

function browserBoot({ modules, images }) {
  const events = {}
  const canvas = document.querySelector('canvas')
  const texts = []
  const ctx = canvas.getContext('2d')
  const realText = ctx.fillText.bind(ctx)
  const realClear = ctx.clearRect.bind(ctx)
  ctx.fillText = (value, x, y, ...args) => {
    texts.push({ text: String(value), x, y })
    realText(value, x, y, ...args)
  }
  ctx.clearRect = (...args) => { texts.length = 0; realClear(...args) }
  window.wx = {
    createCanvas: () => canvas,
    createOffscreenCanvas: ({ width, height }) => {
      const surface = document.createElement('canvas')
      surface.width = width
      surface.height = height
      return surface
    },
    getSystemInfoSync: () => ({ windowWidth: innerWidth, windowHeight: innerHeight,
      pixelRatio: devicePixelRatio, safeArea: { top: 24, bottom: innerHeight - 16 } }),
    createImage: () => {
      const image = new Image()
      const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')
      Object.defineProperty(image, 'src', {
        get() { return descriptor.get.call(image) },
        set(value) { descriptor.set.call(image, images[value] || value) }
      })
      return image
    },
    getStorageSync: key => JSON.parse(localStorage.getItem(key) || 'null'),
    setStorageSync: (key, value) => localStorage.setItem(key, JSON.stringify(value))
  }
  for (const name of ['TouchStart', 'TouchMove', 'TouchEnd', 'TouchCancel', 'Hide', 'Show', 'WindowResize']) {
    events[name] = new Set()
    wx['on' + name] = callback => events[name].add(callback)
    wx['off' + name] = callback => events[name].delete(callback)
  }
  function emit(name, event) { for (const callback of [...events[name]]) callback(event) }
  for (const [dom, name] of [['pointerdown', 'TouchStart'], ['pointermove', 'TouchMove'],
    ['pointerup', 'TouchEnd'], ['pointercancel', 'TouchCancel']]) {
    canvas.addEventListener(dom, e => {
      if (dom === 'pointerdown') canvas.setPointerCapture(e.pointerId)
      const touch = { clientX: e.clientX, clientY: e.clientY, identifier: e.pointerId }
      emit(name, { touches: name === 'TouchEnd' ? [] : [touch], changedTouches: [touch] })
    })
  }
  window.addEventListener('resize', () => emit('WindowResize', {}))
  const cache = {}
  function load(name) {
    if (cache[name]) return cache[name].exports
    if (!modules[name]) throw new Error('Missing module: ' + name)
    const module = { exports: {} }
    cache[name] = module
    const require = request => {
      const parts = name.split('/').slice(0, -1).concat(request.split('/'))
      const resolved = []
      for (const part of parts) {
        if (part === '..') resolved.pop()
        else if (part !== '.' && part !== '') resolved.push(part)
      }
      return load(resolved.join('/'))
    }
    new Function('require', 'module', 'exports', modules[name])(require, module, module.exports)
    return module.exports
  }
  window.qa = { texts, emit, load, events }
  load('game.js')
}

async function main() {
  const images = {}
  const artDir = path.join(root, 'assets/portraits')
  if (fs.existsSync(artDir)) {
    for (const file of fs.readdirSync(artDir)) {
      if (!/\.(png|jpg|jpeg)$/.test(file)) continue
      const mime = file.endsWith('.png') ? 'image/png' : 'image/jpeg'
      images['assets/portraits/' + file] = `data:${mime};base64,${fs.readFileSync(path.join(artDir, file)).toString('base64')}`
    }
  }
  const output = path.join(root, 'tmp/qa')
  fs.mkdirSync(output, { recursive: true })
  const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>童年游戏馆 · 本地视觉验收</title><style>html,body{margin:0;overflow:hidden}canvas{width:100vw;height:100vh;touch-action:none;display:block}</style><canvas></canvas>' +
    '<script>(' + browserBoot.toString() + ')(' + JSON.stringify({ modules, images }).replace(/</g, '\\u003c') + ')</script>'
  const preview = path.join(output, 'preview.html')
  fs.writeFileSync(preview, html)
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXECUTABLE || undefined })
  try {
    for (const [width, height] of [[320, 568], [375, 667], [390, 844]]) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 })
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto('file:///' + preview.replace(/\\/g, '/'))
      await page.waitForFunction(() => window.qa && qa.texts.some(t => t.text.includes('进入棋局')))
      await page.waitForTimeout(250)
      await page.screenshot({ path: path.join(output, `home-${width}.png`) })
      const homePicker = await page.evaluate(() => qa.texts.find(t => t.text.includes('选择对局')))
      await page.mouse.click(homePicker.x, homePicker.y)
      await page.waitForFunction(() => qa.texts.some(t => t.text.includes('横竖皆将')))
      await page.screenshot({ path: path.join(output, `levels-${width}.png`) })
      const variantRow = await page.evaluate(() => qa.texts.find(t => t.text.includes('横竖皆将')))
      await page.mouse.click(variantRow.x, variantRow.y)
      await page.waitForFunction(() => qa.texts.some(t => t.text.includes('横竖皆将')) && !qa.texts.some(t => t.text === '选择对局'))
      const start = await page.evaluate(() => qa.texts.find(t => t.text.includes('进入棋局')))
      await page.mouse.click(start.x, start.y)
      await page.waitForFunction(() => qa.texts.some(t => t.text === '步 数'))
      await page.waitForFunction(() => qa.texts.some(t => t.text === '退出棋局') && qa.texts.some(t => t.text.includes('游戏合集')))
      await page.waitForTimeout(250)
      await page.screenshot({ path: path.join(output, `board-${width}.png`) })
      await page.screenshot({ path: path.join(output, `variant-${width}.png`) })
      const rendering = await page.evaluate(() => {
        const { draw, createRenderer } = qa.load('games/klotski/renderer.js')
        const rules = qa.load('games/klotski/rules.js')
        const layout = qa.load('games/klotski/layout.js').layout(qa.load('common/screen.js').measure())
        const state = rules.initialState()
        const args = { layout, state, elapsedMs: 0, selected: 's1',
          drag: { id: 's1', axis: 'y', offset: layout.cell * .7 }, portraits: {}, modal: null, best: 0 }
        function surface() {
          const canvas = wx.createOffscreenCanvas({ width: layout.width * layout.dpr, height: layout.height * layout.dpr })
          const c = canvas.getContext('2d')
          c.scale(layout.dpr, layout.dpr)
          return c
        }
        const direct = surface()
        const cached = surface()
        let directCalls = 0
        let cachedCalls = 0
        for (const method of ['fillRect', 'fillText', 'stroke', 'fill', 'drawImage']) {
          const a = direct[method].bind(direct)
          direct[method] = (...values) => { directCalls++; return a(...values) }
          const b = cached[method].bind(cached)
          cached[method] = (...values) => { cachedCalls++; return b(...values) }
        }
        function assertSame(label) {
          const a = direct.getImageData(0, 0, direct.canvas.width, direct.canvas.height).data
          const b = cached.getImageData(0, 0, cached.canvas.width, cached.canvas.height).data
          let differences = 0
          for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 3) differences++
          if (differences / a.length > .001) throw new Error(label + ': cached scene differs from direct rendering')
        }
        const renderer = createRenderer()
        renderer.draw({ ...args, c: cached })
        cachedCalls = 0
        draw({ ...args, c: direct })
        renderer.draw({ ...args, c: cached })
        assertSame('drag')
        const metrics = { directCalls, cachedCalls }
        if (cachedCalls > directCalls * .25) throw new Error('Drag did not use the scene cache')
        rules.move(state, 's3', 'x', 1)
        draw({ ...args, elapsedMs: 65000, c: direct })
        renderer.draw({ ...args, elapsedMs: 65000, c: cached })
        assertSame('updated state and timer')
        renderer.dispose()
        const factory = wx.createOffscreenCanvas
        try {
          wx.createOffscreenCanvas = () => { throw new Error('Unsupported offscreen canvas') }
          const fallback = createRenderer()
          fallback.draw({ ...args, c: cached })
          draw({ ...args, c: direct })
          assertSame('unsupported cache fallback')
          fallback.dispose()
        } finally { wx.createOffscreenCanvas = factory }
        return metrics
      })
      // Exercise actual animation frames and rendering, absent from the synchronous unit adapter.
      const view = await page.evaluate(() => qa.load('games/klotski/layout.js').layout(qa.load('common/screen.js').measure()))
      // s2 has a free cell below it in the selected three-lanes variant.
      const x = view.board.x + 2.5 * view.cell
      const y = view.board.y + 3.5 * view.cell
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(x, y + view.cell * .7, { steps: 8 })
      await page.screenshot({ path: path.join(output, `drag-${width}.png`) })
      await page.mouse.up()
      await page.waitForTimeout(200)
      const snapshot = await page.evaluate(() => wx.getStorageSync('klotski.three-lanes.v1'))
      if (!snapshot || snapshot.history.length !== 1) throw new Error(`Animated move did not persist: ${JSON.stringify(snapshot)}`)
      // A complete gesture in one task arrives before any animation frame can run.
      await page.evaluate(({ x, y, cell }) => {
        const touch = { clientX: x, clientY: y + cell, identifier: 99 }
        qa.emit('TouchStart', { changedTouches: [touch], touches: [touch] })
        const end = { ...touch, clientY: y + cell * .3 }
        qa.emit('TouchMove', { changedTouches: [end], touches: [end] })
        qa.emit('TouchEnd', { changedTouches: [end], touches: [] })
      }, { x, y, cell: view.cell })
      await page.waitForTimeout(180)
      const flick = await page.evaluate(() => wx.getStorageSync('klotski.three-lanes.v1'))
      if (flick.history.length !== 2 || flick.history[1].delta !== -1) throw new Error('Fast flick lost its release position')
      const home = await page.evaluate(() => qa.texts.find(t => t.text.includes('游戏合集')))
      await page.mouse.click(home.x, home.y)
      const resume = await page.evaluate(() => qa.texts.find(t => t.text.includes('继续解局')))
      if (!resume) throw new Error('Home did not offer resume')
      await page.mouse.click(resume.x, resume.y)
      const help = await page.evaluate(() => qa.texts.find(t => t.text === '玩法'))
      await page.mouse.click(help.x, help.y)
      await page.screenshot({ path: path.join(output, `rules-${width}.png`) })
      if (errors.length) throw new Error(errors.join('\n'))
      console.log(`${width}x${height}: cache/direct pixels match, draw calls ${rendering.directCalls} -> ${rendering.cachedCalls}; drag/flick, fallback and home/resume passed`)
      await page.close()
    }
  } finally { await browser.close() }
  console.log('Preview: ' + preview)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
