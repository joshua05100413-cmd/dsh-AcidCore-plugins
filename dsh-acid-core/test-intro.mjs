import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, dirname, resolve, basename } from 'node:path'
import { createVideoHandlers, parseByteRange } from './index.js'

const source = await readFile(new URL('./client.js', import.meta.url), 'utf8')
function setup({ stored = {}, reduced = false, session = new Map(), rejectPlay = false, fetcher } = {}) {
  let clock = 0, nextId = 0, entry, overlay = null, plays = 0
  const frames = new Map(), created = [], events = new Map()
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.attrs = new Map(); this.events = new Map(); this.style = { setProperty(key, value) { this[key] = value }, getPropertyValue(key) { return this[key] || '' } }; this.classList = { add: (name) => { this.className = name } }; this.currentTime = 0; created.push(this) }
    appendChild(child) { child.remove(); child.parent = this; this.children.push(child); return child }
    remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null }
    setAttribute(key, value) { this.attrs.set(key, value) }
    removeAttribute(key) { this.attrs.delete(key) }
    getAttribute(key) { return this.attrs.get(key) ?? null }
    addEventListener(name, fn) { if (!this.events.has(name)) this.events.set(name, new Set()); this.events.get(name).add(fn) }
    removeEventListener(name, fn) { this.events.get(name)?.delete(fn) }
    dispatch(name, props = {}) { for (const fn of this.events.get(name) ?? []) fn({ target: this, ...props }) }
    load() {}
    pause() { this.paused = true }
    play() { plays += 1; return rejectPlay ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve() }
  }
  const body = new Element('body')
  body.style.setProperty('--dsw-alias-bg-layer-2', '#101218')
  body.style.setProperty('--dsw-alias-state-business-primary', '#CCFF00')
  const document = { body, documentElement: { lang: 'en' }, hidden: false,
    createElement: (tag) => new Element(tag), createElementNS: (_ns, tag) => new Element(tag),
    querySelector: () => overlay,
    addEventListener(name, fn) { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(fn) },
    removeEventListener(name, fn) { events.get(name)?.delete(fn) } }
  const local = new Map([['dsh.acid-core.params', JSON.stringify(stored)]])
  const storage = (map) => ({ getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: (key) => map.delete(key) })
  const window = { innerWidth: 1200, innerHeight: 800, localStorage: storage(local), sessionStorage: storage(session),
    matchMedia: () => ({ matches: reduced }), __ModuleLoader__: { load: (value) => { entry = value } } }
  const context = { window, document, console, AbortController, navigator: { language: 'en' },
    performance: { now: () => clock }, getComputedStyle: (el) => el.style,
    fetch: fetcher || (async () => ({ ok: true, json: async () => ({ directory: 'fixture', videos: [{ name: 'intro.webm', size: 64, modified: 1 }] }) })),
    requestAnimationFrame(fn) { frames.set(++nextId, fn); return nextId }, cancelAnimationFrame(id) { frames.delete(id) } }
  vm.runInNewContext(source, context, { filename: 'client.js' })
  const test = entry.factory(() => ({ createElement() {} })).__test
  return { test, body, document, created, frames, session, get plays() { return plays },
    frame(elapsed = 16) { clock += elapsed; const queued = [...frames]; frames.clear(); for (const [, fn] of queued) fn(clock) },
    setOverlay(value) { overlay = value },
    emit(name, value = {}) { for (const fn of events.get(name) ?? []) fn({ preventDefault() {}, stopPropagation() {}, ...value }) },
    listeners() { return [...events.values()].reduce((n, set) => n + set.size, 0) },
    root: () => body.children.find((node) => node.id === 'dsh-acid-intro') }
}
const settle = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve() }

const native = setup()
const dispose = native.test.createIntroPlayer()
assert.equal(native.body.children.length, 0, 'only mount when the first frame is ready')
native.frame()
assert.ok(native.root(), 'default startup works without any media or HTTP request')
native.frame(900)
const wire = native.created.find((node) => node.tagName === 'path')
assert.ok(wire.getAttribute('d').length > 300, 'real projected crystal edges are drawn')
native.frame(1800)
assert.equal(native.test.getIntro().phase, 'fading')
native.frame(651)
assert.equal(native.root(), undefined)
assert.equal(native.frames.size, 0, 'completed animation releases its frame loop')
assert.equal(native.test.getIntro().phase, 'finished')
assert.equal(native.session.get('dsh.acid-core.intro.shown'), '1')
dispose()
assert.equal(native.listeners(), 0)

const reload = setup({ session: native.session })
const disposeReload = reload.test.createIntroPlayer()
assert.equal(reload.frames.size, 0, 'reload in the same session does not replay')
await reload.test.replayIntro()
reload.frame()
assert.ok(reload.root(), 'manual replay ignores the session flag')
reload.emit('keydown', { key: 'Escape' })
assert.equal(reload.test.getIntro().phase, 'fading')
reload.frame(651)
assert.equal(reload.root(), undefined)
await reload.test.replayIntro(); reload.frame()
reload.test.setParam('introEnabled', false)
assert.equal(reload.root(), undefined, 'disabling immediately removes an active intro')
assert.equal(reload.frames.size, 0)
disposeReload(); disposeReload()

const reduced = setup({ reduced: true })
const disposeReduced = reduced.test.createIntroPlayer()
assert.equal(reduced.frames.size, 0, 'reduced motion disables auto playback')
await reduced.test.replayIntro(); reduced.frame()
const stillPath = reduced.created.find((node) => node.tagName === 'path')
const firstPath = stillPath.getAttribute('d')
reduced.frame(300)
assert.equal(stillPath.getAttribute('d'), firstPath, 'manual reduced-motion preview remains still')
reduced.frame(401)
assert.equal(reduced.root(), undefined)
disposeReduced()

