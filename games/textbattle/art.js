const weaponIds = ['sword', 'saber', 'spear', 'dual', 'axe', 'halberd']
function loadSprites(onReady) {
  let active = true; let pending = null
  const art = {
    image: null,
    dispose() {
      active = false
      if (pending) { pending.onload = null; pending.onerror = null }
      pending = null; art.image = null
    }
  }
  if (typeof wx === 'undefined' || typeof wx.createImage !== 'function') return art
  try {
    pending = wx.createImage()
    pending.onload = () => {
      if (!active || !pending) return
      if (pending.width === 1536 && pending.height === 1024) art.image = pending
      pending.onload = null; pending.onerror = null; pending = null
      if (art.image) onReady()
    }
    pending.onerror = () => {
      if (pending) { pending.onload = null; pending.onerror = null }
      pending = null
    }
    pending.src = 'assets/textbattle/fighters-2d.png'
  } catch (error) { art.dispose() }
  return art
}
function drawSprite(c, art, x, y, size, facing, weapon, gender = 'male') {
  const column = weaponIds.indexOf(weapon)
  if (!art || !art.image || column < 0) return false
  c.save()
  try {
    c.scale(facing, 1)
    const scale = size / 128
    const row = (facing === 1 ? 0 : 2) + (gender === 'female' ? 1 : 0)
    c.drawImage(art.image, column * 256, row * 256, 256, 256,
      x * facing - 116 * scale, y - 228 * scale, 256 * scale, 256 * scale)
    return true
  } catch (error) {
    art.image = null
    return false
  } finally { c.restore() }
}
module.exports = { loadSprites, drawSprite }
