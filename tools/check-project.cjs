const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const root = path.resolve(__dirname, '..')
const config = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'))
const game = JSON.parse(fs.readFileSync(path.join(root, 'game.json'), 'utf8'))
assert.equal(config.compileType, 'game')
assert.equal(game.deviceOrientation, 'portrait')
assert.ok(!config.miniprogramRoot, 'Game entry must resolve at repository root')
for (const folder of ['tests', 'tools', 'tmp', 'art-source', 'docs']) {
  assert.ok(config.packOptions.ignore.some(p => p.type === 'folder' && p.value === folder), 'pack excludes ' + folder)
}
const files = ['game.js']
function collect(dir) {
  for (const item of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const name = path.join(dir, item.name)
    if (item.isDirectory()) collect(name)
    else if (item.name.endsWith('.js')) files.push(name)
    else if (/\.(wxml|wxss)$/.test(item.name)) throw new Error('Mini-program file in game source: ' + name)
  }
}
collect('common')
collect('games')
for (const file of files) {
  const source = fs.readFileSync(path.join(root, file), 'utf8')
  new vm.Script(source, { filename: file })
  for (const match of source.matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
    assert.ok(match[1].startsWith('.'), 'Only local runtime modules: ' + file)
    assert.ok(fs.existsSync(path.resolve(root, path.dirname(file), match[1])), 'Missing module: ' + match[1])
  }
  assert.ok(!/\.roundRect\(/.test(source), 'Avoid unsupported roundRect: ' + file)
}
for (const name of ['app.js', 'app.json', 'app.wxss']) {
  assert.equal(fs.existsSync(path.join(root, name)), false, 'Unexpected old mini-program entry: ' + name)
}
console.log(`${files.length} runtime modules: syntax, local imports, game config and package exclusions OK`)
