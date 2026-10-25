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

// ── stat pill contract ──────────────────────────────────────────────────────
const pill = render(Meter({ useInput: (selector) => selector({ draft: 'abc' }) }))
if (pill?.type !== 'button') problems.push(`pill must be a button, got ${pill?.type}`)
if (pill?.props?.['data-composer-stat'] !== 'composer-meter') problems.push('pill must carry data-composer-stat=composer-meter')
if (pill?.props?.['aria-expanded'] !== 'false') problems.push('pill starts collapsed')

// Cost is session-level: with usage and the built-in price table it stays
// visible even when the draft is empty.
const seedUsage = { uncachedInputTokens: 1e6, cacheReadTokens: 2e6, cacheWriteTokens: 0, outputTokens: 1e6 }
const costOnly = render(Meter({
  useInput: (selector) => selector({ draft: '' }),
  useProjection: () => seedUsage,
}))
if (costOnly === null) problems.push('empty draft with usage must still render the cost pill')
else if (!textOf(costOnly).includes('¥')) problems.push(`cost-only pill missing ¥: "${textOf(costOnly)}"`)

// ── pure helpers ────────────────────────────────────────────────────────────
const test = exports_.__test
if (test === undefined) {
  problems.push('browser half: __test seams missing')
} else {
  const usage = { uncachedInputTokens: 1e6, cacheReadTokens: 1e6, cacheWriteTokens: 0, outputTokens: 1e6 }
  const cost = test.computeCost(usage, { input: 2, cacheRead: 0.2, cacheWrite: 2, output: 8 })
  if (cost === null || Math.abs(cost - 10.2) > 1e-9) problems.push(`computeCost: expected 10.2, got ${cost}`)
  if (test.computeCost(undefined, { input: 2 }) !== null) problems.push('computeCost: missing usage must be null')
  if (test.computeCost(usage, {}) !== null) problems.push('computeCost: empty price table must be null')
  const money = [
    [0, '0'],
    [0.00123, '0.0012'],
    [0.5, '0.500'],
    [10.2, '10.20'],
  ]
  for (const [value, expected] of money) {
    if (test.formatMoney(value) !== expected) problems.push(`formatMoney(${value}) = ${test.formatMoney(value)}, expected ${expected}`)
  }
  const parts = test.classifyDraft('a 汉字\n')
  if (parts.cjk !== 2 || parts.latin !== 1 || parts.spaces !== 2) problems.push(`classifyDraft: ${JSON.stringify(parts)}`)
  if (test.countLines('a\nb') !== 2) problems.push('countLines: wrong line count')

  // Pricing: official presets, peak/idle switching, custom and legacy shapes.
  const peakAt = new Date('2026-10-26T02:00:00Z') // Beijing Monday 10:00
  const idleAt = new Date('2026-10-26T05:00:00Z') // Beijing Monday 13:00
  const weekendAt = new Date('2026-10-25T02:00:00Z') // Beijing Sunday 10:00
  if (test.isPeakHour(peakAt) !== true) problems.push('isPeakHour: Monday 10:00 Beijing must be peak')
  if (test.isPeakHour(idleAt) !== false) problems.push('isPeakHour: Monday 13:00 Beijing must be idle')
  if (test.isPeakHour(weekendAt) !== false) problems.push('isPeakHour: Sunday must be idle')
  const flashPeak = test.resolvePricing({ mode: 'flash' }, peakAt)
  if (flashPeak.prices.input !== 2 || flashPeak.prices.cacheRead !== 0.04 || flashPeak.prices.output !== 8) {
    problems.push(`resolvePricing(flash, peak): ${JSON.stringify(flashPeak.prices)}`)
  }
  const flashIdle = test.resolvePricing({ mode: 'flash' }, idleAt)
  if (flashIdle.prices.input !== 1 || flashIdle.prices.output !== 4) problems.push(`resolvePricing(flash, idle): ${JSON.stringify(flashIdle.prices)}`)
  const proPeak = test.resolvePricing({ mode: 'pro' }, peakAt)
  if (proPeak.prices.input !== 9 || proPeak.prices.output !== 27) problems.push(`resolvePricing(pro, peak): ${JSON.stringify(proPeak.prices)}`)
  const custom = test.resolvePricing({ mode: 'custom', custom: { input: 3.5 } }, peakAt)
  if (custom.prices.input !== 3.5 || custom.peak !== false) problems.push(`resolvePricing(custom): ${JSON.stringify(custom)}`)
  const legacy = test.normalizePricing({ input: 1, cacheRead: 0.1 })
  if (legacy.mode !== 'custom' || legacy.custom.input !== 1) problems.push(`normalizePricing(legacy): ${JSON.stringify(legacy)}`)
  if (test.normalizePricing(null).mode !== 'flash') problems.push('normalizePricing(null) must fall back to flash')
  const peakCost = test.computeCost(usage, flashPeak.prices)
  if (peakCost === null || Math.abs(peakCost - 10.04) > 1e-9) problems.push(`computeCost(flash peak): expected 10.04, got ${peakCost}`)

  // Draft cleanup: invisible characters and blank-line runs outside fences.
  const dirty = 'a\u200b \n\n\n\nb \u00a0\n'
  const cleaned = test.cleanDraft(dirty)
  if (cleaned.text !== 'a\n\nb\n') problems.push(`cleanDraft: "${JSON.stringify(cleaned.text)}"`)
  if (cleaned.changes === 0) problems.push('cleanDraft: no changes counted')
  const fenced = '```\n a  \n\n\n\n```'
  if (test.cleanDraft(fenced).text !== fenced) problems.push('cleanDraft: fenced code must stay byte-for-byte intact')

  // Draft vault: minimum length, dedupe, count cap.
  if (test.appendSnapshot([], 'short', 1).length !== 0) problems.push('appendSnapshot: short drafts must not snapshot')
  const twenty = 'x'.repeat(20)
  let vault = test.appendSnapshot([], twenty, 1)
  if (vault.length !== 1) problems.push('appendSnapshot: one snapshot expected')
  vault = test.appendSnapshot(vault, twenty, 2)
  if (vault.length !== 1) problems.push('appendSnapshot: identical snapshot must not duplicate')
  for (let i = 0; i < 30; i += 1) vault = test.appendSnapshot(vault, `${twenty}-${i}`, i)
  if (vault.length > 20) problems.push(`appendSnapshot: cap ${vault.length} > 20`)
  if (!/^\d{2}:\d{2}$/.test(test.formatClock(Date.now()))) problems.push('formatClock: expected HH:mm')
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
