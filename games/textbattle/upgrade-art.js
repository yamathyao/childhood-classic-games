const { box, text } = require('../../common/canvas.js')
const ids = ['atk', 'hp', 'def', 'spd', 'crit', 'dodge']
const qualities = ['normal', 'fine', 'epic', 'legendary']
const fallback = ['锋', '元', '守', '疾', '破', '轻']
function loadUpgradeIcons(onReady) {
  let active = true; let requested = false; let pending = null
  const art = {
    image: null,
    ensure() {
      if (!active || requested || typeof wx === 'undefined' || typeof wx.createImage !== 'function') return
      requested = true
      try {
        pending = wx.createImage()
        pending.onload = () => {
          if (!active || !pending) return
          if (pending.width === 768 && pending.height === 512) art.image = pending
          pending.onload = null; pending.onerror = null; pending = null
          if (art.image) onReady()
        }
        pending.onerror = () => {
          if (pending) { pending.onload = null; pending.onerror = null }
          pending = null
        }
        pending.src = 'assets/textbattle/upgrade-icons.png'
      } catch (error) { if (pending) { pending.onload = null; pending.onerror = null }; pending = null }
    },
    dispose() {
      active = false
      if (pending) { pending.onload = null; pending.onerror = null }
      pending = null; art.image = null
    }
  }
  return art
}
function drawUpgradeIcon(c, art, item, rect) {
  const column = ids.indexOf(item.id); const row = qualities.indexOf(item.quality)
  if (art && art.image && column >= 0 && row >= 0) {
    try { c.drawImage(art.image, column * 128, row * 128, 128, 128, rect.x, rect.y, rect.w, rect.h); return }
    catch (error) { art.image = null }
  }
  // Stay readable while the local atlas loads or on devices with failed image uploads.
  box(c, rect, '#172739', 6, item.color)
  text(c, fallback[column] || '修', rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w * .55, item.color, 'center', true)
}
module.exports = { loadUpgradeIcons, drawUpgradeIcon }
