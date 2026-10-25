/**
 * Offline checks for the dsh-composer-meter bundle. No DSH runtime needed:
 * the bundle is a single script that talks to `window.__ModuleLoader__`, so a
 * stub loader plus a stub React reproduces what the Web shell does on load.
 *
 * Run: node validate.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const problems = []
const record = []

// ── stub browser surface ────────────────────────────────────────────────────
let stylesInjected = 0
globalThis.window = {
  __ModuleLoader__: {
    load(entry) {
      record.push(entry)
    },
  },
}
globalThis.document = {
  documentElement: { lang: 'zh-CN' },
  createElement: () => ({ setAttribute() {}, style: {}, remove() {}, textContent: '' }),
  head: {
    appendChild(node) {
      stylesInjected += 1
      void node
    },
  },
}
// Node 24 exposes a getter-only `navigator`; define it on the global instead.
Object.defineProperty(globalThis, 'navigator', {
  value: { language: 'zh-CN' },
  configurable: true,
  writable: true,
})
globalThis.console.warn = (...args) => problems.push(`unexpected warn: ${args.join(' ')}`)

const stubReact = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  Fragment: 'fragment',
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useMemo: (factory) => factory(),
  useRef: () => ({ current: null }),
  useCallback: (fn) => fn,
}

// ── package manifest ────────────────────────────────────────────────────────
const pkg = JSON.parse(fs.readFileSync(path.join(here, 'package.json'), 'utf8'))
if (pkg.type !== 'module') problems.push('package.json: type must be module')
if (pkg.dsh?.bundle?.patch !== './cordis.patch.yml') problems.push('package.json: missing dsh.bundle.patch')
if (pkg.dsh?.client?.platform !== 'web') problems.push('package.json: dsh.client.platform must be web')
for (const file of ['index.js', 'client.js', 'cordis.patch.yml', 'icon.svg', 'locale/en.json', 'locale/zh.json']) {
  if (!fs.existsSync(path.join(here, file))) problems.push(`package.json/files: ${file} is missing`)
}
if (!pkg.exports?.['./client']) problems.push('package.json: missing ./client export')
if (!pkg.exports?.['./icon']) problems.push('package.json: missing ./icon export')
if (!pkg.exports?.['./locale/*.json']) problems.push('package.json: missing ./locale/*.json export')

// The row id in the patch must be the entry point of the browser half's owner.
const patch = fs.readFileSync(path.join(here, 'cordis.patch.yml'), 'utf8')
if (!/name:\s*['"]?dsh-composer-meter['"]?\s*$/m.test(patch)) problems.push('cordis.patch.yml: row name must equal the package name')

// Locale files must carry display metadata for Plugin Manager.
for (const language of ['en', 'zh']) {
  const dict = JSON.parse(fs.readFileSync(path.join(here, 'locale', `${language}.json`), 'utf8'))
  if (typeof dict.meta?.title !== 'string' || dict.meta.title === '') problems.push(`locale/${language}.json: meta.title missing`)
  if (typeof dict.meta?.description !== 'string' || dict.meta.description === '') problems.push(`locale/${language}.json: meta.description missing`)
}

// Icon: valid SVG root, well under the 256 KiB limit.
const icon = fs.readFileSync(path.join(here, 'icon.svg'))
if (icon.length > 256 * 1024) problems.push('icon.svg exceeds 256 KiB')
if (!/^\s*<svg[\s>]/.test(icon.toString('utf8'))) problems.push('icon.svg does not start with an <svg> root')

// ── host half ───────────────────────────────────────────────────────────────
const host = await import(pathToFileURL(path.join(here, 'index.js')).href)
if (typeof host.apply !== 'function') problems.push('index.js: apply export missing')
else host.apply()

// ── browser half ────────────────────────────────────────────────────────────
const source = fs.readFileSync(path.join(here, 'client.js'), 'utf8')
new Function('window', 'document', source)(globalThis.window, globalThis.document)

if (record.length !== 1) problems.push(`client.js registered ${record.length} bundle(s), expected 1`)
const bundle = record[0]
if (bundle?.id !== 'dsh-composer-meter') problems.push(`client.js id "${bundle?.id}" must equal the package name`)
if (typeof bundle?.factory !== 'function') problems.push('client.js factory is not a function')

const exports_ = bundle.factory((name) => {
  if (name === 'react') return stubReact
  throw new Error(`browser half may only require react, asked for "${name}"`)
})
if (typeof exports_.apply !== 'function') problems.push('browser half: apply missing')
if (!Array.isArray(exports_.inject) || exports_.inject.length !== 0) {
  problems.push('browser half: inject must be [] (a pending client entry can fail web boot)')
}

// ── apply() wiring ──────────────────────────────────────────────────────────
const registered = []
let effectCount = 0
const ctx = {
  effect(fn, label) {
    effectCount += 1
    void label
    const dispose = fn()
    if (typeof dispose === 'function') dispose()
  },
  inject(names, run) {
    if (names.includes('locale')) {
      run({
        locale: {
          register(namespace, dicts) {
            if (namespace !== 'composerMeter') problems.push(`locale namespace "${namespace}" != composerMeter`)
            if (!dicts.zh || !dicts.en) problems.push('locale: both zh and en dictionaries are required')
            return () => {}
          },
        },
      })
    }
    if (names.includes('slots')) {
      run({
        slots: {
          inject(owner, factory) {
            if (owner !== 'conversation.composer.dock') problems.push(`slots.inject owner "${owner}"`)
            return factory()
          },
          register(options, component) {
            registered.push({ options, component })
            return () => {}
          },
        },
      })
    }
  },
}
exports_.apply(ctx)

if (effectCount === 0) problems.push('apply() registered no effect (stylesheet missing)')
if (stylesInjected !== 1) problems.push(`expected 1 injected stylesheet, got ${stylesInjected}`)
if (registered.length !== 1) problems.push(`expected 1 slot registration, got ${registered.length}`)
const entry = registered[0]
if (entry?.options?.name !== 'conversation.composer.dock') problems.push('slot name must be conversation.composer.dock')
if (entry?.options?.id !== 'composer-meter') problems.push('slot id must be composer-meter')
if (typeof entry?.options?.order !== 'number') problems.push('slot order must be a number')

// ── render checks ───────────────────────────────────────────────────────────
/** Depth-limited element unwrapping: function components are invoked. */
function render(node) {
  for (let depth = 0; depth < 20; depth++) {
    if (node === null || node === undefined || node === false) return null
    if (typeof node !== 'object' || Array.isArray(node)) return node
    if (typeof node.type !== 'function') return node
    node = node.type({ ...stubReact, ...node.props })
  }
  problems.push('render did not settle within 20 component levels')
  return null
}

