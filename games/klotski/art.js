// Portraits are optional: a missing/failed image must never block the game.
const portraits = {}
let started = false
const subscribers = new Set()

function loadPortraits(repaint) {
  subscribers.add(repaint)
  if (!started) {
    started = true
    // The local atlas manifest is populated when the illustration assets are ready.
  }
  return { portraits, dispose: () => subscribers.delete(repaint) }
}
module.exports = { loadPortraits }
