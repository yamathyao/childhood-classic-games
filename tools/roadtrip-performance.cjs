const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { browserBoot, modules } = require('./visual-qa.cjs')

async function main() {
  const output = path.resolve(__dirname, '../tmp/qa-roadtrip-performance')
  fs.mkdirSync(output, { recursive: true })
  const file = path.join(output, 'benchmark.html')
  fs.writeFileSync(file, '<!doctype html><meta charset="utf-8"><style>body{margin:0}canvas{display:block}</style><canvas></canvas><script>(' +
    browserBoot.toString() + ')(' + JSON.stringify({ modules, images: {} }).replace(/</g, '\\u003c') + ')</script>')
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXECUTABLE || undefined })
  const dpr = +(process.env.ROADTRIP_DPR || 2)
  const report = { environment: 'Desktop Chrome, native Canvas code; submission cost excludes GPU presentation', viewports: [] }
  try {
    for (const [width, height] of [[320, 568], [390, 844]]) {
      if (process.env.ROADTRIP_VIEWPORT && +process.env.ROADTRIP_VIEWPORT !== width) continue
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr })
      const errors = []; page.on('pageerror', e => errors.push(e.message))
      await page.exposeFunction('roadtripPerfProgress', value => console.log(width + ': ' + value))
      await page.goto(pathToFileURL(file).href); await page.waitForFunction(() => window.qa)
      // Remove QA text logging from the timed production renderer.
      await page.evaluate(() => {
        const ctx = document.querySelector('canvas').getContext('2d')
        ctx.fillText = CanvasRenderingContext2D.prototype.fillText.bind(ctx)
        ctx.clearRect = CanvasRenderingContext2D.prototype.clearRect.bind(ctx)
      })
      const session = await page.context().newCDPSession(page)
      await session.send('HeapProfiler.collectGarbage')
      const heapBefore = (await session.send('Runtime.getHeapUsage')).usedSize
      if (process.env.ROADTRIP_CPU_RATE) await session.send('Emulation.setCPUThrottlingRate', { rate: +process.env.ROADTRIP_CPU_RATE })
      const result = await page.evaluate(async stress => {
        const renderer = qa.load('games/roadtrip/renderer.js'); const rules = qa.load('games/roadtrip/rules.js')
        const scenery = qa.load('games/roadtrip/scenery.js'); const store = qa.load('games/roadtrip/storage.js')
        const view = qa.load('games/roadtrip/layout.js').layout({ width: innerWidth, height: innerHeight, top: 24, bottom: 16 })
        const ctx = document.querySelector('canvas').getContext('2d')
        const stats = values => {
          const sorted = values.slice().sort((a, b) => a - b)
          return { medianMs: +sorted[Math.floor(sorted.length * .5)].toFixed(3), p95Ms: +sorted[Math.floor(sorted.length * .95)].toFixed(3),
            meanMs: +(values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3), maxMs: +sorted[sorted.length - 1].toFixed(3) }
        }
        const frame = () => new Promise(resolve => requestAnimationFrame(resolve))
        const scenes = []
        for (let district = 0; district < scenery.THEMES.length; district++) {
          const s = rules.create({ seed: 31, density: 'busy' }); rules.start(s)
          const base = district * 320 + 144
          const traffic = Array.from({ length: 19 }, (_, i) => ({ id: i, model: i % 6, lane: i % 2, targetLane: i % 2,
            z: (i - 7) * 8, speed: 20, desired: 20, passed: false }))
          Object.assign(s, { distance: base, phase: 'driving', lane: 0, targetLane: 0, traffic })
          const args = { context: ctx, view, page: 'drive', settings: store.settings(null), records: store.records(null), state: s }
          const samples = []; const intervals = []; let previous = null
          for (let n = 0; n < (stress ? 30 : 60); n++) {
            const timestamp = await frame()
            if (n >= 12 && previous !== null) intervals.push(timestamp - previous)
            previous = timestamp; s.distance = base + n / 3
            const begin = performance.now(); renderer.draw(args)
            if (n >= 12) samples.push(performance.now() - begin)
          }
          // Count Canvas API submissions separately to avoid distorting timed samples.
          let calls = 0
          const proxy = new Proxy(ctx, {
            get(target, key) { const value = target[key]; return typeof value === 'function' ? (...args) => { calls++; return value.apply(target, args) } : value },
            set(target, key, value) { target[key] = value; return true }
          })
          renderer.draw({ ...args, context: proxy })
          scenes.push({ theme: scenery.THEMES[district].id, render: stats(samples), frameInterval: stats(intervals), canvasCalls: calls })
          await window.roadtripPerfProgress(scenery.THEMES[district].id + ' sampled')
        }
        // Real simulation at maximum supported traffic, across a ten-minute cruise.
        const state = rules.create({ seed: 31, density: 'busy' }); rules.start(state)
        const simulation = []; const simulationStart = performance.now()
        const steps = stress ? 3600 : 36000
        for (let n = 0; n < steps; n++) {
          const start = performance.now(); rules.step(state, {}, 1 / 60); simulation.push(performance.now() - start)
          if (state.status !== 'running') throw new Error('Benchmark cruise crashed')
        }
        return { scenes, simulation: { ...stats(simulation), meanMs: +((performance.now() - simulationStart) / steps).toFixed(4), seconds: steps / 60 },
          simulatedMeters: Math.round(state.distance), trafficCount: state.traffic.length }
      }, !!process.env.ROADTRIP_CPU_RATE)
      if (process.env.ROADTRIP_CPU_RATE) await session.send('Emulation.setCPUThrottlingRate', { rate: 1 })
      // Exercise actual scheduling, storage and touch handlers in an isolated scene.
      const lifecycle = await page.evaluate(async () => {
        const ctx = document.querySelector('canvas').getContext('2d'); const game = qa.load('games/roadtrip/game.js')
        const renderer = qa.load('games/roadtrip/renderer.js'); const original = renderer.draw
        const nativeRequest = window.requestAnimationFrame; const nativeCancel = window.cancelAnimationFrame
        const nativeTimeout = window.setTimeout; const nativeClear = window.clearTimeout
        const nativeSet = wx.setStorageSync; const pending = new Set()
        const baseline = qa.events.TouchStart.size
        let draws = 0; let writes = 0; let wakeups = 0; let latest
        const drivingCosts = []
        renderer.draw = args => {
          latest = args; draws++; const start = performance.now(); original(args)
          if (args.page === 'drive' && args.state.status === 'running') drivingCosts.push(performance.now() - start)
        }
        window.requestAnimationFrame = callback => {
          const id = nativeRequest(timestamp => { pending.delete(id); wakeups++; callback(timestamp) }); pending.add(id); return id
        }
        window.cancelAnimationFrame = id => { pending.delete(id); nativeCancel(id) }
        const timers = new Set()
        window.setTimeout = (callback, delay) => {
          const id = nativeTimeout(() => { timers.delete(id); wakeups++; callback() }, delay); timers.add(id); return id
        }
        window.clearTimeout = id => { timers.delete(id); nativeClear(id) }
        wx.setStorageSync = (...args) => { writes++; nativeSet(...args) }
        const canvas = document.querySelector('canvas'); const originalPixels = canvas.width * canvas.height
        const scene = game.start({ canvas, context: ctx, screen: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, top: 24, bottom: 16 }, goHome() {} })
        const activePixels = canvas.width * canvas.height
        const sleep = (duration = 180) => new Promise(resolve => nativeTimeout(resolve, duration))
        const tap = r => {
          const t = { identifier: 99, clientX: r.x + r.w / 2, clientY: r.y + r.h / 2 }
          // Only target the new scene's listeners, leaving the collection idle.
          for (const name of ['TouchStart', 'TouchEnd']) [...qa.events[name]].slice(-1)[0]({ changedTouches: [t], touches: name === 'TouchStart' ? [t] : [] })
        }
        const idle = async (duration) => { const d = draws; const w = writes; const k = wakeups; await sleep(duration); return { draws: draws - d, writes: writes - w, wakeups: wakeups - k, pendingFrames: pending.size + timers.size } }
        const setup = await idle(); tap(latest.view.start)
        const running = await idle(1200)
        const drivingRender = { frames: drivingCosts.length, totalMs: +drivingCosts.reduce((sum, cost) => sum + cost, 0).toFixed(2),
          meanMs: +(drivingCosts.reduce((sum, cost) => sum + cost, 0) / drivingCosts.length).toFixed(3), maxMs: +Math.max(...drivingCosts).toFixed(2) }
        tap(latest.view.pause); const paused = await idle()
        tap(latest.view.resume); scene.hide(); const hidden = await idle()
        scene.show(); const shownPaused = await idle(); scene.dispose(); const disposed = await idle()
        const listenersReleased = qa.events.TouchStart.size === baseline
        renderer.draw = original; window.requestAnimationFrame = nativeRequest; window.cancelAnimationFrame = nativeCancel; window.setTimeout = nativeTimeout; window.clearTimeout = nativeClear; wx.setStorageSync = nativeSet
        return { setup, running, paused, hidden, shownPaused, disposed, listenersReleased,
          drivingRender, canvas: { originalPixels, activePixels, restoredPixels: canvas.width * canvas.height } }
      })
      for (const key of ['setup', 'paused', 'hidden', 'shownPaused', 'disposed']) assert.deepEqual(lifecycle[key], { draws: 0, writes: 0, wakeups: 0, pendingFrames: 0 }, key)
      assert.equal(lifecycle.running.pendingFrames, 1); assert.equal(lifecycle.running.writes, 0); assert.ok(lifecycle.running.draws > 0)
      if (process.argv.includes('--verify-energy')) {
        assert.ok(lifecycle.running.wakeups <= 40, 'At most one application callback per painted frame')
        assert.ok(lifecycle.canvas.activePixels < width * height * 2.26, 'Backing canvas density is capped')
        assert.equal(lifecycle.canvas.restoredPixels, lifecycle.canvas.originalPixels, 'Leaving restores the collection resolution')
      }
      assert.ok(lifecycle.listenersReleased); assert.deepEqual(errors, [])
      await session.send('HeapProfiler.collectGarbage')
      const heapAfter = (await session.send('Runtime.getHeapUsage')).usedSize
      const memory = { heapBefore, heapAfter, retainedDeltaBytes: heapAfter - heapBefore, scope: 'JS heap including lazy initialization; excludes GPU memory' }
      report.viewports.push({ width, height, dpr, cpuRate: +(process.env.ROADTRIP_CPU_RATE || 1), ...result, lifecycle, memory })
      console.log(width + ': ' + JSON.stringify({ scenes: result.scenes.map(s => ({ theme: s.theme, p95: s.render.p95Ms, calls: s.canvasCalls })), simulation: result.simulation, lifecycle }))
      await page.close()
    }
  } finally { await browser.close() }
  const label = process.argv.find(value => value.startsWith('--label='))
  const name = label ? label.slice(8) : process.argv.includes('--save-before') ? 'before' : 'after'
  const suffix = process.env.ROADTRIP_CPU_RATE ? '-cpu' + process.env.ROADTRIP_CPU_RATE + '-dpr' + dpr : ''
  fs.writeFileSync(path.join(output, name + suffix + '.json'), JSON.stringify(report, null, 2) + '\n')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