/** Visible text of a rendered tree. */
function textOf(node) {
  if (node === null || node === undefined || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  return textOf(node.children ?? [])
}

const Meter = entry.component
function show(props) {
  return textOf(render(Meter({ t: undefined, ...props })))
}

// Empty draft → nothing at all.
if (render(Meter({ useInput: (selector) => selector({ draft: '' }) })) !== null) {
  problems.push('empty draft must render null')
}

// A missing seat degrades to null instead of throwing.
if (render(Meter({ useInput: undefined })) !== null) problems.push('missing useInput must render null')

// A malformed snapshot must not throw.
try {
  show({ useInput: (selector) => selector(undefined) })
} catch (error) {
  problems.push(`malformed snapshot threw: ${error.message}`)
}

// Known drafts → digits on screen.
const zhText = show({ useInput: (selector) => selector({ draft: '你好世界' }) })
if (zhText !== '4 字·≈ 4 tokens') problems.push(`rendered "${zhText}" for the zh sample`)

const enText = show({ useInput: (selector) => selector({ draft: 'hello world' }) })
if (enText !== '11 字·≈ 3 tokens') problems.push(`rendered "${enText}" for the en sample`)

// The no-locale fallback follows the document language.
globalThis.document.documentElement.lang = 'en-US'
globalThis.navigator.language = 'en-US'
const latinFallback = show({ useInput: (selector) => selector({ draft: 'hello' }) })
if (latinFallback !== '5 chars·≈ 2 tokens') problems.push(`en fallback rendered "${latinFallback}"`)
globalThis.document.documentElement.lang = 'zh-CN'
globalThis.navigator.language = 'zh-CN'

const bigText = show({ useInput: (selector) => selector({ draft: 'a'.repeat(7000) }) })
if (!bigText.includes('≈ 2k tokens')) problems.push(`compact form failed: "${bigText}"`)

// Custom translator is honoured (locale seat wired).
const translatedText = show({
  t: (key) => (key === 'chars' ? 'CHARS' : key === 'tokens' ? 'TOKENS' : key === 'estimate' ? '~' : ''),
  useInput: (selector) => selector({ draft: 'ab' }),
})
if (!translatedText.includes('CHARS') || !translatedText.includes('TOKENS')) {
  problems.push(`custom translator ignored: "${translatedText}"`)
}

// ── report ──────────────────────────────────────────────────────────────────
if (problems.length === 0) {
  console.log('OK — manifest, host half, bundle contract, slot wiring and rendering all pass')
  console.log(`samples: ${zhText} | ${enText} | ${bigText}`)
  process.exit(0)
}
console.log(`FAIL (${problems.length})`)
for (const problem of problems) console.log(` - ${problem}`)
process.exit(1)
