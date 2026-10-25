/**
 * Extract the built-in light/dark alias palette from an installed dsh build and
 * write it to `.cache/theme-alias-dark.json` for `build-acid-theme.mjs`.
 *
 * Point it at the ui-theme client bundle inside the installed app:
 *
 *   node tools/parse-theme.mjs "<app>/resources/app.asar.unpacked/dsh/node_modules/@deepseek-ai/dsh-client-ui-theme/lib/client.js"
 *
 * If your install only ships that file inside `app.asar`, extract it once; any
 * file containing the token stylesheet works.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const file = process.argv[2]
if (file === undefined) {
  console.error('usage: node tools/parse-theme.mjs <path-to-ui-theme/lib/client.js>')
  process.exit(1)
}
const text = fs.readFileSync(file, 'utf8')

function blockAfter(marker) {
  const at = text.indexOf(marker)
  if (at === -1) throw new Error(`marker not found: ${marker}`)
  const open = text.indexOf('{', at)
  const close = text.indexOf('}', open)
  return text.slice(open + 1, close)
}

function pairs(body) {
  const out = {}
  for (const match of body.matchAll(/(--dsw-alias-[a-z0-9-]+):([^;}]+)/g)) out[match[1]] = match[2].trim()
  return out
}

const dark = pairs(blockAfter('body[data-ds-dark-theme]{--dsw-alias-bg-base'))
const light = pairs(blockAfter('body{--dsw-alias-bg-base'))

const outDir = path.join(repo, '.cache')
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'theme-alias-dark.json'), JSON.stringify(dark, null, 1))
fs.writeFileSync(path.join(outDir, 'theme-alias-light.json'), JSON.stringify(light, null, 1))
console.log(`dark alias tokens: ${Object.keys(dark).length}`)
console.log(`light alias tokens: ${Object.keys(light).length}`)
console.log(`written to ${outDir}`)
