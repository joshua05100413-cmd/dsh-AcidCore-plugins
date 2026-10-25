/**
 * Offline checks for the dsh-acid-core bundle.
 *
 * The bundle is one script that talks to `window.__ModuleLoader__`, so a stub
 * loader plus a stub React reproduces the Web shell's load path. Coverage:
 * manifest/patch/locale/icon, the plugin contract, apply() wiring against stub
 * `theme`/`slots`/`locale` services, the theme's completeness and contrast, the
 * geometry build, parameter clamping, and the rendered Settings section.
 *
 * What it cannot cover — and does not pretend to — is WebGL: shader
 * compilation, actual line output and frame pacing are runtime properties.
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
const storage = new Map()

globalThis.window = {
  devicePixelRatio: 2,
  innerWidth: 1440,
  innerHeight: 900,
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  addEventListener() {},
  removeEventListener() {},
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  },
  __ModuleLoader__: { load(entry) { record.push(entry) } },
}
globalThis.document = {
  documentElement: { lang: 'zh-CN' },
  hidden: false,
  querySelector: () => null,
  body: {
    attributes: {},
    setAttribute(name, value) { globalThis.document.body.attributes[name] = value },
    removeAttribute(name) { delete globalThis.document.body.attributes[name] },
  },
  createElement: (tag) => ({ tagName: tag.toUpperCase(), setAttribute() {}, style: {}, remove() {}, textContent: '', appendChild() {} }),
  head: { appendChild() { stylesInjected += 1 } },
  addEventListener() {},
  removeEventListener() {},
}
Object.defineProperty(globalThis, 'navigator', { value: { language: 'zh-CN' }, configurable: true, writable: true })
globalThis.requestAnimationFrame = () => 0
globalThis.cancelAnimationFrame = () => {}

const warnings = []
globalThis.console.warn = (...args) => warnings.push(args.map(String).join(' '))

const stubReact = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  Fragment: 'fragment',
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useMemo: (factory) => factory(),
  useRef: () => ({ current: null }),
  useCallback: (fn) => fn,
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
}

// ── package manifest ────────────────────────────────────────────────────────
const pkg = JSON.parse(fs.readFileSync(path.join(here, 'package.json'), 'utf8'))
if (pkg.type !== 'module') problems.push('package.json: type must be module')
if (pkg.dsh?.bundle?.patch !== './cordis.patch.yml') problems.push('package.json: missing dsh.bundle.patch')
if (pkg.dsh?.client?.platform !== 'web') problems.push('package.json: dsh.client.platform must be web')
for (const file of ['index.js', 'client.js', 'cordis.patch.yml', 'icon.svg', 'locale/en.json', 'locale/zh.json']) {
  if (!fs.existsSync(path.join(here, file))) problems.push(`package.json/files: ${file} is missing`)
}
for (const entry of ['./client', './icon', './locale/*.json']) {
  if (!pkg.exports?.[entry]) problems.push(`package.json: missing ${entry} export`)
}

const patch = fs.readFileSync(path.join(here, 'cordis.patch.yml'), 'utf8')
if (!/name:\s*['"]?dsh-acid-core['"]?\s*$/m.test(patch)) problems.push('cordis.patch.yml: row name must equal the package name')

for (const language of ['en', 'zh']) {
  const dict = JSON.parse(fs.readFileSync(path.join(here, 'locale', `${language}.json`), 'utf8'))
  if (typeof dict.meta?.title !== 'string' || dict.meta.title === '') problems.push(`locale/${language}.json: meta.title missing`)
  if (typeof dict.meta?.description !== 'string' || dict.meta.description === '') problems.push(`locale/${language}.json: meta.description missing`)
}

const icon = fs.readFileSync(path.join(here, 'icon.svg'))
if (icon.length > 256 * 1024) problems.push('icon.svg exceeds 256 KiB')
if (!/^\s*<svg[\s>]/.test(icon.toString('utf8'))) problems.push('icon.svg does not start with an <svg> root')

// ── zero-blocking / no-floating-window contract ─────────────────────────────
const source = fs.readFileSync(path.join(here, 'client.js'), 'utf8')
if (/\bsetTimeout\s*\(/.test(source)) problems.push('client.js uses setTimeout: the startup path must not delay the shell')
if (/\bsetInterval\s*\(/.test(source)) problems.push('client.js uses setInterval: one rAF loop only')
if (!/requestAnimationFrame/.test(source)) problems.push('client.js has no rAF loop')
// The user asked for the controls to live in Settings, not in a floating panel,
// and rejected the brand-mark restyle: the stock fish stays untouched.
if (/dsh-acid-hud/.test(source)) problems.push('client.js still renders the floating HUD')
if (/acid-sandbox/.test(source)) problems.push('client.js still registers the floating sandbox slot entry')
if (!/settings\.section/.test(source)) problems.push('client.js does not register a settings section')
// The logo is recoloured, never replaced: the slot must stay untouched (the
// stock whale keeps its silhouette) and the recolour must be an alpha-holding
// filter, not the box-tinting multiply overlay that read as a lime rectangle.
if (/brand\.mark/.test(source)) problems.push('client.js overrides the brand mark slot: recolour must not replace the logo')
if (!/body\[data-acid-theme="on"\] :is\(\[class\*="_brandMark"\]/.test(source)) {
  problems.push('brand mark recolour rule missing')
}
if (/mix-blend-mode:\s*multiply/.test(source)) problems.push('brand mark is tinted with a multiply overlay: use an alpha filter instead')
if ((source.match(/filter:\s*brightness\(0\)/g) ?? []).length < 1) problems.push('brand mark recolour is not a filter chain')
// The wordmark artboard holds both the letters and the HARNESS badge, so it
// needs three rules: letters via colour, the pill rect, and dark badge letters.
for (const needle of ['[class*="_brandName"]', 'svg > rect:first-of-type', 'svg text']) {
  if (!source.includes(needle)) problems.push(`wordmark rule missing: ${needle}`)
}

// The affordance layer (lime send button, folder icons, sidebar CTA) must be
// scoped to the active acid theme and must not leak into other themes.
const scopedRules = (source.match(/body\[data-acid-theme="on"\]/g) ?? []).length
if (scopedRules < 5) problems.push(`affordance rules are not scoped to the acid theme (${scopedRules} scoped rules)`)
if (/^\s*\[class\*="_primary"\]/m.test(source)) problems.push('unscoped [class*="_primary"] rule: it would repaint other themes')

// ── host half ───────────────────────────────────────────────────────────────
const host = await import(pathToFileURL(path.join(here, 'index.js')).href)
if (typeof host.apply !== 'function') problems.push('index.js: apply export missing')
else {
  const routes = []
  const serverCtx = { effect: (run) => run(), webServer: { register: (route) => { routes.push(route); return () => {} } } }
  host.apply({ inject: (_names, run) => run(serverCtx) })
  for (const expected of ['/acid-core/wallpapers', '/acid-core/wallpaper', '/acid-core/open-wallpapers', '/acid-core/videos', '/acid-core/video', '/acid-core/open-videos']) {
    if (!routes.some((route) => route.path === expected && typeof route.handler === 'function')) problems.push(`missing host route ${expected}`)
  }
}

// ── browser half ────────────────────────────────────────────────────────────
new Function('window', 'document', 'navigator', source)(globalThis.window, globalThis.document, globalThis.navigator)

if (record.length !== 1) problems.push(`client.js registered ${record.length} bundle(s), expected 1`)
const bundle = record[0]
if (bundle?.id !== 'dsh-acid-core') problems.push(`client.js id "${bundle?.id}" must equal the package name`)
if (typeof bundle?.factory !== 'function') problems.push('client.js factory is not a function')

const plugins = bundle.factory((name) => {
  if (name === 'react') return stubReact
  throw new Error(`browser half may only require react, asked for "${name}"`)
})
if (typeof plugins.apply !== 'function') problems.push('browser half: apply missing')
if (!Array.isArray(plugins.inject) || plugins.inject.length !== 0) {
  problems.push('browser half: inject must be [] (a pending client entry can fail web boot)')
}
const test = plugins.__test
if (test === undefined) problems.push('browser half: __test seams missing')

// ── apply() wiring ──────────────────────────────────────────────────────────
const registrations = []
const themeRegistrations = []
const themeListeners = []
let effectCount = 0
let preference = 'system'

// The host ships a complete light alias palette; the stub reproduces its shape
// so the bundle's light palette can be built from it offline.
const LIGHT_STUB = Object.fromEntries(
  Object.keys(test.THEME_BASE).map((name) => [name, name === '--dsw-alias-bg-base' ? '#ffffff' : '#f5f5f5']),
)

const STOCK_THEMES = [
  {
    id: 'light',
    colorScheme: 'light',
    tokens: LIGHT_STUB,
  },
  {
    id: 'dark',
    colorScheme: 'dark',
    tokens: { '--dsw-alias-bg-base': '#151517', '--dsw-alias-bg-layer-3': '#232325', '--dsw-alias-label-primary': '#f5f5f5', '--dsw-alias-state-business-primary': '#7aa2ff' },
  },
]

function snapshot() {
  const resolved = preference === 'system' ? 'dark' : preference
  const active = [...STOCK_THEMES, ...(themeRegistrations.map((entry) => ({ id: entry.id, colorScheme: entry.colorScheme, tokens: entry.tokens })))].find((theme) => theme.id === resolved)
  return { preference, themes: [...STOCK_THEMES, ...themeRegistrations.map((entry) => ({ id: entry.id, colorScheme: entry.colorScheme, tokens: entry.tokens }))], active }
}

const slots = {
  inject(owner, factory) {
    return factory()
  },
  register(options, component) {
    registrations.push({ options, component })
    return () => {}
  },
}

const themeService = {
  getTheme: () => snapshot(),
  setTheme(id) {
    preference = id
    for (const listener of themeListeners) listener()
  },
  register(definition) {
    themeRegistrations.push(definition)
    for (const listener of themeListeners) listener()
    return () => {
      const index = themeRegistrations.indexOf(definition)
      if (index >= 0) themeRegistrations.splice(index, 1)
    }
  },
}

const ctx = {
  effect(fn) {
    effectCount += 1
    // Run it, but keep the registration alive: apply() disposes the theme and
    // the theme/change listener through this disposer, and a stub that calls it
    // would assert against an already-unregistered world.
    fn()
  },
  on(event, handler) {
    if (event === 'theme/change') themeListeners.push(() => handler(snapshot()))
    return () => {}
  },
  inject(names, run) {
    if (names.includes('locale')) {
      run({ locale: { register(namespace) {
        if (namespace !== 'acidCore') problems.push(`locale namespace "${namespace}" != acidCore`)
        return () => {}
      } } })
    }
    if (names.includes('theme')) run({ ...ctx, theme: themeService })
    if (names.includes('slots')) run({ slots })
  },
}

try {
  plugins.apply(ctx)
} catch (error) {
  problems.push(`apply() threw: ${error.message}`)
}

if (effectCount === 0) problems.push('apply() registered no effect')
if (stylesInjected !== 1) problems.push(`expected 1 injected stylesheet, got ${stylesInjected}`)
const EXPECTED_THEMES = test?.THEME_SPECS?.length ?? 0
if (EXPECTED_THEMES < 2) problems.push('browser half exposes no palette list')
if (themeRegistrations.length !== EXPECTED_THEMES) {
  problems.push(`expected ${EXPECTED_THEMES} registered themes, got ${themeRegistrations.length}`)
}
const themeIds = themeRegistrations.map((entry) => entry.id)
if (new Set(themeIds).size !== themeIds.length) problems.push(`duplicate theme ids: ${themeIds.join(', ')}`)
if (themeIds[0] !== 'acid-mono') problems.push(`first theme id "${themeIds[0]}" != acid-mono`)

const slotNames = registrations.map((entry) => entry.options?.name)
for (const expected of ['shell.overlay', 'shell.bottom', 'conversation.header.leading', 'settings.section']) {
  if (!slotNames.includes(expected)) problems.push(`missing registration into ${expected}`)
}
if (registrations.length !== 4) problems.push(`expected 4 registrations, got ${registrations.length}`)
for (const entry of registrations) {
  if (typeof entry.options?.id !== 'string' || typeof entry.options?.order !== 'number') {
    problems.push('every registration needs a string id and a numeric order')
  }
}

// ── theme completeness ──────────────────────────────────────────────────────
function channel(value) {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
function luminance(hex) {
  const clean = hex.replace('#', '').slice(0, 6)
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16))
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}
function isHex(value) {
  return typeof value === 'string' && /^#[0-9a-f]{6}/i.test(value)
}

// acid-mono keeps its exact contract; the other palettes are checked generically.
const registered = themeRegistrations[0]
if (registered !== undefined) {
  const tokens = registered.tokens ?? {}
  if (registered.id !== 'acid-mono') problems.push(`theme id "${registered.id}" != acid-mono`)
  if (registered.colorScheme !== 'dark') problems.push(`theme colorScheme "${registered.colorScheme}" != dark`)
  if (tokens['--dsw-alias-bg-base'] !== '#08090C') problems.push(`bg-base "${tokens['--dsw-alias-bg-base']}" != #08090C`)
  if (tokens['--dsw-alias-label-primary'] !== '#F1F5F9') problems.push(`label-primary "${tokens['--dsw-alias-label-primary']}" != #F1F5F9`)
  if (tokens['--dsw-alias-border-l1'] !== '#1E2330') problems.push('border-l1 != #1E2330')
  if (tokens['--dsw-alias-markdown-code-block'] !== '#0B0D12') problems.push('markdown-code-block != #0B0D12')
  if (!('--dsw-alias-label-primary-foreground' in tokens)) problems.push('missing label-primary-foreground: button labels would keep the stock colour')
}

const ALLOWED = /state-business|brand-primary|button-info|link|deep-diving|document-selection|interactive-bg-hover-accent|specific-sidebar-nav-item-active-accent/
const FORBIDDEN = /label-(?:primary|secondary|tertiary|dimmed|caption|base)|bg-base|bg-layer|markdown-|specific-bubble|specific-input/
const SURFACES = ['--dsw-specific-bubble', '--dsw-specific-input-major', '--dsw-menu-surface-fill', '--dsw-alias-markdown-inline-code', '--dsw-alias-markdown-code-block']

for (const entry of themeRegistrations) {
  const spec = (test.THEME_SPECS ?? []).find((candidate) => candidate.id === entry.id)
  if (spec === undefined) {
    problems.push(`theme "${entry.id}" is not listed in THEME_SPECS`)
    continue
  }
  if (entry.colorScheme !== spec.scheme) problems.push(`theme "${entry.id}" scheme "${entry.colorScheme}" != "${spec.scheme}"`)
  const tokens = entry.tokens ?? {}
  const names = Object.keys(tokens)
  const aliasNames = names.filter((name) => name.startsWith('--dsw-alias-'))
  if (aliasNames.length < 100) problems.push(`theme "${entry.id}" has ${aliasNames.length} alias tokens: a partial theme leaves stock colours behind`)
  for (const extra of ['--dsw-specific-bubble', '--dsw-specific-input-major', '--dsw-menu-surface-fill', '--dsw-linear-gradient-think']) {
    if (!(extra in tokens)) problems.push(`theme "${entry.id}" is missing ${extra}: that surface would keep the stock fill`)
  }
  for (const name of names) {
    if (!/^--dsw-(?:alias|specific|menu|linear|elevation)-/.test(name)) problems.push(`theme "${entry.id}" token "${name}" is outside the reachable families`)
    if (typeof tokens[name] !== 'string' || tokens[name] === '') problems.push(`theme "${entry.id}" token "${name}" has no value`)
  }
  if (tokens['--dsw-alias-state-business-primary'] !== spec.accent) {
    problems.push(`theme "${entry.id}" state-business-primary "${tokens['--dsw-alias-state-business-primary']}" != "${spec.accent}"`)
  }
  if (tokens['--dsw-alias-button-info-fill'] !== spec.accent) problems.push(`theme "${entry.id}" send button is not the accent`)
  if (tokens['--dsw-alias-link'] !== spec.accent) problems.push(`theme "${entry.id}" link is not the accent`)

  const pairs = [
    ['primary on canvas', tokens['--dsw-alias-label-primary'], tokens['--dsw-alias-bg-base'], 12],
    ['primary on layer-1', tokens['--dsw-alias-label-primary'], tokens['--dsw-alias-bg-layer-1'], 12],
    ['secondary on canvas', tokens['--dsw-alias-label-secondary'], tokens['--dsw-alias-bg-base'], 4.5],
    ['secondary on layer-2', tokens['--dsw-alias-label-secondary'], tokens['--dsw-alias-bg-layer-2'], 4.5],
    ['bubble text on bubble fill', tokens['--dsw-alias-label-primary'], tokens['--dsw-specific-bubble'], 7],
    ['composer text on composer fill', tokens['--dsw-alias-label-primary'], tokens['--dsw-specific-input-major'], 7],
    ['inline-code text on chip', tokens['--dsw-alias-label-primary'], tokens['--dsw-alias-markdown-inline-code'], 7],
    ['code text on code block', tokens['--dsw-alias-label-primary'], tokens['--dsw-alias-markdown-code-block'], 7],
    ['tertiary on canvas', tokens['--dsw-alias-label-tertiary'], tokens['--dsw-alias-bg-base'], 4.5],
  ]
  if (spec.scheme === 'dark') {
    // Inverted labels sit on bright fills, not on the canvas: that pair is the
    // meaningful one (the canvas pair is 1:1 by design).
    pairs.push(['inverted label on bright fill', tokens['--dsw-alias-label-primary-inverted'], '#E8EDF3', 12])
  } else {
    // A light palette's inverted label is white on the accent fill.
    pairs.push(['inverted label on accent fill', tokens['--dsw-alias-label-primary-inverted'], spec.accent, 4.5])
    if (isHex(tokens['--dsw-alias-bg-base']) && luminance(tokens['--dsw-alias-bg-base']) < 0.5) {
      problems.push(`light theme "${entry.id}" has a dark canvas (${tokens['--dsw-alias-bg-base']})`)
    }
    for (const name of SURFACES) {
      const value = tokens[name]
      if (typeof value === 'string' && value.startsWith('#') && luminance(value) < 0.5) {
        problems.push(`light theme "${entry.id}" surface ${name} is dark (${value})`)
      }
    }
  }
  for (const [label, fg, bg, floor] of pairs) {
    if (typeof fg !== 'string' || typeof bg !== 'string' || !fg.startsWith('#') || !bg.startsWith('#')) continue
    const ratio = contrast(fg, bg)
    if (ratio < floor) problems.push(`contrast ${label} (${entry.id}): ${ratio.toFixed(2)}:1 < ${floor}:1`)
  }

  if (spec.scheme === 'dark') {
    // A surface that stays bright under a dark palette is the reported failure
    // ("white bubble, unreadable text").
    for (const name of SURFACES) {
      const value = tokens[name]
      if (typeof value === 'string' && value.startsWith('#') && luminance(value) > 0.25) {
        problems.push(`${name} is still a bright fill (${value})`)
      }
    }
  }

  // Accent confinement: the saturated accent may only land on the interactive
  // family, never on a reading surface or a body-text token.
  const saturated = names.filter((name) => String(tokens[name]).toUpperCase().startsWith(spec.accent.toUpperCase()))
  for (const name of saturated) {
    if (!ALLOWED.test(name)) problems.push(`accent leaked onto ${name} (${entry.id})`)
    if (FORBIDDEN.test(name)) problems.push(`accent must not touch a reading token: ${name} (${entry.id})`)
  }
  if (saturated.length < 3) problems.push(`theme "${entry.id}" accent family is too small (${saturated.length})`)
  if (!saturated.some((name) => name.includes('brand-primary-new-color'))) problems.push(`theme "${entry.id}" brand send-button token is not the accent`)
}

// ── geometry ────────────────────────────────────────────────────────────────
const crystal = test.buildCrystal(20, 1)
if (crystal.faceCount !== 20 * 20 * 20) problems.push(`detail 20 faceCount ${crystal.faceCount}, expected 8000`)
if (crystal.vertexCount !== 20 * 231) problems.push(`detail 20 vertexCount ${crystal.vertexCount}, expected 4620`)
if (crystal.lines.length % 2 !== 0) problems.push('line index buffer has an odd length')
let maxIndex = -Infinity
for (const index of crystal.lines) if (index > maxIndex) maxIndex = index
if (maxIndex >= crystal.vertexCount) problems.push(`line index ${maxIndex} exceeds vertexCount ${crystal.vertexCount}`)
for (let i = 0; i < crystal.positions.length; i += 3) {
  const radius = Math.hypot(crystal.positions[i], crystal.positions[i + 1], crystal.positions[i + 2])
  if (Math.abs(radius - 1) > 1e-5) {
    problems.push(`vertex ${i / 3} is not on the unit sphere (r=${radius})`)
    break
  }
}
if (test.buildCrystal(4, 1).vertexCount !== 20 * 15) problems.push('detail 4 vertexCount is wrong')

// ── parameter contract ──────────────────────────────────────────────────────
const spec = test.PARAM_SPEC
const expected = { distortion: [0.45, 0, 1.5], frequency: [1.8, 0.2, 5], speed: [1, 0.1, 3] }
for (const [key, [value, min, max]] of Object.entries(expected)) {
  if (spec[key]?.value !== value) problems.push(`PARAM_SPEC.${key}.value ${spec[key]?.value}, expected ${value}`)
  if (spec[key]?.min !== min) problems.push(`PARAM_SPEC.${key}.min ${spec[key]?.min}, expected ${min}`)
  if (spec[key]?.max !== max) problems.push(`PARAM_SPEC.${key}.max ${spec[key]?.max}, expected ${max}`)
}
test.setParam('distortion', 99)
if (test.getParams().distortion !== 1.5) problems.push(`clamp high failed: ${test.getParams().distortion}`)
test.resetParams()
if (test.getParams().distortion !== 0.45 || test.getParams().speed !== 1) problems.push('resetParams did not restore defaults')

// ── render helpers ──────────────────────────────────────────────────────────
function render(node) {
  for (let depth = 0; depth < 30; depth += 1) {
    if (node === null || node === undefined || node === false) return null
    if (typeof node !== 'object' || Array.isArray(node)) return node
    if (typeof node.type !== 'function') return node
    node = node.type({ ...node.props })
  }
  problems.push('render did not settle')
  return null
}

function walk(node, visit) {
  if (node === null || node === undefined || node === false) return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  if (typeof node !== 'object') return
  if (typeof node.type === 'function') {
    walk(node.type({ ...node.props }), visit)
    return
  }
  visit(node)
  walk(node.children ?? [], visit)
}

// ── settings section ────────────────────────────────────────────────────────
const settingsComponent = registrations.find((entry) => entry.options?.name === 'settings.section')?.component
if (settingsComponent === undefined) problems.push('settings section component not registered')
else {
  // The page reads the theme snapshot; the stub store publishes what apply()
  // published (the stock snapshot), and the registered theme is appended by the
  // fake service, so three tiles must appear.
  const rendered = render(settingsComponent({}))
  const tiles = []
  const sliders = []
  let switches = 0
  let cardTitles = 0
  walk(rendered, (node) => {
    const props = node.props ?? {}
    if (props.className === 'dsh-acid-tile') tiles.push(props)
    if (props.className === 'dsh-acid-range' && Object.keys(test.PARAM_SPEC).some((key) => props.id === `dsh-acid-${key}`)) sliders.push(props)
    if (props.role === 'switch') switches += 1
    if (props.className === 'dsh-acid-card-title') cardTitles += 1
  })
  const expectedTiles = STOCK_THEMES.length + EXPECTED_THEMES
  if (tiles.length !== expectedTiles) problems.push(`expected ${expectedTiles} theme tiles (stock + ${EXPECTED_THEMES} palettes), got ${tiles.length}`)
  for (const tile of tiles) {
    if (typeof tile.onClick !== 'function') problems.push('theme tile has no click handler')
  }
  for (const spec of test.THEME_SPECS ?? []) {
    if (!tiles.some((tile) => tile.title === spec.id)) problems.push(`missing theme tile for ${spec.id}`)
  }
  if (sliders.length !== 3) problems.push(`expected 3 sliders, got ${sliders.length}`)
  if (switches !== 4) problems.push(`expected 4 switches (intro, backdrop, lettering, status strip), got ${switches}`)
  if (cardTitles < 5) problems.push(`expected 5 cards (intro, theme, background, lettering, crystal), got ${cardTitles}`)

  // Tile → theme service: clicking a palette must switch preference, arm the
  // affordance layer with that palette id, and remember the id itself.
  const acidTile = tiles.find((tile) => tile.title === 'acid-mono')
  if (acidTile === undefined) problems.push('acid-mono tile missing')
  else {
    acidTile.onClick()
    if (preference !== 'acid-mono') problems.push(`tile click did not switch the theme: preference=${preference}`)
    if (globalThis.document.body.attributes['data-acid-theme'] !== 'on') {
      problems.push('the acid theme did not arm body[data-acid-theme="on"]')
    }
    if (globalThis.document.body.attributes['data-acid-theme-id'] !== 'acid-mono') {
      problems.push('the palette id was not published to the body')
    }
    if (globalThis.window.localStorage.getItem('dsh.acid-core.theme') !== 'acid-mono') {
      problems.push('the palette choice was not remembered for the next load')
    }
    const orangeTile = tiles.find((tile) => tile.title === 'acid-orange')
    if (orangeTile === undefined) problems.push('acid-orange tile missing')
    else {
      orangeTile.onClick()
      if (preference !== 'acid-orange') problems.push(`orange tile did not switch: preference=${preference}`)
      if (globalThis.document.body.attributes['data-acid-theme-id'] !== 'acid-orange') {
        problems.push('switching palettes did not update data-acid-theme-id')
      }
      if (globalThis.window.localStorage.getItem('dsh.acid-core.theme') !== 'acid-orange') {
        problems.push('switching palettes did not remember the new id')
      }
    }
    const darkTile = tiles.find((tile) => tile.title === 'dark')
    darkTile?.onClick()
    if (globalThis.document.body.attributes['data-acid-theme'] !== undefined) {
      problems.push('switching back to dark did not disarm the affordance layer')
    }
    if (globalThis.document.body.attributes['data-acid-theme-id'] !== undefined) {
      problems.push('switching back to dark did not clear the palette id')
    }
    if (globalThis.window.localStorage.getItem('dsh.acid-core.theme') !== null) {
      problems.push('switching back to dark did not forget the palette choice')
    }
    // And the remembered id must bring it back on the next load. Model a real
    // reload: a fresh theme service (the host resets the preference and drops
    // every listener when the registration is disposed), same local storage.
    const reload = (stored) => {
      themeRegistrations.length = 0
      themeListeners.length = 0
      preference = 'system'
      globalThis.document.body.attributes = {}
      globalThis.window.localStorage.setItem('dsh.acid-core.theme', stored)
      plugins.apply(ctx)
    }
    reload('on') // legacy boolean flag migrates to the default palette
    if (preference !== 'acid-mono') problems.push(`legacy flag was not migrated: preference=${preference}`)
    reload('acid-orange')
    if (preference !== 'acid-orange') problems.push(`remembered palette was not re-applied: preference=${preference}`)
    globalThis.window.localStorage.removeItem('dsh.acid-core.theme')
  }

  // Slider → store: the visible handler must clamp and write.
  if (sliders.length === 3) {
    sliders[0].onChange({ currentTarget: { value: '1.2' } })
    if (test.getParams().distortion !== 1.2) problems.push(`slider onChange did not reach the store: ${test.getParams().distortion}`)
    sliders[0].onChange({ currentTarget: { value: '9' } })
    if (test.getParams().distortion !== 1.5) problems.push(`slider onChange bypassed the clamp: ${test.getParams().distortion}`)
    test.resetParams()
  }
}

// ── chip ────────────────────────────────────────────────────────────────────
const chipComponent = registrations.find((entry) => entry.options?.name === 'conversation.header.leading')?.component
if (chipComponent !== undefined) {
  const chip = render(chipComponent({}))
  let live = undefined
  walk(chip, (node) => {
    if (node.props?.className === 'dsh-acid-chip') live = node.props['data-live']
  })
  if (live === undefined) problems.push('chip did not render its data-live state')
}

// ── status strip ────────────────────────────────────────────────────────────
const statusComponent = registrations.find((entry) => entry.options?.name === 'shell.bottom')?.component
if (statusComponent === undefined) {
  problems.push('status strip component not registered in shell.bottom')
} else {
  const strip = render(statusComponent({}))
  let stripNode = null
  walk(strip, (node) => {
    if (node.props?.className === 'dsh-acid-status') stripNode = node
  })
  if (stripNode === null) problems.push('status strip did not render')
  else {
    const text = JSON.stringify(strip).match(/FPS/g) ?? []
    if (text.length === 0) problems.push('status strip has no FPS reading')
  }
  test.toggleFlag('statusbar')
  if (render(statusComponent({})) !== null) problems.push('disabled status strip must render null')
  test.toggleFlag('statusbar')
  if (test.getParams().statusbar !== true) problems.push('status strip switch did not round-trip')
}

// ── report ──────────────────────────────────────────────────────────────────
if (warnings.length > 0) problems.push(`unexpected runtime warnings: ${warnings.join(' | ')}`)
if (problems.length === 0) {
  const tokens = registered?.tokens ?? {}
  console.log('OK — manifest, zero-blocking contract, settings wiring, theme completeness, geometry, params and marks all pass')
  console.log(`geometry: ${crystal.vertexCount} verts / ${crystal.faceCount} faces / ${crystal.segments} segments (Uint16-safe)`)
  console.log(`theme: ${Object.keys(tokens).length} alias tokens, accent on 3`)
  process.exit(0)
}
console.log(`FAIL (${problems.length})`)
for (const problem of problems) console.log(` - ${problem}`)
process.exit(1)
