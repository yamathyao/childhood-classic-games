const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createHash } = require('node:crypto')

function boot(options = {}) {
  const images = []; let repaints = 0
  const wx = { createImage() {
    if (options.failure) throw new Error('Unsupported')
    const image = {}; images.push(image); return image
  } }
  const module = { exports: {} }
  const file = path.resolve(__dirname, '../games/bicycle/art.js')
  vm.runInNewContext('(function(require,module){' + fs.readFileSync(file, 'utf8') + '\n})', { wx })(
    request => require(path.resolve(path.dirname(file), request)), module)
  const art = module.exports.loadArt(() => repaints++, options.coverOnly)
  function ready(index) {
    const image = images[index]
    const dimensions = image.src.endsWith('panorama.jpg') ? [1536, 512] : image.src.endsWith('earth.jpg') ? [256, 256] : [512, 512]
    ;[image.width, image.height] = dimensions
    image.onload()
  }
  return { art, images, ready, repaints: () => repaints, functions: module.exports }
}

test('generated assets match their checked provenance and compact package budget', () => {
  const root = path.resolve(__dirname, '../assets/bicycle')
  const meta = JSON.parse(fs.readFileSync(path.join(root, 'provenance.json')))
  assert.equal(meta.model, 'gpt-image-2.5-sunburst')
  let bytes = 0
  for (const [file, record] of Object.entries(meta.files)) {
    const data = fs.readFileSync(path.join(root, file)); bytes += data.length
    assert.equal(data.length, record.bytes)
    assert.equal(createHash('sha256').update(data).digest('hex'), record.sha256)
    if (file.endsWith('.png')) assert.deepEqual([data.readUInt32BE(16), data.readUInt32BE(20)], [512, 512])
  }
  assert.ok(bytes < 700000, 'expanded cartoon asset package stays below 700KB')
  assert.ok(meta.decodedBytes <= 5.25 * 1024 * 1024)
  const atlas = require('../games/bicycle/atlas.js')
  assert.equal(atlas.length, 16)
  assert.deepEqual(atlas, meta.atlasBounds)
  for (const [x, y, w, h] of atlas) assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 512 && y + h <= 512)
})

test('assets load once, accept only expected dimensions and release pending and loaded references', () => {
  const g = boot(); assert.equal(g.images.length, 4)
  g.ready(0); g.ready(1); assert.equal(g.repaints(), 2)
  assert.equal(g.art.rider, g.images[0]); assert.equal(g.art.props, g.images[1])
  const late = g.images[2].onload
  g.art.dispose(); late()
  assert.equal(g.repaints(), 2)
  for (const image of g.images) { assert.equal(image.onload, null); assert.equal(image.onerror, null) }
  assert.equal(g.art.rider, null); assert.equal(g.art.props, null); assert.equal(g.art.panorama, null)
  g.art.dispose()
})

test('incorrect image sizes, loading errors and failed texture uploads retain the drawing fallback', () => {
  const g = boot(); g.images[0].width = 1; g.images[0].height = 1; g.images[0].onload()
  assert.equal(g.art.rider, null); assert.equal(g.repaints(), 0)
  g.images[1].onerror(); assert.equal(g.art.props, null)
  g.ready(2)
  assert.equal(g.functions.drawPanorama({ drawImage() { throw new Error('Upload failed') } }, g.art,
    { x: 0, y: 0, w: 320, h: 300 }, 80), false)
  assert.equal(g.art.panorama, null); g.art.dispose()
  const unsupported = boot({ failure: true }); assert.equal(unsupported.art.rider, null); unsupported.art.dispose()
})

test('rider sprite wheel hubs and obstacle silhouettes are registered to the collision geometry', () => {
  const g = boot(); g.ready(0); g.ready(1)
  const calls = []; const context = { save() {}, restore() {}, translate() {}, scale() {}, rotate() {}, drawImage(...args) { calls.push(args) } }
  assert.equal(g.functions.drawRider(context, g.art, 80, 60, 1, 0), true)
  const [, x, y, w, h] = calls[0]
  const scale = require('../games/bicycle/rules.js').RIDER_SCALE
  const mapped = ([sx, sy]) => [(x + sx / 1024 * w) * scale, (y + sy / 1024 * h) * scale]
  assert.deepEqual(mapped([213.704, 717.488]).map(Math.round), [-23, 6])
  assert.deepEqual(mapped([814.725, 717.488]).map(Math.round), [23, 6])
  calls.length = 0
  g.functions.drawProp(context, g.art, 1, 100, 200, 42, 36)
  assert.deepEqual(calls[0].slice(-4), [79, 164, 42, 36])
  g.art.dispose()
})

test('collection cover loads only rider and panorama and releases both', () => {
  const g = boot({ coverOnly: true }); assert.equal(g.images.length, 2)
  assert.deepEqual(g.images.map(image => image.src), ['assets/bicycle/rider.png', 'assets/bicycle/panorama.jpg'])
  g.ready(0); g.ready(1); assert.equal(g.repaints(), 2)
  assert.equal(g.art.props, null); assert.equal(g.art.earth, null)
  g.art.dispose(); assert.equal(g.art.panorama, null)
})

test('campers draw the original atlas sprite along the slope without an added roof plank', () => {
  const g = boot(); g.ready(1)
  const rules = require('../games/bicycle/rules.js'); const { drawScenery } = require('../games/bicycle/scenery.js')
  const van = rules.surfaces(0, rules.SECTION).find(item => item.kind === 'van')
  const rotations = []; const images = []
  const c = { save() {}, restore() {}, translate() {}, rotate(angle) { rotations.push(angle) },
    drawImage(...args) { images.push(args) }, stroke() { assert.fail('no extra plank is drawn over the roof') } }
  drawScenery(c, g.art, van.x - 100, van.x + 100, x => x, y => y, 1)
  assert.deepEqual(rotations, [van.angle])
  const image = images.find(call => call[1] === 4 && call[2] === 313)
  assert.ok(image); assert.deepEqual(image.slice(-4), [-van.w / 2, -van.h, van.w, van.h])
  g.art.dispose()
})

test('earth texture skips tiles above the road and draws nothing when all ground is below the view', () => {
  const g = boot(); g.ready(3)
  const calls = []; const c = { drawImage(...args) { calls.push(args) } }
  const rect = { x: 0, y: 0, w: 320, h: 400 }
  assert.equal(g.functions.drawEarth(c, g.art, rect, x => x, y => y, 0, 320, 200, 1, 401), true)
  assert.equal(calls.length, 0)
  g.functions.drawEarth(c, g.art, rect, x => x, y => y, 0, 320, 200, 1, 280)
  assert.equal(calls.length, 2, 'only two visible columns in the ground row')
  assert.ok(calls.every(call => call[2] === 256), 'tiles retain their world alignment')
  g.art.dispose()
})
