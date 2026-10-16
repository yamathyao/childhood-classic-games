// The native game owns the portable simulation and art; the standalone preview serves local mirrors.
const fs = require('node:fs')
const path = require('node:path')
for (const name of ['route.js', 'rules.js', 'scenery.js', 'art.js']) {
  fs.copyFileSync(path.join(__dirname, '../games/roadtrip', name), path.join(__dirname, 'previews/roadtrip', name))
}
