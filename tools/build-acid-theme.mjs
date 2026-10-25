/**
 * Splice the built-in dark palette into dsh-acid-core/client.js.
 *
 * The Acid-Mono theme has to be complete: a registered theme replaces the active
 * one wholesale, so any alias token it omits falls back to whatever the platform
 * stylesheet has — which is how a theme ends up with a white-on-white control
 * three screens deep. So the base is lifted verbatim from the installed dsh
 * build (`body[data-ds-dark-theme]` in @deepseek-ai/dsh-client-ui-theme) and only
 * the surface / rule / label tokens are repainted on top (THEME_PATCH in
 * client.js carries those by hand).
 *
 * Refresh when the host's token set changes:
 *
 *   # 1. point at the ui-theme bundle inside the installed app
 *   node tools/parse-theme.mjs "<...>/app.asar.unpacked/dsh/node_modules/@deepseek-ai/dsh-client-ui-theme/lib/client.js"
 *   #    (writes .cache/theme-alias-dark.json)
 *   # 2. rewrite the marked block in client.js
 *   node tools/build-acid-theme.mjs
 *
 * Paths are relative to this repository, so the script works from any checkout.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const TOKENS_JSON = process.argv[2] ?? path.join(repo, '.cache', 'theme-alias-dark.json')
const CLIENT = path.join(repo, 'dsh-acid-core', 'client.js')
const BEGIN = '/* @acid-theme-base:begin */'
const END = '/* @acid-theme-base:end */'

const tokens = JSON.parse(fs.readFileSync(TOKENS_JSON, 'utf8'))
const names = Object.keys(tokens).sort()
if (names.length < 90) {
  console.error(`FAIL: only ${names.length} alias tokens parsed, expected the full set`)
  process.exit(1)
}

const literal = `{\n${names.map((name) => `      '${name}': '${String(tokens[name]).replace(/'/g, "\\'")}',`).join('\n')}\n    }`

const source = fs.readFileSync(CLIENT, 'utf8')
const beginAt = source.indexOf(BEGIN)
const endAt = source.indexOf(END)
if (beginAt === -1 || endAt === -1 || endAt < beginAt) {
  console.error('FAIL: token markers missing from client.js')
  process.exit(1)
}

const next = `${source.slice(0, beginAt + BEGIN.length)} ${literal} ${source.slice(endAt)}`
fs.writeFileSync(CLIENT, next)
console.log(`OK - ${names.length} alias tokens spliced into client.js`)
console.log(`sample: ${names.slice(0, 3).map((n) => `${n}=${tokens[n]}`).join(' | ')}`)
