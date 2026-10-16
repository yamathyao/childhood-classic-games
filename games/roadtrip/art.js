(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rules.js'), require('./route.js'), require('./scenery.js'))
  else root.RoadArt = factory(root.RoadRules, root.RoadRoute, root.RoadScenery)
})(typeof globalThis !== 'undefined' ? globalThis : this, function (RoadRules, RoadRoute, scenery) {
  'use strict'
  const { CARS } = RoadRules
  const LANE = 84
  const route = RoadRoute
  const METERS = 8
  const sizes = [[42, 65], [43, 73], [47, 77], [44, 75], [44, 71], [45, 82]]

  function rect(ctx, x, y, w, h, color, radius = 0) {
    ctx.fillStyle = color
    if (radius === 0) { ctx.fillRect(x, y, w, h); return }
    const r = (Array.isArray(radius) ? radius : [radius, radius, radius, radius]).map(n => Math.max(0, Math.min(n, w / 2, h / 2)))
    ctx.beginPath(); ctx.moveTo(x + r[0], y); ctx.lineTo(x + w - r[1], y)
    ctx.quadraticCurveTo(x + w, y, x + w, y + r[1]); ctx.lineTo(x + w, y + h - r[2])
    ctx.quadraticCurveTo(x + w, y + h, x + w - r[2], y + h); ctx.lineTo(x + r[3], y + h)
    ctx.quadraticCurveTo(x, y + h, x, y + h - r[3]); ctx.lineTo(x, y + r[0])
    ctx.quadraticCurveTo(x, y, x + r[0], y); ctx.closePath(); ctx.fill()
  }

  function circle(ctx, x, y, r, color) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
  }

  function line(ctx, x, y, x2, y2, color, width = 1) {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke()
  }

  function text(ctx, value, x, y, color, size, align = 'center', weight = '500') {
    ctx.fillStyle = color; ctx.font = `${weight} ${size}px "Segoe UI", "Microsoft YaHei", sans-serif`; ctx.textAlign = align
    ctx.fillText(value, x, y)
  }

  function drawCar(ctx, model, x, y, options = {}) {
    const car = CARS[model]; const [w, h] = sizes[model]
    ctx.save(); ctx.translate(x, y); ctx.rotate(options.angle || 0)
    const color = car.color
    // A single soft, offset silhouette keeps the cars readable against the asphalt.
    rect(ctx, -w / 2 + 5, -h / 2 + 6, w + 3, h, '#25362e24', 7)
    for (const side of [-1, 1]) {
      rect(ctx, side * (w / 2 - 1) - 3, -h * .3, 6, 16, '#293631', 2)
      rect(ctx, side * (w / 2 - 1) - 3, h * .20, 6, 16, '#293631', 2)
      rect(ctx, side * (w / 2 + 1) - 2, -7, 4, 6, car.dark, 1)
    }
    rect(ctx, -w / 2, -h / 2, w, h, car.dark, model === 1 ? 10 : 5)
    rect(ctx, -w / 2, -h / 2, w, h - 4, color, model === 1 ? 10 : 5)
    rect(ctx, -w / 2 + 2, -h / 2 + 6, 2, h - 17, '#ffffff29', 1)
    rect(ctx, w / 2 - 4, -h / 2 + 7, 2, h - 16, '#182e2919', 1)
    const glass = '#314948'; const shine = '#7eaaa329'
    if (model === 5) {
      rect(ctx, -w / 2 + 2, -h / 2 + 3, w - 4, 19, '#f1eddf', 3)
      rect(ctx, -16, -h / 2 + 5, 32, 11, glass, 3)
      line(ctx, 0, -h / 2 + 5, 0, -h / 2 + 16, '#deded0', 2)
      rect(ctx, -16, -15, 32, 44, '#e5e1d1', 4)
      for (let i = 0; i < 5; i++) line(ctx, -11, -8 + i * 6, 11, -8 + i * 6, '#c7cab9')
      rect(ctx, -21, -6, 3, 23, '#6b9088', 1); rect(ctx, 18, -6, 3, 23, '#6b9088', 1)
      rect(ctx, -15, 31, 30, 7, glass, 2)
      circle(ctx, 0, -27, 3.3, '#e9e9dd'); text(ctx, 'W', 0, -25, '#839e93', 4)
      rect(ctx, -18, -39, 7, 4, '#faf0be', 2); rect(ctx, 11, -39, 7, 4, '#faf0be', 2)
    } else {
      rect(ctx, -w / 2 + 6, -h * .25, w - 12, 15, glass, [4, 4, 1, 1])
      rect(ctx, -w / 2 + 8, -h * .25 + 2, w - 17, 3, shine, 1)
      rect(ctx, -w / 2 + 6, h * .19, w - 12, 11, glass, [1, 1, 4, 4])
      rect(ctx, -w / 2 + 5, -h * .05, 3, h * .25, glass, 1)
      rect(ctx, w / 2 - 8, -h * .05, 3, h * .25, glass, 1)
      rect(ctx, -w / 2 + 9, -h * .07, w - 18, h * .30, car.roof, 3)
      if (model === 0) {
        rect(ctx, -9, -h / 2 + 2, 4, 12, '#f8efd6', 1); rect(ctx, 5, -h / 2 + 2, 4, 12, '#f8efd6', 1)
        rect(ctx, -9, h * .39, 4, 5, '#f4e7c9'); rect(ctx, 5, h * .39, 4, 5, '#f4e7c9')
        circle(ctx, -14, -h / 2 + 4, 4, '#f3e7bb'); circle(ctx, 14, -h / 2 + 4, 4, '#f3e7bb')
        line(ctx, -8, -h / 2 + 7, 8, -h / 2 + 7, '#e8e1be'); circle(ctx, 0, -h / 2 + 7, 2.6, '#d6dbc8')
      } else if (model === 1) {
        rect(ctx, -8, -h * .06, 16, h * .27, '#a54f3c', 2)
        for (let i = 0; i < 4; i++) line(ctx, -12, 25 + i * 2, 12, 25 + i * 2, '#8c4a3b', 1)
        rect(ctx, -21, 30, 42, 3, '#b45840', 1)
        circle(ctx, -14, -h / 2 + 6, 4, '#f0debe'); circle(ctx, 14, -h / 2 + 6, 4, '#f0debe')
        rect(ctx, -3, -h / 2 + 9, 6, 4, '#a58d4b', 1)
      } else if (model === 2) {
        for (let i = -1; i <= 1; i += 2) rect(ctx, i * 14 - 1, -6, 2, 27, '#596a53', 1)
        rect(ctx, -18, -h / 2 + 3, 36, 5, '#3c5144', 1)
        circle(ctx, -14, -h / 2 + 6, 3, '#eae2b6'); circle(ctx, 14, -h / 2 + 6, 3, '#eae2b6')
        circle(ctx, 0, 34, 10, '#33463b'); circle(ctx, 0, 34, 6.5, '#8a967c')
        circle(ctx, 0, 34, 3, '#b1b9a0')
      } else if (model === 3) {
        rect(ctx, -14, -h * .21, 28, h * .52, glass, 6)
        line(ctx, -12, -1, 12, -1, '#617574', 1)
        line(ctx, -9, -13, 8, -5, '#d6e5dc24', 2)
        line(ctx, -17, -h / 2 + 4, -9, -h / 2 + 2, '#f8f4cc', 2)
        line(ctx, 9, -h / 2 + 2, 17, -h / 2 + 4, '#f8f4cc', 2)
        text(ctx, 'T', 0, -h / 2 + 10, '#7f8b83', 5, 'center', '700')
      } else if (model === 4) {
        rect(ctx, -3, -h / 2 + 1, 2, 6, '#354e54', 1); rect(ctx, 1, -h / 2 + 1, 2, 6, '#354e54', 1)
        rect(ctx, -18, -h / 2 + 2, 10, 3, '#eee8c8', 1); rect(ctx, 8, -h / 2 + 2, 10, 3, '#eee8c8', 1)
        circle(ctx, 0, -h / 2 + 9, 2, '#e0e7dc')
        line(ctx, -10, -2, 8, 11, '#ceddda22', 2)
        rect(ctx, -19, 30, 38, 2, '#496572', 1)
      }
    }
    rect(ctx, -w / 2 + 4, h / 2 - 5, 7, 3, options.braking ? '#ff8061' : '#a95543', 1)
    rect(ctx, w / 2 - 11, h / 2 - 5, 7, 3, options.braking ? '#ff8061' : '#a95543', 1)
    if (model !== 2) rect(ctx, -5, h / 2 - 4, 10, 2, '#e3e2cc', 1)
    if (options.player) {
      const below = h / 2 + 14
      ctx.fillStyle = '#fff8d9'; ctx.beginPath(); ctx.moveTo(0, below - 4); ctx.lineTo(-4, below + 2); ctx.lineTo(4, below + 2); ctx.fill()
      text(ctx, 'YOU', 0, below + 15, '#f0edcf', 7, 'center', '600')
    }
    ctx.restore()
  }

  function tree(ctx, x, y, size, variant = 0) {
    ctx.save(); ctx.translate(x, y)
    ctx.save(); ctx.translate(11, 14); ctx.rotate(.55); ctx.scale(1, .65 / .85)
    circle(ctx, 0, 0, size * .85, '#45603f19'); ctx.restore()
    rect(ctx, -2, 0, 4, size * .8, '#807c55', 1)
    const palette = variant % 3 === 0 ? ['#8c9e68', '#9eaf78', '#acb983'] : variant % 3 === 1 ? ['#728c59', '#829a64', '#96aa72'] : ['#9da26a', '#aeb17a', '#b9be8a']
    circle(ctx, 0, 0, size, palette[0]); circle(ctx, -size * .23, -size * .21, size * .78, palette[1])
    circle(ctx, -size * .35, -size * .4, size * .46, palette[2])
    ctx.restore()
  }

  function lamp(ctx, x, y, right) {
    line(ctx, x + 1, y + 2, x + 33, y + 32, '#394c3720', 3)
    line(ctx, x, y, x, y - 32, '#89977b', 2)
    line(ctx, x, y - 32, x + (right ? -16 : 16), y - 32, '#89977b', 2)
    rect(ctx, x + (right ? -23 : 9), y - 35, 14, 5, '#d8ddc5', 2)
    circle(ctx, x, y, 4, '#9caa8b')
  }

  function cafe(ctx, x, y) {
    rect(ctx, x + 9, y + 9, 97, 108, '#697a4d25', 3)
    rect(ctx, x - 7, y + 66, 108, 58, '#d9d7b6', 2)
    for (let i = 0; i < 6; i++) line(ctx, x - 7, y + 76 + i * 8, x + 101, y + 76 + i * 8, '#cbccac')
    rect(ctx, x, y, 94, 83, '#d4b792', 3)
    rect(ctx, x - 5, y - 4, 104, 72, '#bd8367', 3)
    for (let i = 0; i < 8; i++) line(ctx, x, y + 4 + i * 8, x + 95, y + 4 + i * 8, '#a9755c', 1)
    rect(ctx, x + 41, y - 6, 6, 75, '#cd9875', 1)
    rect(ctx, x + 70, y + 9, 12, 19, '#a46f56', 2)
    rect(ctx, x + 72, y + 7, 12, 4, '#dbc4a3', 1)
    for (let i = 0; i < 7; i++) rect(ctx, x - 3 + i * 14, y + 68, 14, 14, i % 2 ? '#efdfbb' : '#be7655', 1)
    rect(ctx, x + 22, y + 84, 51, 15, '#f5e9ca', 2)
    text(ctx, 'SLOW COFFEE', x + 47, y + 94, '#7f7860', 6, 'center', '600')
    for (const px of [x + 13, x + 83]) {
      circle(ctx, px + 2, y + 111, 8, '#485e3d15'); circle(ctx, px, y + 108, 7, '#f2e8c8')
      circle(ctx, px, y + 108, 1, '#bfaa80'); rect(ctx, px - 3, y + 117, 6, 4, '#88966f', 1)
    }
  }

  function restArea(ctx, x, y) {
    rect(ctx, x, y, 115, 178, '#aab397', 3)
    rect(ctx, x + 5, y + 5, 105, 168, '#bcc3ab', 2)
    for (let i = 0; i < 3; i++) {
      line(ctx, x + 12 + i * 31, y + 13, x + 12 + i * 31, y + 75, '#e6e8ce', 1.5)
      line(ctx, x + 12 + i * 31, y + 103, x + 12 + i * 31, y + 165, '#e6e8ce', 1.5)
    }
    text(ctx, 'P', x + 91, y + 93, '#e5e7d4', 12)
    ctx.save(); ctx.translate(x + 29, y + 42); ctx.scale(.63, .63); drawCar(ctx, 5, 0, 0); ctx.restore()
    ctx.save(); ctx.translate(x + 60, y + 135); ctx.rotate(Math.PI); ctx.scale(.63, .63); drawCar(ctx, 3, 0, 0); ctx.restore()
    for (const dx of [8, 35, 62, 89]) rect(ctx, x + dx, y - 13, 17, 6, '#859a68', 2)
  }

  function sign(ctx, x, y) {
    rect(ctx, x + 5, y + 10, 2, 48, '#819573'); rect(ctx, x + 74, y + 10, 2, 48, '#819573')
    rect(ctx, x + 4, y + 4, 81, 48, '#536a4825', 3)
    rect(ctx, x, y, 81, 47, '#4f7258', 3)
    ctx.strokeStyle = '#d5dfbc'; ctx.lineWidth = 1; ctx.strokeRect(x + 3, y + 3, 75, 41)
    text(ctx, '下一站', x + 12, y + 16, '#e6ebd2', 7, 'left')
    text(ctx, '好 心 情', x + 12, y + 31, '#f2f0d7', 11, 'left', '600')
    text(ctx, '↑', x + 66, y + 31, '#e2e9cc', 21)
  }

  function roadScene(ctx, width, height, state, playerY, origin) {
    const world = y => state.distance + (playerY - y) / METERS
    const screenY = distance => playerY - (distance - state.distance) * METERS
    const at = y => route.sample(world(y))
    function strip(left, right, color) {
      ctx.beginPath(); ctx.moveTo(origin + left(at(-10)), -10)
      for (let y = -10; y <= height + 12; y += 8) ctx.lineTo(origin + left(at(y)), y)
      for (let y = height + 12; y >= -10; y -= 8) ctx.lineTo(origin + right(at(y)), y)
      ctx.closePath(); ctx.fillStyle = color; ctx.fill()
    }
    function strokePath(coordinate, start, end, color, thickness, dashed = false) {
      if (start > end) return
      ctx.beginPath()
      for (let d = start; d <= end + .001; d += .9) {
        const x = origin + coordinate(d); const y = screenY(d)
        if (d === start) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = color; ctx.lineWidth = thickness; ctx.setLineDash(dashed ? [13, 15] : [])
      ctx.stroke(); ctx.setLineDash([])
    }
    const near = world(height + 30); const far = world(-30)
    scenery.draw(ctx, { width, height, origin, world, screenY }, { rect, circle, line, tree })
    // Roadside furniture uses the same world coordinates as the curved roadway.
    const first = Math.floor(near / 19) * 19
    for (let d = first; d < far; d += 19) {
      const road = route.sample(d); const y = screenY(d)
      const seed = Math.floor(d / 19)
      if (scenery.bridgeAt(d)) continue
      const exit = route.exitAt(d)
      const rampNearby = (d < 125) || (exit && d > exit.start - 15 && d < exit.end + 20)
      const landmark = scenery.landmarkFor(d)
      if (!landmark || Math.abs(landmark.distance - d) > 18) tree(ctx, origin + road.left - 67 - Math.sin(seed * 2) * 18, y, 23 + Math.abs(seed % 3) * 4, Math.abs(seed))
      if (!rampNearby) tree(ctx, origin + road.right + 64 + Math.cos(seed) * 16, y + 30, 21, Math.abs(seed + 1))
      if (seed % 4 === 0) lamp(ctx, origin + road.left - 27, y + 65, false)
    }
    strip(r => r.left - 38, r => r.left - 19, '#d9d8bb')
    strip(r => r.left - 15, r => r.right + 15, '#a9b393')

    function ramp(xAt, start, end, label, exit) {
      const from = Math.max(near - 10, start); const to = Math.min(far + 10, end)
      if (from >= to) return
      strokePath(xAt, from, to, '#a6af91', LANE + 13)
      strokePath(xAt, from, to, '#737b70', LANE + 3)
      strokePath(d => xAt(d) - 36, from, to, '#ece6c4', 2)
      strokePath(d => xAt(d) + 36, from, to, '#ece6c4', 2)
      strokePath(xAt, from, to, '#d8ddbe', 2, true)
      const d = exit ? start + 70 : 22
      if (d > near && d < far) {
        ctx.save(); ctx.translate(origin + xAt(d), screenY(d))
        const slope = xAt(d + .5) - xAt(d - .5)
        ctx.rotate(Math.atan(slope / METERS)); text(ctx, label, 0, 0, '#e8e5c6', 10)
        text(ctx, exit ? '↗' : '↑', 0, -27, '#e8e5c6', 29); ctx.restore()
      }
    }
    ramp(route.entryX, -70, route.ENTRY_END, '汇入', false)
    for (let start = route.exitAt(near).start; start <= far; start += route.EXIT_INTERVAL) {
      const exit = { start, end: start + 110 }
      ramp(d => route.exitX(d, exit), exit.start, exit.end + 12, '结算出口', true)
    }
    strip(r => r.left - 8, r => r.right + 8, '#747b70')
    strip(r => r.left, r => r.right, '#747a72')
    strokePath(d => route.sample(d).left - 4, near, far, '#e5e1bd', 2)
    // Break the main-road edge line at each ramp mouth to make the physical merge readable.
    for (let d = Math.floor(near); d < far; d += 1.3) {
      const exit = route.exitAt(d)
      const opening = (d >= 55 && d <= 110) || (exit && d >= exit.start && d <= exit.start + 57)
      if (!opening || Math.floor(d / 3) % 2 === 0) strokePath(n => route.sample(n).right + 4, d, d + 1.3, '#e5e1bd', 2)
    }
    for (let lane = 1; lane < 4; lane++) {
      for (let d = Math.floor(near / 14) * 14; d < far; d += 14) {
        if (route.sample(d + 2).maxLane < lane - .42) continue
        strokePath(n => route.sample(n).left + lane * LANE, d, Math.min(d + 5.5, far), '#d2d6bd', 2)
      }
    }
    for (let d = Math.floor(near / 2.5) * 2.5; d < far; d += 2.5) {
      const r = route.sample(d); const y = screenY(d)
      rect(ctx, origin + r.left - 12, y, 3, 10, '#dcdcb9')
      rect(ctx, origin + r.right + 10, y, 3, 10, '#dcdcb9')
    }
    // Bridge fittings follow both curved road edges; all supports stay outside the driving lanes.
    for (const span of scenery.bridges(near, far)) {
      const from = Math.max(near, span.start); const to = Math.min(far, span.end)
      for (const side of [-1, 1]) {
        const edge = d => side < 0 ? route.sample(d).left : route.sample(d).right
        strokePath(d => edge(d) + side * 19, from, to, '#526f70', 18)
        strokePath(d => edge(d) + side * 17, from, to, '#d4d8c6', 8)
        strokePath(d => edge(d) + side * 27, from, to, '#acc4be', 3)
        for (let d = Math.ceil(from / 3) * 3; d <= to; d += 3) {
          line(ctx, origin + edge(d) + side * 14, screenY(d), origin + edge(d) + side * 28, screenY(d), '#e6e5cf', 3)
        }
        for (const tower of [span.start + 52, span.end - 52]) {
          const tipX = origin + edge(tower) + side * 57; const tipY = screenY(tower) - 20
          for (const offset of [-42, -28, -14, 14, 28, 42]) {
            const anchor = tower + offset
            if (Math.max(tower, anchor) < near - 6 || Math.min(tower, anchor) > far + 6) continue
            line(ctx, tipX, tipY, origin + edge(anchor) + side * 25, screenY(anchor), '#d8decd', 2)
          }
          if (tower < near - 8 || tower > far + 8) continue
          const x = origin + edge(tower) + side * 34; const y = screenY(tower)
          rect(ctx, x - 13, y - 24, 28, 56, '#3b626044', 4)
          rect(ctx, x - 12, y - 30, 24, 48, '#b18465', 3)
          rect(ctx, x - 8, y - 34, 16, 41, '#ead9b7', 2)
          line(ctx, x, y - 23, tipX, tipY, '#ebdab9', 10)
          circle(ctx, tipX, tipY, 6, '#f2e4c6')
        }
      }
    }
    for (let d = Math.floor(near / 12) * 12; d < far; d += 12) {
      const change = route.nextChange(d)
      if (change.to < change.from && change.remaining > 0 && change.remaining < 125) {
        const x = origin + route.laneX(d, change.from - 1); const y = screenY(d)
        text(ctx, '↖', x, y, '#efdb91', 32)
      }
      if (change.to < change.from && d >= change.start && d <= change.end) {
        const r = route.sample(d); const x = origin + r.right + 14; const y = screenY(d)
        rect(ctx, x - 6, y - 5, 12, 10, '#eee3bc', 1)
        rect(ctx, x - 6, y - 3, 12, 3, '#c17745', 1)
      }
    }
    // Real, distance-anchored roadside signs for narrowing and exits.
    const change = route.nextChange(state.distance)
    const signDistance = change.start - 80
    if (change.to < change.from && signDistance > near && signDistance < far) {
      const x = origin + route.sample(signDistance).right + 22; const y = screenY(signDistance)
      rect(ctx, x + 7, y, 3, 61, '#8c9679')
      rect(ctx, x - 4, y - 42, 77, 42, '#edce82', 4)
      text(ctx, '前方并道 ↖', x + 34, y - 25, '#654e31', 9)
      text(ctx, `${change.from} → ${change.to} 车道`, x + 34, y - 10, '#654e31', 11, 'center', '600')
    }
    const nextExit = route.exitAt(state.distance)
    const signAt = nextExit.start - 30
    if (signAt > near && signAt < far) {
      const x = origin + route.sample(signAt).right + 24; const y = screenY(signAt)
      rect(ctx, x + 6, y, 3, 57, '#849273'); rect(ctx, x - 4, y - 45, 86, 44, '#426d52', 4)
      text(ctx, '慢行小镇 ↗', x + 39, y - 27, '#f1edcf', 10)
      text(ctx, '驶出结算 · EXIT', x + 39, y - 12, '#d6dfbb', 9)
    }
    // Capture equipment and its road marking are anchored to the same world distance as the rules.
    for (let d = route.cameraAt(near).distance; d <= far; d += route.CAMERA_INTERVAL) {
      const r = route.sample(d); const y = screenY(d)
      const x = origin + r.right + 28
      line(ctx, origin + r.left + 4, y, origin + r.right - 4, y, '#f1dcb49c', 3)
      for (let lane = 0; lane <= Math.floor(r.maxLane); lane++) {
        text(ctx, '80', origin + route.laneX(d + 5, lane), screenY(d + 5), '#e6dcba', 19, 'center', '600')
      }
      rect(ctx, x - 2, y - 20, 5, 66, '#c2c8ae', 2)
      rect(ctx, x - 15, y - 32, 33, 21, '#344c43', 3)
      circle(ctx, x + 4, y - 22, 6, '#e5e8d5'); circle(ctx, x + 4, y - 22, 3.5, '#283f40')
      circle(ctx, x - 8, y - 22, 2, '#df9e65')
      circle(ctx, x, y + 17, 17, '#b85f46'); circle(ctx, x, y + 17, 13, '#f6efdb')
      text(ctx, '80', x, y + 22, '#394b3e', 14, 'center', '700')
      rect(ctx, x - 28, y + 42, 57, 20, '#edce82', 2)
      text(ctx, '超速抓拍', x, y + 56, '#654e31', 10)
    }
  }

  function drawScene(ctx, area, state, input = {}) {
    if (area.w <= 0 || area.h <= 0) return
    ctx.save(); ctx.beginPath(); ctx.moveTo(area.x, area.y); ctx.lineTo(area.x + area.w, area.y)
    ctx.lineTo(area.x + area.w, area.y + area.h); ctx.lineTo(area.x, area.y + area.h); ctx.closePath(); ctx.clip()
    const width = area.w > 600 ? 1000 : 720
    const scale = area.w / width; const height = area.h / scale
    ctx.translate(area.x, area.y); ctx.scale(scale, scale); ctx.textBaseline = 'alphabetic'
    const playerY = height * .72
    const current = route.sample(state.distance)
    const mainX = route.laneX(state.distance, state.lane)
    const origin = width / 2 - current.center - (state.phase === 'entering' || state.phase === 'exiting' || state.phase === 'arrived' ? (mainX - (current.right - LANE / 2)) * .65 : 0)
    roadScene(ctx, width, height, state, playerY, origin)
    const x = origin + mainX
    if (state.status === 'running' && input.accelerate) {
      for (const side of [-1, 1]) rect(ctx, x + side * 18 - 2, playerY + 43, 4, 22 + Math.sin(state.elapsed * 40) * 7, '#efcf7e7a', 2)
    }
    const cars = state.traffic.filter(car => car.z < playerY / METERS + 9 && car.z > -(height - playerY) / METERS - 9)
    cars.sort((a, b) => b.z - a.z)
    for (const car of cars) {
      const d = state.distance + car.z
      const angle = Math.atan(route.sample(d).slope / METERS) + ((car.targetLane == null ? car.lane : car.targetLane) - car.lane) * .2
      drawCar(ctx, car.model, origin + route.laneX(d, car.lane), playerY - car.z * METERS, { angle, braking: car.speed < car.desired - 1 })
    }
    let slope = current.slope
    if (state.phase === 'entering') slope = route.entryX(state.distance + .5) - route.entryX(state.distance - .5)
    if (state.phase === 'exiting' || state.phase === 'arrived') slope = route.exitX(state.distance + .5, state.chosenExit) - route.exitX(state.distance - .5, state.chosenExit)
    const steering = state.phase !== 'driving' ? 0 : state.mode === 'cruise' ? (state.targetLane - state.lane) * .2 : ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * .08
    const angle = Math.atan(slope / METERS) + steering + (state.status === 'crashed' ? -.11 : 0)
    drawCar(ctx, state.model, x, playerY, { angle, player: true, braking: !!input.brake || state.phase === 'exiting' })
    if (state.status === 'crashed') {
      const y = playerY - 36
      for (let i = 0; i < 7; i++) {
        const a = i * Math.PI * 2 / 7
        line(ctx, x + Math.cos(a) * 17, y + Math.sin(a) * 17, x + Math.cos(a) * 25, y + Math.sin(a) * 25, '#f3d7a7', 2)
      }
    }
    if (state.cameraFlash > 0) rect(ctx, 0, 0, width, height, `rgba(255,245,218,${state.cameraFlash * .5})`)
    ctx.restore()
  }
  return { drawScene, drawCar }
})
