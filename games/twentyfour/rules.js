;(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory()
  else root.TwentyFour = factory()
})(typeof globalThis === 'object' ? globalThis : this, function () {
  const puzzles = [
    [[3, 4, 6, 2], '(6+4-2)*3', '先试试 6 + 4，把较大的两个数加起来。'],
    [[1, 2, 3, 4], '(1+2+3)*4', '先把 1、2、3 加起来，看看能得到什么。'],
    [[2, 3, 4, 5], '(5+3-2)*4', '24 可以拆成 6 × 4，试着先凑出 6。'],
    [[1, 3, 5, 7], '(7+5)*(3-1)', '一边凑出 12，另一边凑出 2。'],
    [[2, 4, 6, 8], '8*6/(4-2)', '先算 4 − 2，再想想 48 怎样变成 24。'],
    [[1, 2, 6, 8], '8*(6/2)*1', '24 = 8 × 3，先用 6 ÷ 2 凑出 3。'],
    [[1, 2, 4, 8], '8*(4-2+1)', '留住 8，用另外三个数凑出 3。'],
    [[1, 2, 5, 6], '6*(5+1-2)', '留住 6，用另外三个数凑出 4。'],
    [[1, 3, 4, 8], '(8+4)*(3-1)', '先试试 8 + 4，再想想怎样得到 2。'],
    [[1, 2, 4, 6], '6*4*(2-1)', '6 × 4 已经是 24，剩下两个数能凑出 1 吗？'],
    [[1, 3, 6, 9], '(9-1)*(6-3)', '分别凑出 8 和 3，然后相乘。'],
    [[2, 3, 3, 6], '(6+3+3)*2', '把 6 和两个 3 加起来，能得到 12。'],
    [[2, 2, 3, 4], '(4+2+2)*3', '用 4 和两个 2 凑出 8。'],
    [[1, 1, 4, 6], '6*4*1*1', '乘以 1 不会改变结果，试试一路相乘。'],
    [[1, 1, 3, 8], '8*3*1*1', '先找到一对相乘能得到 24 的数。'],
    [[2, 2, 4, 6], '(6+4+2)*2', '24 = 12 × 2，先用三个数凑出 12。'],
    [[1, 3, 6, 8], '6*(8-3-1)', '留住 6，用连续减法凑出 4。'],
    [[1, 4, 4, 8], '(8-1)*4-4', '先试试 8 − 1，再乘一个 4。'],
    [[2, 4, 4, 8], '(8-4+2)*4', '留住一个 4，用另外三个数凑出 6。'],
    [[3, 3, 4, 8], '8*3*(4-3)', '留住 8 和一个 3，另外两个数凑出 1。'],
    [[3, 4, 5, 6], '(5+3-4)*6', '留住 6，另外三个数通过加减凑出 4。'],
    [[2, 3, 6, 9], '(9-3-2)*6', '从 9 连续减去两个数，试着得到 4。'],
    [[1, 2, 7, 8], '(7-1)*(8/2)', '分别凑出 6 和 4，然后相乘。'],
    [[1, 4, 7, 8], '(7-4)*8*1', '先用 7 − 4 凑出 3。'],
    [[1, 5, 6, 8], '6*(8-5+1)', '留住 6，用另外三个数凑出 4。'],
    [[2, 3, 7, 8], '(7-3)*(8-2)', '两次减法，分别得到 4 和 6。'],
    [[2, 4, 5, 6], '6*5-4-2', '6 × 5 得到 30，再试着减去 6。'],
    [[1, 2, 7, 9], '9*2+7-1', '先算 9 × 2，再用剩下的数补足 24。'],
    [[1, 4, 6, 9], '(9-4-1)*6', '留住 6，从 9 中减去另外两个数。'],
    [[2, 3, 5, 6], '6*5-3*2', '分别得到 30 和 6，再相减。'],
    [[2, 4, 5, 8], '(5+2-4)*8', '留住 8，试着用加减凑出 3。']
  ].map(([numbers, solution, hint], id) => ({ id, numbers, solution, hint }))

  function fail(code, message) { const error = new Error(message); error.code = code; throw error }
  function normalize(expression) { return String(expression).replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-') }
  function tokenize(expression) {
    const source = normalize(expression)
    if (source.length > 64) fail('length', '算式太长了，试试更简洁的写法。')
    if (!source.trim()) fail('empty', '先填一个算式，再来验证吧。')
    if (/[^\d\s+\-*/()]/.test(source)) fail('characters', '只支持数字、加减乘除和括号。')
    return source.match(/\d+|[+\-*/()]/g)
  }
  function evaluate(expression) {
    const tokens = tokenize(expression); let index = 0; const steps = []
    function primary() {
      const token = tokens[index++]
      if (token === '(') {
        const value = sum()
        if (tokens[index++] !== ')') fail('syntax', '括号还没配对，请检查一下。')
        return value
      }
      if (!token || !/^\d+$/.test(token)) fail('syntax', '算式还没写完整，检查数字和运算符吧。')
      if (token.length > 1 && token[0] === '0') fail('numbers', '请直接使用题目数字，不能在前面补 0。')
      const value = Number(token)
      if (!Number.isSafeInteger(value)) fail('number', '请使用题目给出的四个数字。')
      return value
    }
    function apply(left, operator, right) {
      if (operator === '/' && right === 0) fail('zero', '除数不能是 0，换一种组合试试。')
      const value = operator === '+' ? left + right : operator === '-' ? left - right : operator === '*' ? left * right : left / right
      steps.push({ left, operator, right, value }); return value
    }
    function product() {
      let value = primary()
      while (tokens[index] === '*' || tokens[index] === '/') { const operator = tokens[index++]; value = apply(value, operator, primary()) }
      return value
    }
    function sum() {
      let value = product()
      while (tokens[index] === '+' || tokens[index] === '-') { const operator = tokens[index++]; value = apply(value, operator, product()) }
      return value
    }
    const value = sum()
    if (index !== tokens.length) fail('syntax', '数字之间需要运算符，也请检查括号。')
    return { value, numbers: tokens.filter(token => /^\d+$/.test(token)).map(Number), steps }
  }
  function usage(expression, numbers) {
    const remaining = (normalize(expression).match(/\d+/g) || []).map(Number)
    return numbers.map(number => { const index = remaining.indexOf(number); if (index < 0) return false; remaining.splice(index, 1); return true })
  }
  function check(expression, numbers) {
    try {
      const result = evaluate(expression)
      const actual = result.numbers.slice().sort((a, b) => a - b)
      const expected = numbers.slice().sort((a, b) => a - b)
      if (actual.length !== expected.length || actual.some((number, i) => number !== expected[i])) {
        return { ok: false, code: 'numbers', message: '四个数字要各用一次，不能拼成多位数哦。' }
      }
      if (Math.abs(result.value - 24) > 1e-9) {
        return { ok: false, code: 'result', value: result.value, message: `算出来是 ${Number(result.value.toFixed(4))}，再试一种组合吧。` }
      }
      return { ok: true, value: result.value, message: '正好 24！这道题解开了。' }
    } catch (error) { return { ok: false, code: error.code, message: error.message } }
  }
  function shuffledPuzzles(random = Math.random) {
    const deck = puzzles.slice()
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]] }
    return deck
  }
  function display(expression) { return expression.replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−') }
  const SAVE_KEY = 'twentyfour.v1'
  const integer = (value, max) => Number.isSafeInteger(value) && value >= 0 && value <= max
  function initialState(random = Math.random) {
    return { version: 1, puzzleId: 0, deck: shuffledPuzzles(random).map(puzzle => puzzle.id).filter(id => id !== 0),
      expression: '', cursor: 0, round: 1, solved: 0, counted: false, completed: false, hintLevel: 0 }
  }
  function restore(value) {
    if (!value || value.version !== 1 || !integer(value.puzzleId, puzzles.length - 1) ||
        !Array.isArray(value.deck) || value.deck.length >= puzzles.length ||
        value.deck.some(id => !integer(id, puzzles.length - 1) || id === value.puzzleId) || new Set(value.deck).size !== value.deck.length ||
        typeof value.expression !== 'string' || value.expression.length > 64 || /[^0-9+\-*/()×÷−]/.test(value.expression) ||
        !integer(value.cursor, value.expression.length) || !integer(value.round, 1000000) || value.round < 1 ||
        !integer(value.solved, value.round) || !integer(value.hintLevel, 2) || typeof value.counted !== 'boolean') return initialState()
    const state = { version: 1, puzzleId: value.puzzleId, deck: value.deck.slice(), expression: display(value.expression), cursor: value.cursor,
      round: value.round, solved: value.solved, counted: value.counted, hintLevel: value.hintLevel }
    state.completed = value.completed === true && check(state.expression, puzzles[state.puzzleId].numbers).ok
    if ((state.completed && !state.counted) || (state.counted && state.solved === 0)) return initialState()
    return state
  }
  function snapshot(state) { return { ...state, deck: state.deck.slice() } }
  function edit(state, key) {
    if (key === 'left' || key === 'right') { state.cursor = Math.max(0, Math.min(state.expression.length, state.cursor + (key === 'left' ? -1 : 1))); return true }
    if (key === 'clear') { state.expression = ''; state.cursor = 0 }
    else if (key === 'delete') {
      if (!state.cursor) return false
      state.expression = state.expression.slice(0, state.cursor - 1) + state.expression.slice(state.cursor); state.cursor--
    } else {
      if (!/^[0-9+\-*/()×÷−]$/.test(key) || state.expression.length >= 64) return false
      state.expression = state.expression.slice(0, state.cursor) + display(key) + state.expression.slice(state.cursor); state.cursor++
    }
    state.completed = false; return true
  }
  function submit(state) {
    const result = check(state.expression, puzzles[state.puzzleId].numbers)
    state.completed = result.ok
    if (result.ok && !state.counted) { state.solved++; state.counted = true }
    return result
  }
  function next(state, random = Math.random) {
    if (!state.deck.length) state.deck = shuffledPuzzles(random).map(puzzle => puzzle.id).filter(id => id !== state.puzzleId)
    state.puzzleId = state.deck.pop(); state.expression = ''; state.cursor = 0; state.round = Math.min(1000000, state.round + 1)
    state.counted = false; state.completed = false; state.hintLevel = 0
  }
  return { puzzles, normalize, evaluate, usage, check, shuffledPuzzles, display, SAVE_KEY, initialState, restore, snapshot, edit, submit, next }
})
