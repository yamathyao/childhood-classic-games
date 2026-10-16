(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./route.js'))
  else root.RoadScenery = factory(root.RoadRoute)
})(typeof globalThis !== 'undefined' ? globalThis : this, function (route) {
  'use strict'
  const SEGMENT = 320; const PITCH = 32; const PLOT_WIDTH = 144; const PLOT_HEIGHT = 224
  const THEMES = [
    { id: 'town', name: '晴日街区', ground: '#c6c9ab' },
    { id: 'park', name: '林间公园', ground: '#bed0a3' },
    { id: 'farmland', name: '金色田野', ground: '#d5ce9b' },
    { id: 'coast', name: '海风海岸', ground: '#cdd3b1' },
    { id: 'westlake', name: '西湖 · 断桥烟柳', ground: '#bdd0b3', landmark: 'broken-bridge' },
    { id: 'shanghai', name: '上海 · 东方明珠', ground: '#c3c9bd', landmark: 'pearl-tower' },
    { id: 'riverside', name: '滨河绿道', ground: '#c0cbb1' },
    { id: 'bridge', name: '跨江大桥', ground: '#c1c9ac' },
    { id: 'windmill', name: '风车花田', ground: '#c9d1a0' },
    { id: 'fuji', name: '富士山下', ground: '#cad5bf', landmark: 'mount-fuji' },
    { id: 'paris', name: '巴黎 · 埃菲尔铁塔', ground: '#c9ccb0', landmark: 'eiffel-tower' }
  ]
  function themeAt(distance) {
    const segment = Math.floor(Math.max(0, distance) / SEGMENT)
    return THEMES[segment % THEMES.length]
  }
  function landmarkFor(distance) {
    const theme = themeAt(distance)
    if (!theme.landmark) return null
    const segment = Math.floor(Math.max(0, distance) / SEGMENT)
    return { id: theme.landmark, segment, distance: segment * SEGMENT + 144, side: -1, column: 0 }
  }
  function bridgeAt(distance) {
    if (themeAt(distance).id !== 'bridge') return null
    const base = Math.floor(Math.max(0, distance) / SEGMENT) * SEGMENT
    const start = base + 36; const end = base + SEGMENT - 36
    return distance >= start && distance <= end ? { start, end } : null
  }
  function bridges(near, far) {
    const spans = []
    for (let segment = Math.max(0, Math.floor(near / SEGMENT)); segment * SEGMENT <= far; segment++) {
      const span = bridgeAt(segment * SEGMENT + SEGMENT / 2)
      if (span && span.end >= near && span.start <= far) spans.push(span)
    }
    return spans
  }
  // Reserve the full ramp corridor as well as the main carriageway.
  function edgeAt(distance, side) {
    const r = route.sample(distance)
    if (side < 0) return r.left - 30
    let edge = r.right + 30
    if (distance >= -85 && distance <= route.ENTRY_END + 12) edge = Math.max(edge, route.entryX(distance) + route.LANE / 2 + 28)
    const exit = route.exitAt(distance - 22)
    if (distance >= exit.start - 15 && distance <= exit.end + 20) edge = Math.max(edge, route.exitX(distance, exit) + route.LANE / 2 + 28)
    return edge
  }
  function plots(near, far, width, origin) {
    const result = []
    for (let index = Math.floor((near - 15) / PITCH); index * PITCH <= far + 15; index++) {
      const distance = index * PITCH + PITCH / 2
      const landmark = landmarkFor(distance)
      for (const side of [-1, 1]) {
        let edge = edgeAt(distance, side)
        // The whole footprint stays clear even where the road bends beside a large building.
        for (let offset = -14; offset <= 14; offset += 2) edge = side < 0 ? Math.min(edge, edgeAt(distance + offset, side)) : Math.max(edge, edgeAt(distance + offset, side))
        for (let column = 0; column < 3; column++) {
          const x = origin + edge + side * (PLOT_WIDTH / 2 + column * (PLOT_WIDTH + 12))
          if (x + PLOT_WIDTH / 2 < 0 || x - PLOT_WIDTH / 2 > width) continue
          result.push({ distance, x, side, column, landmark: landmark && landmark.distance === distance && landmark.side === side && landmark.column === column ? landmark.id : null,
            variant: ((index + column * 3 + (side > 0 ? 1 : 0)) % 6 + 6) % 6, theme: themeAt(distance), w: PLOT_WIDTH, h: PLOT_HEIGHT })
        }
      }
    }
    return result
  }
  function draw(ctx, options, art) {
    const { width, height, origin, world, screenY } = options
    const { rect, circle, line } = art
    function polygon(points, fill, stroke) {
      ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath()
      if (fill) { ctx.fillStyle = fill; ctx.fill() }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke() }
    }
    function oval(x, y, rx, ry, fill) {
      ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx); circle(ctx, 0, 0, rx, fill); ctx.restore()
    }
    function crown(x, y, size, color) {
      circle(ctx, x + 3, y + 5, size, '#45603f18'); circle(ctx, x, y, size, color)
      circle(ctx, x - size * .25, y - size * .25, size * .66, '#ffffff18')
    }
    function bench(x, y) {
      rect(ctx, x - 17, y - 5, 34, 11, '#a98a60', 2)
      line(ctx, x - 17, y - 2, x + 17, y - 2, '#d0b483'); line(ctx, x - 12, y + 6, x - 12, y + 11, '#64745d', 2)
      line(ctx, x + 12, y + 6, x + 12, y + 11, '#64745d', 2)
    }
    function building(x, y, w, h, roof, shop) {
      rect(ctx, x - w / 2 + 6, y - h / 2 + 9, w, h + 17, '#58634c24', 4)
      rect(ctx, x - w / 2, y - h / 2 + 12, w, h + 6, '#e0cdb1', 3)
      rect(ctx, x - w / 2 - 3, y - h / 2, w + 6, h, roof, 4)
      for (let row = 1; row < 5; row++) line(ctx, x - w / 2 + 3, y - h / 2 + row * h / 5, x + w / 2 - 3, y - h / 2 + row * h / 5, '#33483420')
      rect(ctx, x - 3, y - h / 2, 6, h, '#ffffff22', 1)
      rect(ctx, x - w / 2 + 10, y + h / 2 + 3, 14, 12, '#58746a', 1)
      rect(ctx, x + w / 2 - 24, y + h / 2 + 3, 14, 12, '#58746a', 1)
      rect(ctx, x - 7, y + h / 2 + 1, 14, 18, '#506052', 1)
      if (shop) {
        for (let i = 0; i < 7; i++) rect(ctx, x - w / 2 + i * w / 7, y + h / 2 - 2, w / 7, 9, i % 2 ? '#f0e4c2' : '#6c9383', 1)
      }
    }
    function pagoda(x, y, color = '#a66c50') {
      rect(ctx, x - 16, y - 36, 32, 64, '#e1c9a4', 2)
      for (let i = 0; i < 4; i++) {
        const yy = y + 21 - i * 19; const w = 29 - i * 4
        polygon([[x - w, yy + 3], [x - w + 7, yy - 3], [x, yy - 12], [x + w - 7, yy - 3], [x + w, yy + 3]], color)
        rect(ctx, x - 4, yy + 4, 8, 8, '#6c6d57', 1)
      }
      line(ctx, x, y - 48, x, y - 58, '#8b7b53', 2)
    }
    function town(v) {
      rect(ctx, -70, -110, 140, 220, '#d9d5ba', 7)
      rect(ctx, -61, -103, 122, 198, '#c9cdae', 4)
      building(0, -49, 102, 71, ['#b97c62', '#829181', '#ae9c75'][v % 3], true)
      building(v % 2 ? -13 : 12, 58, 78, 49, '#b9aa83', false)
      crown(-53, 23, 14, '#8f9e6f'); crown(54, 94, 13, '#92a579')
      rect(ctx, -65, 22, 8, 57, '#acb78c', 2)
    }
    function park(v) {
      rect(ctx, -69, -111, 138, 222, '#a9bf8e', 14)
      line(ctx, -59, -95, 42, 92, '#e1d3ac', 14); line(ctx, -54, 65, 56, -38, '#e1d3ac', 10)
      oval(22, -46, 31, 43, '#82b4ac'); oval(18, -53, 24, 32, '#95c1b3')
      line(ctx, 4, -48, 34, -48, '#c6dcc4'); line(ctx, 17, -32, 34, -32, '#c6dcc4')
      crown(-42, -76, 19, '#829a65'); crown(45, 75, 21, '#809969'); crown(-44, 85, 16, '#92a66f')
      bench(-25, 12); bench(33, 25)
      for (let i = 0; i < 6; i++) circle(ctx, -51 + (i % 3) * 8, -20 + Math.floor(i / 3) * 9, 3, v % 2 ? '#d4aa8f' : '#e2d28d')
    }
    function farmland(v) {
      rect(ctx, -70, -112, 140, 224, '#b5b283', 3)
      for (let row = 0; row < 3; row++) for (let col = 0; col < 2; col++) {
        const x = -65 + col * 69; const y = -106 + row * 72
        const golden = (row + col + v) % 3 !== 0
        rect(ctx, x, y, 63, 66, golden ? '#d5bc6e' : '#9bad76', 2)
        ctx.beginPath()
        for (let i = 0; i < 6; i++) {
          ctx.moveTo(x + 6 + i * 10, y + 5); ctx.lineTo(x + 6 + i * 10, y + 60)
        }
        ctx.strokeStyle = golden ? '#b9a35a' : '#7f9863'; ctx.lineWidth = 2; ctx.stroke()
        ctx.beginPath()
        for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
          ctx.moveTo(x + 6 + i * 10, y + 13 + j * 12); ctx.lineTo(x + 10 + i * 10, y + 9 + j * 12)
        }
        ctx.strokeStyle = golden ? '#ecda8e' : '#bcc58b'; ctx.stroke()
      }
      if (v % 3 === 0) building(27, 76, 45, 34, '#a87055', false)
    }
    function westlake(v, landmark) {
      rect(ctx, -72, -112, 144, 224, '#88b7ac', 12)
      for (let j = 0; j < 9; j++) line(ctx, -50 + (j % 3) * 9, -98 + j * 24, 29 + (j % 2) * 14, -98 + j * 24, '#b5d0b9', 1)
      oval(-32, 67, 36, 43, '#b4c596'); oval(52, -78, 27, 38, '#a7bf90')
      if (landmark) {
        polygon([[-65, -16], [-32, -25], [0, -29], [32, -25], [65, -16], [65, 2], [32, -6], [0, -10], [-32, -6], [-65, 2]], '#e7dbb9', '#c7bb98')
        for (let i = -3; i <= 3; i++) line(ctx, i * 18, -21 + Math.abs(i) * 2, i * 18, -8 + Math.abs(i) * 2, '#b3ad8c', 2)
      } else {
        if (v % 3 === 0) building(-25, 3, 46, 32, '#7e9076', false)
        for (const x of [-41, 30]) {
          oval(x, 60, 9, 22, '#b69a6a'); line(ctx, x, 40, x, 81, '#e9debb', 2)
        }
      }
      crown(51, -90, 17, '#8ba776')
      for (let i = 0; i < 5; i++) line(ctx, 42 + i * 5, -86, 34 + i * 6, -42 + Math.sin(i) * 9, '#9db789', 2)
    }
    function shanghai(v, landmark) {
      rect(ctx, -70, -112, 140, 224, '#d4d3be', 5)
      rect(ctx, -65, -106, 130, 212, '#bfccba', 4)
      if (landmark) {
        oval(10, 84, 50, 18, '#657b6928')
        polygon([[-32, 87], [-9, 11], [9, 11], [32, 87], [23, 87], [0, 40], [-23, 87]], '#a4acaa')
        rect(ctx, -4, -86, 8, 131, '#b4bcb3', 2); line(ctx, 0, -100, 0, -68, '#829792', 2)
        circle(ctx, 0, -54, 17, '#bd7a84'); circle(ctx, -4, -59, 10, '#d49d9c')
        circle(ctx, 0, 19, 30, '#b67b87'); circle(ctx, -6, 12, 21, '#c89598')
        line(ctx, -28, 15, 28, 15, '#ded1ba', 3); line(ctx, -27, 24, 27, 24, '#ded1ba', 2)
        rect(ctx, -40, 91, 80, 8, '#dbdfc9', 3)
      } else {
        const roofs = ['#7f9690', '#9aaca2', '#a4a99b', '#859ba0', '#a69c86', '#8b9b89']
        if (v % 3 === 0) {
          building(0, -47, 100, 65, roofs[v], true)
          building(26, 50, 49, 66, roofs[(v + 2) % 6], false); bench(-30, 59)
        } else {
          building(-29, -38 + v * 4, 48, 83 + v * 4, roofs[v], false)
          building(30, 30 - v * 5, 50, 107 - v * 6, roofs[(v + 2) % 6], false)
          for (let i = 0; i < 4; i++) { line(ctx, -46, -64 + i * 18 + v * 4, -12, -64 + i * 18 + v * 4, '#c4d0bd', 3); line(ctx, 13, -14 + i * 17 - v * 5, 46, -14 + i * 17 - v * 5, '#e3e1c8', 3) }
        }
      }
      crown(-54, 82, 12, '#8fa478'); crown(53, -91, 11, '#8fa478')
    }
    function windmill(v) {
      rect(ctx, -69, -112, 138, 224, '#a9ba83', 5)
      for (let j = 0; j < 8; j++) {
        const y = -100 + j * 27
        line(ctx, -62, y, 61, y, ['#cf9a80', '#d3bd74', '#b194b2', '#d9aa94'][(j + v) % 4], 12)
        for (let x = -56; x < 63; x += 14) circle(ctx, x, y - 2, 3, '#f5e7bd70')
      }
      if (v !== 2 && v !== 5) {
        rect(ctx, -69, -17, 138, 13, '#e0d2a8', 2)
        if (v === 0) building(22, 77, 52, 30, '#b88160', false)
        return
      }
      oval(2, 25, 36, 31, '#6b7c5833')
      polygon([[-25, 27], [-16, -44], [16, -44], [25, 27]], '#cebb94')
      polygon([[-22, -41], [0, -65], [22, -41]], '#996e52')
      rect(ctx, -7, 8, 14, 20, '#718065', 2)
      ctx.save(); ctx.translate(0, -29); ctx.rotate(.45 + v * .14)
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2); line(ctx, 0, 0, 0, -57, '#7a7858', 3)
        rect(ctx, 1, -55, 12, 39, '#e8dfbe', 1)
        for (let j = 0; j < 4; j++) line(ctx, 1, -52 + j * 10, 12, -52 + j * 10, '#b7aa80')
      }
      circle(ctx, 0, 0, 5, '#97774f'); ctx.restore()
    }
    function fuji(v, landmark) {
      rect(ctx, -70, -112, 140, 224, '#b7c8aa', 12)
      oval(0, 66, 66, 40, '#98b6a5')
      if (landmark) {
        polygon([[-68, 38], [-40, 0], [-15, -55], [1, -88], [19, -51], [44, 1], [68, 38]], '#91a9a0')
        polygon([[-68, 38], [1, -88], [-13, -5], [13, 38]], '#a7b9ab')
        polygon([[-29, -28], [1, -88], [31, -28], [17, -37], [8, -26], [-1, -42], [-12, -31], [-19, -39]], '#f2eed9')
      } else {
        building(0, -49, 87, 58, '#7b8980', false)
        line(ctx, -48, 26, 48, 26, '#e7d8b5', 8)
      }
      if (landmark) pagoda(-31, 79, '#b96f57')
      for (const [x, y] of [[48, 52], [43, 93], [-49, -72]]) {
        crown(x, y, 17, '#d3aca4'); circle(ctx, x - 8, y - 6, 6, '#e4c4b7')
      }
    }
    function paris(v, landmark) {
      rect(ctx, -70, -112, 140, 224, '#b3c196', 9)
      rect(ctx, -17, -110, 34, 220, '#e1d2ad', 3)
      if (landmark) {
        polygon([[-48, 95], [-22, 15], [-11, -38], [-3, -91], [3, -91], [11, -38], [22, 15], [48, 95], [29, 95], [15, 54], [0, 43], [-15, 54], [-29, 95]], '#8b866d')
        for (let i = 0; i < 7; i++) {
          const y = -48 + i * 20; const w = 8 + i * 4.8
          line(ctx, -w, y, w, y, '#d5c3a0', 2)
          if (i < 6) { line(ctx, -w, y, w + 4.8, y + 20, '#c5b28f'); line(ctx, w, y, -w - 4.8, y + 20, '#c5b28f') }
        }
        rect(ctx, -29, 22, 58, 5, '#716e57', 1); rect(ctx, -14, -34, 28, 4, '#716e57', 1)
        line(ctx, 0, -91, 0, -106, '#77735c', 2)
      } else {
        if (v % 3 === 0) {
          circle(ctx, 0, -15, 38, '#d9d7ba'); circle(ctx, 0, -15, 29, '#8db5ad'); circle(ctx, 0, -15, 10, '#d7dfc7')
          bench(0, 72)
        } else {
          building(0, -47, 88, 57, '#9b9d89', false); building(v % 2 ? -12 : 12, 51, 87, 48, '#a8a28e', true)
        }
      }
      for (const x of [-55, 55]) for (const y of [-83, -23, 46]) crown(x, y, 12, '#849d6a')
    }
    function boat(x, y, color = '#d6bb83') {
      oval(x + 5, y + 6, 12, 29, '#315d6820')
      polygon([[x, y - 27], [x + 11, y - 9], [x + 9, y + 23], [x, y + 29], [x - 9, y + 23], [x - 11, y - 9]], color)
      rect(ctx, x - 6, y - 8, 12, 27, '#f0e6c7', 3); rect(ctx, x - 4, y - 5, 8, 9, '#789a9a', 1)
      line(ctx, x - 15, y + 33, x - 6, y + 43, '#d4e5d180'); line(ctx, x + 15, y + 33, x + 6, y + 43, '#d4e5d180')
    }
    function palm(x, y) {
      line(ctx, x + 2, y + 22, x, y, '#aa9469', 4)
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3
        const dx = Math.cos(a) * 24; const dy = Math.sin(a) * 18
        polygon([[x - 3, y + 1], [x + dx * .5 - 4, y + dy * .5 - 5], [x + dx, y + dy], [x + dx * .5 + 4, y + dy * .5 + 4]], i % 2 ? '#829d6c' : '#6f9067')
      }
    }
    function coast(v, landmark, plot) {
      if (plot.side < 0) {
        if (v % 2) town(v)
        else { park(v); palm(38, 20) }
        return
      }
      if (plot.column === 0) {
        line(ctx, -57, -111, -57, 111, '#dcc7a0', 8)
        if (v % 2 === 0) {
          circle(ctx, -35, -29, 16, v % 4 ? '#c88e72' : '#eadbb1')
          for (let i = 0; i < 6; i++) line(ctx, -35, -29, -35 + Math.cos(i * Math.PI / 3) * 15, -29 + Math.sin(i * Math.PI / 3) * 15, '#f5e8bd', 1)
          rect(ctx, -44, 0, 17, 32, '#f3e5bf', 2)
        }
        if (v === 1) palm(-44, 62)
      }
      if (v === 3) boat(37, 36, '#e1d8b4')
    }
    function riverside(v, landmark, plot) {
      if (plot.side < 0) { if (v % 3 === 0) town(v); else park(v); return }
      if (plot.column === 0) {
        line(ctx, -59, -112, -59, 112, '#e2d8b5', 12)
        if (v % 2 === 0) { crown(-56, -62, 13, '#8fa47a'); bench(-55, 54) }
        if (v === 1 || v === 4) {
          rect(ctx, -39, 20, 60, 14, '#baa781', 2)
          for (let i = 0; i < 6; i++) line(ctx, -37 + i * 10, 22, -37 + i * 10, 32, '#dfcba4')
          boat(39, 26)
        }
      } else if (v === 2) boat(0, 0, '#c89975')
    }
    function bridge(v, landmark, plot) {
      if (!bridgeAt(plot.distance)) return
      if (plot.column === 0 && v === 1) boat(0, -10, '#e1d9b7')
    }
    const painters = { town, park, farmland, westlake, shanghai, windmill, fuji, paris, coast, riverside, bridge }
    // World-anchored bands have stable boundaries when a different district enters the view.
    for (let y = 0; y < height; y += 8) {
      const d = world(y + 4); const theme = themeAt(d); const h = Math.min(8, height - y)
      rect(ctx, 0, y, width, h, theme.ground)
      const edge = origin + edgeAt(d, 1)
      if (theme.id === 'coast') {
        rect(ctx, Math.max(0, edge), y, Math.max(0, width - edge), h, '#e4d6ab')
        rect(ctx, Math.max(0, edge + 68), y, Math.max(0, width - edge - 68), h, '#82b5b4')
        rect(ctx, Math.max(0, edge + 63), y, Math.min(5, Math.max(0, width - edge - 63)), h, '#cadbd0')
      } else if (theme.id === 'riverside') {
        rect(ctx, Math.max(0, edge), y, Math.max(0, width - edge), h, '#d9d4b8')
        rect(ctx, Math.max(0, edge + 34), y, Math.max(0, width - edge - 34), h, '#87b2a9')
        rect(ctx, Math.max(0, edge + 29), y, Math.min(5, Math.max(0, width - edge - 29)), h, '#afbaa0')
      } else if (bridgeAt(d)) rect(ctx, 0, y, width, h, '#83aaa8')
    }
    // Ripples use world coordinates too, so water scrolls without random shimmer.
    for (let d = Math.floor(world(height) / 8) * 8; d <= world(0); d += 8) {
      const theme = themeAt(d); const span = bridgeAt(d)
      if (!span && theme.id !== 'coast' && theme.id !== 'riverside') continue
      const from = span ? 0 : Math.max(0, origin + edgeAt(d, 1) + (theme.id === 'coast' ? 80 : 48))
      for (let x = from + ((Math.floor(d / 8) % 3 + 3) % 3) * 13; x < width - 14; x += 64) {
        line(ctx, x, screenY(d), Math.min(width, x + 25), screenY(d), '#d1e1ce70')
        line(ctx, x + 9, screenY(d) + 6, Math.min(width, x + 39), screenY(d) + 6, '#497f8720')
      }
    }
    const visible = plots(world(height), world(0), width, origin)
    for (const side of [-1, 1]) {
      ctx.save(); ctx.beginPath()
      ctx.moveTo(side < 0 ? 0 : width, -1)
      for (let y = -1; y <= height + 9; y += 8) ctx.lineTo(origin + edgeAt(world(y), side), y)
      ctx.lineTo(side < 0 ? 0 : width, height + 9); ctx.closePath(); ctx.clip()
      for (const plot of visible) {
        if (plot.side !== side) continue
        ctx.save(); ctx.translate(plot.x, screenY(plot.distance)); painters[plot.theme.id](plot.variant, plot.landmark, plot); ctx.restore()
      }
      ctx.restore()
    }
    return visible.length
  }
  return { SEGMENT, THEMES, PITCH, PLOT_WIDTH, PLOT_HEIGHT, themeAt, landmarkFor, bridgeAt, bridges, edgeAt, plots, draw }
})