const gated = setup()
const boot = { className: 'startup' }
gated.setOverlay(boot)
const disposeGated = gated.test.createIntroPlayer()
gated.frame(2000)
assert.equal(gated.root(), undefined, 'do not cover an existing boot screen')
boot.className = 'dsu-handoff'
gated.frame()
assert.ok(gated.root(), 'start as the existing boot overlay leaves')
gated.document.hidden = true; gated.emit('visibilitychange')
assert.equal(gated.root(), undefined)
assert.equal(gated.frames.size, 0, 'backgrounding releases the intro')
disposeGated()
const stuck = setup(); stuck.setOverlay({ className: 'startup' })
const disposeStuck = stuck.test.createIntroPlayer(); stuck.frame(10001)
assert.equal(stuck.root(), undefined)
assert.equal(stuck.frames.size, 0, 'a stuck third-party boot screen does not leave a permanent wait loop')
disposeStuck()

const video = setup({ stored: { introMode: 'video' } })
const disposeVideo = video.test.createIntroPlayer()
await settle(); video.frame()
assert.equal(video.plays, 1)
assert.equal(video.root(), undefined, 'do not mount a black layer before video playback starts')
const media = video.created.find((node) => node.tagName === 'video')
assert.equal(media.muted, true)
assert.equal(media.loop, false)
media.dispatch('playing')
assert.ok(video.root())
const stalePlay = [...media.events.get('playing')][0]
media.dispatch('ended'); video.frame(651)
assert.equal(video.root(), undefined)
disposeVideo(); stalePlay()
assert.equal(video.root(), undefined, 'late media events cannot revive a disposed player')
assert.equal(video.listeners(), 0)
const rejected = setup({ stored: { introMode: 'video' }, rejectPlay: true })
const disposeRejected = rejected.test.createIntroPlayer()
await settle(); rejected.frame(); await settle()
assert.equal(rejected.test.getIntro().phase, 'error')
assert.equal(rejected.root(), undefined)
assert.equal(rejected.frames.size, 0)
disposeRejected()
const stalled = setup({ stored: { introMode: 'video' } })
const disposeStalled = stalled.test.createIntroPlayer()
await settle(); stalled.frame(); stalled.frame(12001)
assert.equal(stalled.test.getIntro().phase, 'error', 'load/decode stalls are bounded')
assert.equal(stalled.root(), undefined)
disposeStalled()

assert.deepEqual(parseByteRange('bytes=2-5', 10), { start: 2, end: 5 })
assert.deepEqual(parseByteRange('bytes=-3', 10), { start: 7, end: 9 })
assert.deepEqual(parseByteRange('bytes=4-', 10), { start: 4, end: 9 })
for (const bad of ['bytes=-0', 'bytes=-', 'bytes=10-', 'bytes=8-2', 'bytes=0-1,3-4', 'garbage', 'bytes=99999999999999999999-']) assert.equal(parseByteRange(bad, 10), null)
const temporary = await mkdtemp(join(tmpdir(), 'dsh-acid-intro-'))
let server
try {
  const data = Buffer.from('0123456789abcdefghij')
  await writeFile(join(temporary, '开场 #1.mp4'), data)
  await writeFile(join(temporary, 'ignore.txt'), 'text')
  const handlers = createVideoHandlers({ directory: temporary, openFolder: async () => {} })
  server = createServer((req, res) => {
    const handler = handlers[new URL(req.url, 'http://localhost').pathname]
    if (handler) handler(req, res).catch(() => { res.writeHead(500); res.end() })
    else { res.writeHead(404); res.end() }
  })
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  const base = `http://127.0.0.1:${server.address().port}`
  const listing = await (await fetch(base + '/acid-core/videos')).json()
  assert.deepEqual(listing.videos.map((item) => item.name), ['开场 #1.mp4'])
  const url = base + '/acid-core/video?name=' + encodeURIComponent('开场 #1.mp4')
  const full = await fetch(url)
  assert.equal(full.status, 200)
  assert.deepEqual(Buffer.from(await full.arrayBuffer()), data)
  for (const [range, expected] of [['bytes=2-5', '2345'], ['bytes=-4', 'ghij'], ['bytes=18-999', 'ij'], ['bytes=17-', 'hij']]) {
    const response = await fetch(url, { headers: { Range: range } })
    assert.equal(response.status, 206)
    assert.equal(response.headers.get('accept-ranges'), 'bytes')
    assert.equal(await response.text(), expected)
  }
  const head = await fetch(url, { method: 'HEAD' })
  assert.equal(head.status, 200)
  assert.equal(head.headers.get('content-length'), String(data.length))
  assert.equal(await head.text(), '')
  const invalid = await fetch(url, { headers: { Range: 'bytes=999-' } })
  assert.equal(invalid.status, 416)
  assert.equal(invalid.headers.get('content-range'), 'bytes */20')
  assert.equal((await fetch(base + '/acid-core/video?name=..%2Fsecret.mp4')).status, 400)
  assert.equal((await fetch(base + '/acid-core/open-videos')).status, 405)
  assert.equal((await fetch(base + '/acid-core/open-videos', { method: 'POST', headers: { Origin: 'https://example.invalid' } })).status, 403)
} finally {
  if (server) await new Promise((done) => server.close(done))
  assert.equal(dirname(resolve(temporary)), resolve(tmpdir()))
  assert.ok(basename(temporary).startsWith('dsh-acid-intro-'))
  await rm(temporary, { recursive: true, force: true })
}
console.log('OK — built-in animation, session-once, replay, skip, reduced motion, boot handoff, video errors/stalls, teardown and real HTTP byte ranges')
