import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// Built-in themes really have empty token maps: their palettes live in CSS.
// A stock preference write may replace the injected theme service while the
// Acid Core plugin remains mounted. Exercise that boundary, not just clicks.
const source = readFileSync(process.argv[2] ?? new URL('./client.js', import.meta.url), 'utf8')
const storage = new Map()
const attributes = new Map()
const listeners = new Set()
const rootCleanups = []
let bindTheme, bundle
const context = {
  console, AbortController,
  navigator: { language: 'en' },
  document: {
    documentElement: { lang: 'en' },
    body: { setAttribute: (key, value) => attributes.set(key, value), removeAttribute: (key) => attributes.delete(key) },
    createElement: () => ({ setAttribute() {}, remove() {} }),
    head: { appendChild() {} },
  },
  window: {
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    __ModuleLoader__: { load: (entry) => { bundle = entry } },
  },
}
vm.runInNewContext(source, context, { filename: 'client.js' })
const plugin = bundle.factory(() => ({ createElement() {} }))
const listen = (event, fn) => {
  assert.equal(event, 'theme/change')
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const effect = (cleanups) => (fn) => {
  const cleanup = fn()
  if (typeof cleanup === 'function') cleanups.push(cleanup)
}
const root = {
  effect: effect(rootCleanups), on: listen,
  inject(names, callback) { if (names.includes('theme')) bindTheme = callback },
}
plugin.apply(root)

function mount() {
  const cleanups = []
  const themes = [
    { id: 'light', colorScheme: 'light', tokens: {} },
    { id: 'dark', colorScheme: 'dark', tokens: {} },
  ]
  let preference = 'dark'
  const calls = []
  const snapshot = () => ({ preference, themes: [...themes], active: themes.find((theme) => theme.id === preference) })
  const publish = () => { for (const fn of [...listeners]) fn(snapshot()) }
  const service = {
    getTheme: snapshot,
    setTheme(id) {
      assert.ok(themes.some((theme) => theme.id === id), `unknown theme ${id}`)
      calls.push(id)
      preference = id
      publish()
    },
    register(theme) {
      assert.ok(!themes.some((entry) => entry.id === theme.id), `duplicate theme ${theme.id}`)
      themes.push(theme)
      publish()
      return () => {
        themes.splice(themes.indexOf(theme), 1)
        if (preference === theme.id) preference = 'dark'
        publish()
      }
    },
  }
  bindTheme({ theme: service, effect: effect(cleanups), on: listen })
  return { calls, themes, snapshot, publish, dispose: () => { for (const fn of cleanups.reverse()) fn() } }
}

const first = mount()
plugin.__test.selectTheme('light')
assert.equal(plugin.__test.getThemeSnapshot().active.id, 'light')
plugin.__test.selectTheme('acid-cyan')
assert.equal(attributes.get('data-acid-theme-id'), 'acid-cyan')
first.dispose()
assert.equal(first.themes.length, 2, 'replacing the service must unregister its custom themes')
assert.equal(listeners.size, 0, 'replacing the service must detach old theme listeners')
assert.equal(attributes.has('data-acid-theme'), false)
const oldCallCount = first.calls.length
plugin.__test.selectTheme('acid-rose')
assert.equal(first.calls.length, oldCallCount, 'the switch must not call a retired theme service')

const second = mount()
assert.equal(second.snapshot().active.id, 'acid-rose', 'a replacement service must restore the remembered palette')
for (const id of ['light', 'acid-orange', 'light', 'dark', 'acid-cyan', 'light', 'acid-mono']) {
  plugin.__test.selectTheme(id)
  assert.equal(second.snapshot().active.id, id)
  assert.equal(plugin.__test.getThemeSnapshot().active.id, id)
  assert.equal(attributes.get('data-acid-theme-id'), id.startsWith('acid-') ? id : undefined)
}
first.publish()
assert.equal(plugin.__test.getThemeSnapshot().active.id, 'acid-mono', 'a retired service must not repaint the current palette')
assert.equal(attributes.get('data-acid-theme-id'), 'acid-mono')
second.dispose()
assert.equal(listeners.size, 0)
const outgoing = mount()
plugin.__test.selectTheme('acid-cyan')
const incoming = mount()
outgoing.dispose()
assert.equal(attributes.get('data-acid-theme-id'), 'acid-cyan', 'late cleanup must not strip the replacement theme attributes')
plugin.__test.selectTheme('acid-orange')
assert.equal(incoming.snapshot().active.id, 'acid-orange')
incoming.dispose()
assert.equal(listeners.size, 0)
for (const cleanup of rootCleanups.reverse()) cleanup()
console.log('OK — light/custom switching, service replacement, old listener cleanup and palette restoration')
