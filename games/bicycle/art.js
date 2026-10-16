const ATLAS = require('./atlas.js')
const { RIDER_SCALE } = require('./rules.js')
const FILES = { rider: ['assets/bicycle/rider.png', 512, 512], props: ['assets/bicycle/props.png', 512, 512],
  panorama: ['assets/bicycle/panorama.jpg', 1536, 512], earth: ['assets/bicycle/earth.jpg', 256, 256] }

function loadArt(onReady, coverOnly = false) {
  let active = true
  const pending = new Set()
  const art = { rider: null, props: null, panorama: null, earth: null, dispose() {
    active = false
    for (const image of pending) { image.onload = null; image.onerror = null }
    pending.clear()
    for (const name of Object.keys(FILES)) art[name] = null
  } }
  if (typeof wx === 'undefined' || typeof wx.createImage !== 'function') return art
  for (const [name, [src, width, height]] of Object.entries(FILES)) {
    if (coverOnly && name !== 'rider' && name !== 'panorama') continue
    try {
      const image = wx.createImage(); pending.add(image)
      image.onload = () => {
        if (!active || !pending.has(image)) return
        if (image.width === width && image.height === height) art[name] = image
        image.onload = null; image.onerror = null; pending.delete(image)
        if (art[name]) onReady()
      }
      image.onerror = () => { image.onload = null; image.onerror = null; pending.delete(image) }
      image.src = src
    } catch (error) { /* The vector drawing remains usable if image creation fails. */ }
  }
  return art
}
function drawImage(c, art, name, ...coordinates) {
  if (!art || !art[name]) return false
  try { c.drawImage(art[name], ...coordinates); return true }
  catch (error) { art[name] = null; return false }
}
function drawRider(c, art, x, y, scale, angle) {
  if (!art || !art.rider) return false
  c.save()
  try {
    c.translate(x, y); c.scale(scale * RIDER_SCALE, scale * RIDER_SCALE); c.rotate(angle)
    // Inspected hubs leveled by .477 degrees, 601.021px == 60 local units.
    return drawImage(c, art, 'rider', -514.2145 * 60 / 601.021, 8 - 717.488 * 60 / 601.021,
      1024 * 60 / 601.021, 1024 * 60 / 601.021)
  } finally { c.restore() }
}
function drawProp(c, art, index, x, y, width, height) {
  const bounds = ATLAS[index]
  if (!bounds) return false
  return drawImage(c, art, 'props', ...bounds, x - width / 2, y - height, width, height)
}
function drawPanorama(c, art, rect, travel, vertical = 0) {
  if (!art || !art.panorama) return false
  const height = rect.h * 1.18; const width = height * 3
  const offset = ((travel * .12) % width + width) % width
  const y = rect.y - rect.h * .06 - Math.max(-14, Math.min(14, vertical))
  for (let x = rect.x - offset; x < rect.x + rect.w; x += width) {
    if (!drawImage(c, art, 'panorama', x, y, width, height)) return false
  }
  return true
}
function drawEarth(c, art, rect, projectX, projectY, from, to, cameraY, scale, groundTop = rect.y) {
  if (!art || !art.earth) return false
  const top = Math.max(rect.y, groundTop)
  if (top >= rect.y + rect.h) return true
  const tile = 256; const size = tile * scale
  // Ground clipping cannot reveal texture tiles wholly above the road.
  const firstY = Math.floor((cameraY + (top - projectY(cameraY)) / scale) / tile) * tile
  for (let x = Math.floor(from / tile) * tile; x <= to; x += tile) {
    for (let y = firstY; projectY(y) < rect.y + rect.h; y += tile) {
      if (projectY(y + tile) < rect.y) continue
      if (!drawImage(c, art, 'earth', projectX(x), projectY(y), size + .5, size + .5)) return false
    }
  }
  return true
}
module.exports = { loadArt, drawImage, drawRider, drawProp, drawPanorama, drawEarth }
