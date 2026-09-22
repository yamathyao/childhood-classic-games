const tutorials = require('./tutorial-data.js')
const sourceOriginals = require('./level-data.js')
// Keep the published XSokoban source intact, but expose its final twenty
// layouts as the focused challenge chapter in the game.
const originals = sourceOriginals.filter(level => level.order >= 31).map(level => ({ ...level, sourceOrder: level.order }))
const levels = [...tutorials, ...originals].map((level, index) => {
  const tutorial = index < tutorials.length
  const originalOrder = index - tutorials.length + 1
  return {
    ...level,
    order: index + 1,
    name: tutorial ? level.name : `挑战关卡 ${level.sourceOrder || originalOrder}`,
    chapter: level.chapter,
    template: tutorial ? level.template : '挑战关卡',
    challenge: tutorial ? '基础关卡' : '挑战关卡'
  }
})
const defaultLevel = levels[0]
function getLevel(id) { return levels.find(level => level.id === id) || defaultLevel }
module.exports = { levels, tutorials, originals, defaultLevel, getLevel }
