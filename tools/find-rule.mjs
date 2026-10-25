/**
 * Print CSS rules whose selector contains a keyword, so a UI affordance can be
 * traced to the token that paints it instead of guessed by name.
 *
 * Usage: node _recon/find-rule.mjs <keyword> <file>...
 */
import fs from 'node:fs'

const keyword = (process.argv[2] ?? '').toLowerCase()
const files = process.argv.slice(3)
const seen = new Set()

for (const file of files) {
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    continue
  }
  // CSS rule = selector{something}
  for (const match of text.matchAll(/([^{}<>`"]{1,220})\{([^{}]{0,400})\}/g)) {
    const selector = match[1].trim()
    const body = match[2]
    if (!selector.startsWith('.') && !selector.startsWith('[') && !selector.startsWith(':') && !selector.startsWith('&')) continue
    const tokens = [...body.matchAll(/var\((--dsw-[a-z0-9-]+)\)/g)].map((m) => m[1])
    if (tokens.length === 0) continue
    // `token=--dsw-x` matches the token instead of the selector text.
    const selectorHit = !keyword.startsWith('token=') && selector.toLowerCase().includes(keyword)
    const tokenHit = keyword.startsWith('token=') && tokens.includes(keyword.slice('token='.length))
    if (!selectorHit && !tokenHit) continue
    const key = `${selector}|${body}`
    if (seen.has(key)) continue
    seen.add(key)
    console.log(`\n${selector}`)
    const props = [...body.matchAll(/([a-z-]+)\s*:\s*([^;]{0,120})/g)].slice(0, 8).map((m) => `${m[1]}:${m[2].trim()}`)
    console.log(`  ${props.join('; ')}`)
    console.log(`  tokens: ${[...new Set(tokens)].join(', ')}`)
  }
}
if (seen.size === 0) console.log('no matching rule')
