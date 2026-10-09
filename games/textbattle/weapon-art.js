function drawWeapon(c, x, y, size, facing, id) {
  const p = (a, b) => [x + a * size * facing, y + b * size]
  const stroke = (points, color, width) => {
    c.beginPath(); c.moveTo(...p(...points[0]))
    points.slice(1).forEach(point => c.lineTo(...p(...point)))
    c.strokeStyle = color; c.lineWidth = Math.max(.6, size * width); c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke()
  }
  const shape = (points, fill, border = '#e3e9dc') => {
    c.beginPath(); c.moveTo(...p(...points[0])); points.slice(1).forEach(point => c.lineTo(...p(...point)))
    c.closePath(); c.fillStyle = fill; c.fill(); c.strokeStyle = border; c.lineWidth = Math.max(.6, size * .013); c.stroke()
  }
  const grip = (guardWidth = .14) => {
    stroke([[-.045, .17], [.025, -.075]], '#6a4435', .075)
    for (let i = 0; i < 3; i++) stroke([[-.062 + i * .021, .12 - i * .058], [.006 + i * .021, .14 - i * .058]], '#c79c63', .018)
    stroke([[-guardWidth, -.13], [guardWidth, -.035]], '#e2ba72', .05)
    shape([[-.09, .15], [-.02, .17], [-.025, .225], [-.095, .205]], '#dcb572', '#f1d9a5')
  }
  if (id === 'sword') {
    // Straight, symmetrical double-edged blade with a central ridge.
    shape([[-.025, -.13], [.13, -.67], [.255, -.88], [.252, -.64], [.075, -.10]], '#adc3cd')
    shape([[.012, -.12], [.255, -.88], [.075, -.10]], '#e8f1ee', '#e8f1ee')
    stroke([[.025, -.14], [.255, -.88]], '#738e9d', .016)
    grip(.145)
  } else if (id === 'saber') {
    // Broad back and a curved cutting edge ending in an upswept tip.
    c.beginPath(); c.moveTo(...p(-.01, -.12))
    c.quadraticCurveTo(...p(.075, -.43), ...p(.25, -.76))
    c.lineTo(...p(.48, -.84))
    c.quadraticCurveTo(...p(.4, -.53), ...p(.15, -.07))
    c.closePath(); c.fillStyle = '#aac0cb'; c.fill()
    c.strokeStyle = '#dbeae9'; c.lineWidth = Math.max(.6, size * .016); c.stroke()
    stroke([[.13, -.12], [.30, -.47], [.45, -.79]], '#fff5db', .026)
    stroke([[.015, -.14], [.15, -.53], [.25, -.74]], '#6c8899', .014)
    grip(.18)
  } else if (id === 'spear' || id === 'halberd') {
    stroke([[-.2, .55], [.36, -.94]], '#614736', .062)
    stroke([[-.2, .55], [.36, -.94]], '#c2985f', .027)
    shape([[.32, -.91], [.34, -1.07], [.465, -1.25], [.46, -1.03], [.40, -.89]], '#bacdd4')
    stroke([[.305, -.84], [.405, -.8]], '#e5bf77', .05)
    stroke([[.35, -.85], [.26, -.61], [.29, -.52]], '#e48671', .036)
    stroke([[.38, -.83], [.43, -.65], [.48, -.56]], '#b9534d', .039)
    stroke([[-.2, .55], [-.17, .46]], '#b4c8d0', .07)
    if (id === 'halberd') {
      shape([[.30, -.87], [.10, -1.04], [.10, -.88], [.04, -.75], [.22, -.77]], '#bacdd4')
      shape([[.40, -.83], [.66, -.91], [.55, -.75], [.56, -.62], [.40, -.72]], '#bacdd4')
    }
  } else if (id === 'dual') {
    shape([[-.025, -.09], [.09, -.35], [.245, -.54], [.25, -.28], [.09, -.055]], '#a9c6cf')
    stroke([[.08, -.075], [.23, -.46]], '#f3f3df', .022)
    grip(.10)
  } else if (id === 'axe') {
    stroke([[-.05, .3], [.1, -.82]], '#74503c', .075)
    stroke([[-.05, .3], [.1, -.82]], '#bd8b54', .026)
    c.beginPath(); c.moveTo(...p(.1, -.73))
    c.quadraticCurveTo(...p(.28, -.71), ...p(.36, -.96))
    c.quadraticCurveTo(...p(.75, -.66), ...p(.40, -.34))
    c.quadraticCurveTo(...p(.35, -.56), ...p(.075, -.56))
    c.closePath(); c.fillStyle = '#bacdd4'; c.fill()
    c.strokeStyle = '#edf4e9'; c.lineWidth = Math.max(.6, size * .015); c.stroke()
    stroke([[.07, -.75], [.13, -.74]], '#e5bf77', .055)
    stroke([[.045, -.56], [.11, -.55]], '#e5bf77', .055)
    stroke([[-.08, .3], [-.01, .31]], '#dbb570', .065)
  }
}
module.exports = { drawWeapon }
