/**
 * Report, for every token this plugin patches, which CSS properties consume it.
 * A token that our patch gives a light value while the shell uses it as a
 * background (or vice versa) is exactly how a "white chip with white text"
 * appears, so this check is about usage, not just value.
 *
 * Usage: node _recon/token-usage.mjs <tokens.json> <css-or-js-file>...
 */
import fs from 'node:fs'

const files = process.argv.slice(3)
const tokens = Object.keys(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')))
const wanted = new Set(tokens)

const usage = new Map()
for (const file of files) {
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    continue
  }
  for (const match of text.matchAll(/([a-z-]+)\s*:\s*[^;{}]*?var\((--dsw-alias-[a-z0-9-]+)\)/g)) {
    const property = match[1]
    const token = match[2]
    if (!wanted.has(token)) continue
    if (!usage.has(token)) usage.set(token, new Set())
    usage.get(token).add(property)
  }
}

const rows = [...usage.entries()].sort((a, b) => a[0].localeCompare(b[0]))
for (const [token, properties] of rows) {
  const list = [...properties].sort().join(', ')
  const kind = /background|fill|shadow/.test(list) ? 'FILL' : /color/.test(list) ? 'TEXT' : 'OTHER'
  console.log(`${kind.padEnd(6)} ${token.padEnd(48)} ${list}`)
}
console.log(`\n${rows.length}/${tokens.length} patched tokens have a recorded consumer`)
