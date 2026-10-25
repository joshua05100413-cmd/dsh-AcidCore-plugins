/** Lifecycle, media and real HTTP regression checks; no DSH or desktop changes. */
import assert from 'node:assert/strict'
import { readFile, mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import vm from 'node:vm'
import { createWallpaperHandlers } from './index.js'

const source = await readFile(new URL('./client.js', import.meta.url), 'utf8')

function load({ reduced = false, stored = {}, code = source, play = () => Promise.resolve(), fetcher = async () => { throw new Error('offline') } } = {}) {
  const created = [], frames = new Map(), domEvents = new Map(), windowEvents = new Map(), canvasEvents = new Map()
  const storage = new Map([['dsh.acid-core.params', JSON.stringify(stored)]])
  let nextFrame = 0, draws = 0, loads = 0, buffers = 0, lost = false
  const colors = []
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.attributes = new Map(); this.style = {
      setProperty(key, value) { this[key] = value }, getPropertyValue(key) { return this[key] || '' },
    }; this.textContent = ''; this.hidden = false; created.push(this) }
    get firstChild() { return this.children[0] || null }
    appendChild(node) { node.remove(); node.parent = this; this.children.push(node); return node }
    insertBefore(node, before) { if (!before) return this.appendChild(node); node.remove(); node.parent = this; this.children.splice(this.children.indexOf(before), 0, node); return node }
    remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null }
    setAttribute(key, value) { this.attributes.set(key, value) }
    getAttribute(key) { return this.attributes.get(key) ?? null }
    removeAttribute(key) { this.attributes.delete(key); if (key === 'src') this._src = '' }
    getBoundingClientRect() { return { width: Array.from(this.textContent).length * 60 * (parseFloat(this.style.fontSize || '100') / 100) } }
    set src(value) { this._src = value; loads += 1 }
    get src() { return this._src }
    paused = true
    plays = 0
    load() {}
    pause() { this.paused = true }
    play() { this.plays += 1; this.paused = false; return play() }
  }
  const add = (map) => (name, fn) => { if (!map.has(name)) map.set(name, new Set()); map.get(name).add(fn) }
  const remove = (map) => (name, fn) => map.get(name)?.delete(fn)
  const document = { hidden: false, documentElement: { lang: 'en' }, body: new Element('body'), head: new Element('head'),
    createElement: (tag) => new Element(tag), querySelector: () => null,
    addEventListener: add(domEvents), removeEventListener: remove(domEvents) }
  document.body.style.setProperty('--dsw-alias-bg-base', '#08090C')
  const React = { Fragment: 'fragment', createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useMemo: (fn) => fn(), useRef: () => ({ current: null }), useEffect() {}, useCallback: (fn) => fn,
    useSyncExternalStore: (_subscribe, snapshot) => snapshot() }
  let bundle
  const window = { innerWidth: 1000, innerHeight: 800, devicePixelRatio: 1,
    matchMedia: (query) => ({ matches: query.includes('reduced-motion') ? reduced : false }),
    addEventListener: add(windowEvents), removeEventListener: remove(windowEvents),
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    __ModuleLoader__: { load: (entry) => { bundle = entry } } }
  const context = { window, document, navigator: { language: 'en' }, getComputedStyle: (el) => el.style,
    AbortController, fetch: fetcher, console,
    requestAnimationFrame: (fn) => { frames.set(++nextFrame, fn); return nextFrame }, cancelAnimationFrame: (id) => frames.delete(id) }
  vm.runInNewContext(code, context, { filename: 'client.js' })
  const plugin = bundle.factory((name) => { assert.equal(name, 'react'); return React })
  const gl = new Proxy({}, { get(_target, key) {
    if (String(key).toUpperCase() === key) return 1
    if (key === 'getShaderParameter' || key === 'getProgramParameter') return () => true
    if (key === 'getExtension') return (name) => name === 'WEBGL_lose_context' ? { loseContext() { lost = true } } : null
    if (key === 'isContextLost') return () => lost
    if (key === 'createBuffer') return () => { buffers += 1; return {} }
    if (key === 'getUniformLocation') return (_program, name) => name
    if (key === 'uniform3f') return (name, ...rgb) => { if (name === 'uColorA') colors.push(rgb) }
    if (key === 'drawElements') return () => { draws += 1 }
    return () => ({})
  } })
  const canvas = { clientWidth: 1000, clientHeight: 800, getContext: () => gl,
    addEventListener: add(canvasEvents), removeEventListener: remove(canvasEvents) }
  const emit = (map, name, event) => { for (const fn of map.get(name) ?? []) fn(event) }
  return { test: plugin.__test, document, window, storage, created, frames, canvas,
    get draws() { return draws }, get loads() { return loads },
    get buffers() { return buffers }, get lost() { return lost }, colors,
    contextLoss() { lost = true; emit(canvasEvents, 'webglcontextlost', { preventDefault() {} }) },
    visibility(hidden) { document.hidden = hidden; emit(domEvents, 'visibilitychange') },
    resize() { emit(windowEvents, 'resize') },
    listeners() { return [...domEvents.values(), ...windowEvents.values(), ...canvasEvents.values()].reduce((n, set) => n + set.size, 0) } }
}

function visibilityRegression(env) {
  const handle = env.test.createBackdrop(env.canvas, env.test.buildCrystal(1, 1))
  assert.equal(env.frames.size, 1, 'starts one animation loop')
  env.visibility(true)
  assert.equal(env.frames.size, 0, 'pauses in background')
  env.visibility(false)
  assert.equal(env.frames.size, 1, 'resumes when visible')
  env.visibility(false)
  assert.equal(env.frames.size, 1, 'visibility echoes do not duplicate the loop')
  handle.dispose()
  env.visibility(false)
  assert.equal(env.frames.size, 0, 'disposed renderer cannot restart')
  assert.equal(env.listeners(), 0, 'renderer releases listeners')
}
visibilityRegression(load())
const broken = source.replace('if (document.hidden) {\n          cancelAnimationFrame(raf)', 'if (document.hidden) {\n          active = false\n          cancelAnimationFrame(raf)')
assert.notEqual(broken, source, 'regression mutation still matches the real handler')
assert.throws(() => visibilityRegression(load({ code: broken })), /resumes when visible/, 'the same test detects the original bug')
const reduced = load({ reduced: true })
const still = reduced.test.createBackdrop(reduced.canvas, reduced.test.buildCrystal(1, 1))
assert.equal(reduced.draws, 1)
reduced.visibility(true); reduced.visibility(false)
assert.equal(reduced.frames.size, 0, 'reduced motion stays still after returning')
reduced.resize()
assert.equal(reduced.draws, 2, 'static scene repaints after resize')
still.dispose()
const hidden = load()
hidden.document.hidden = true
const hiddenHandle = hidden.test.createBackdrop(hidden.canvas, hidden.test.buildCrystal(1, 1))
assert.equal(hidden.frames.size, 0, 'initially hidden renderer waits')
hidden.visibility(false)
assert.equal(hidden.frames.size, 1)
hiddenHandle.dispose()

function canvasReuseRegression(env) {
  const geometry = env.test.buildCrystal(1, 1)
  const renderer = env.test.createBackdrop(env.canvas, geometry, '#CCFF00')
  const buffers = env.buffers
  for (const accent of ['#FF8A00', '#00E5FF', '#B47CFF', '#CCFF00']) renderer.setAccent(accent)
  assert.equal(env.buffers, buffers, 'theme colors update uniforms without rebuilding buffers')
  assert.deepEqual(env.colors.at(-1), [204 / 255, 1, 0])
  renderer.dispose()
  assert.equal(env.lost, false, 'cleanup must not poison a canvas that React can reuse')
  const replacement = env.test.createBackdrop(env.canvas, geometry, '#00E5FF')
  assert.ok(replacement, 'the same canvas can be initialized again after cleanup')
  replacement.dispose()
}
canvasReuseRegression(load({ reduced: true }))
const poisoned = source.replace('gl.deleteProgram(program)', "gl.deleteProgram(program); gl.getExtension('WEBGL_lose_context')?.loseContext()")
assert.notEqual(poisoned, source)
assert.throws(() => canvasReuseRegression(load({ reduced: true, code: poisoned })), /cleanup must not poison/, 'the test reproduces the original theme-change context loss')
const gpuLoss = load()
const gpuRenderer = gpuLoss.test.createBackdrop(gpuLoss.canvas, gpuLoss.test.buildCrystal(1, 1))
gpuLoss.contextLoss()
assert.equal(gpuLoss.canvas.hidden, true, 'a lost full-screen canvas must not cover the app')
assert.equal(gpuLoss.frames.size, 0, 'GPU context loss stops the animation')
gpuLoss.visibility(true); gpuLoss.visibility(false)
assert.equal(gpuLoss.frames.size, 0, 'visibility changes must not restart a lost context')
gpuRenderer.dispose()
assert.equal(gpuLoss.listeners(), 0)

const env = load({ stored: { backdrop: true, statusbar: false, speed: 2 } })
const t = env.test
assert.equal(t.getParams().background, 'crystal', 'old settings migrate to crystal')
assert.equal(t.getParams().statusbar, false, 'existing status strip preference survives')
t.setParam('speed', NaN)
assert.equal(t.getParams().speed, 2)
t.setParam('background', 'bogus')
assert.equal(t.getParams().background, 'crystal')
t.setParam('image', '../secret.png')
assert.equal(t.getParams().image, '')
t.setParam('banner', '鲸'.repeat(100))
assert.equal(Array.from(t.getParams().banner).length, 80)
t.setParam('banner', '人类与 AI')
const disposeMedia = t.createMediaLayer()
const root = env.document.body.children[0]
assert.equal(root.hidden, true, 'no media starts without user choice')
t.setParam('bannerEnabled', true)
assert.equal(root.hidden, false)
assert.equal(env.document.body.getAttribute('data-acid-media'), 'on')
const banner = root.children.find((node) => node.className === 'dsh-acid-banner')
assert.equal(banner.textContent, '人类与 AI')
assert.ok(parseFloat(banner.style.fontSize) > 0)
t.chooseImage('夜景 #1.png')
const image = env.created.filter((node) => node.tagName === 'img').at(-1)
assert.ok(image.src.includes('%E5%A4%9C%E6%99%AF%20%231.png'), 'filenames are URL encoded')
assert.equal(t.getScene().imageState, 'loading')
image.onload()
assert.equal(t.getScene().imageState, 'ready')
const loadsBeforeTheme = env.loads
env.document.body.style.setProperty('--dsw-alias-bg-base', '#FFFCF7')
t.publishTheme({ active: { colorScheme: 'light', tokens: { '--dsw-alias-bg-base': '#FFFCF7', '--dsw-alias-state-business-primary': '#C2410C' } } })
assert.equal(env.loads, loadsBeforeTheme, 'theme changes never remount/reload media')
assert.equal(root.style['--acid-media-veil'], '0.9')
assert.equal(root.style['--acid-media-ground'], '#FFFCF7')
assert.equal(root.style['--acid-banner-color'], '#C2410C')
t.setParam('veilLight', 0.76)
assert.equal(root.style['--acid-media-veil'], '0.76')
assert.equal(env.loads, loadsBeforeTheme, 'sliders never reload the image')
t.setParam('imageFit', 'contain')
assert.equal(image.style.objectFit, 'contain')
t.setParam('bannerEnabled', false)
t.chooseImage('missing.png')
const failedImage = env.created.filter((node) => node.tagName === 'img').at(-1)
failedImage.onerror()
assert.equal(root.hidden, true, 'image failure restores an opaque shell')
assert.equal(env.document.body.getAttribute('data-acid-media'), null)
assert.equal(t.getScene().imageState, 'error')
t.chooseImage('missing.png')
const retryImage = env.created.filter((node) => node.tagName === 'img').at(-1)
assert.notEqual(retryImage, failedImage, 'reselecting the same image retries loading')
const staleLoad = retryImage.onload
retryImage.onload()
assert.equal(root.hidden, false)
t.setParam('background', 'none')
assert.equal(root.hidden, true)
t.setParam('bannerEnabled', true)
assert.equal(root.hidden, false, 'lettering works with no image/crystal')
t.setParam('backdrop', false)
assert.equal(root.hidden, true, 'global switch hides all decoration')
t.resetParams()
assert.equal(t.getParams().banner, '人类与 AI', 'crystal reset preserves media choices')
disposeMedia(); disposeMedia(); staleLoad()
assert.equal(env.document.body.children.length, 0)
assert.equal(env.document.body.getAttribute('data-acid-media'), null)
assert.equal(env.document.body.style.getPropertyValue('--dsw-alias-bg-base'), '#FFFCF7', 'latest theme inline value was never overwritten')
assert.equal(env.listeners(), 0)
const loadCount = env.loads
t.publishTheme({ active: { colorScheme: 'dark' } })
assert.equal(env.loads, loadCount, 'disposed layer cannot be revived by theme changes')
assert.ok(t.CSS.includes('body[data-acid-media="on"]{--dsw-alias-bg-base:transparent !important'))
assert.equal(JSON.parse(env.storage.get('dsh.acid-core.params')).banner, '人类与 AI')

// Real background lifecycle; intro settings must not change the loop source.
const videoEnv = load({ stored: { background: 'video', backgroundVideo: '循环 #1.webm' } })
const vt = videoEnv.test
const stopVideo = vt.createMediaLayer()
const videoRoot = videoEnv.document.body.children[0]
const video = videoEnv.created.find((node) => node.tagName === 'video')
assert.ok(video.src.includes('%E5%BE%AA%E7%8E%AF%20%231.webm'))
assert.equal(video.muted && video.defaultMuted && video.loop && video.playsInline, true)
assert.equal(videoRoot.hidden, true, 'shell stays opaque while loading')
video.onloadeddata()
assert.equal(videoRoot.hidden, false)
await Promise.resolve()
vt.setParam('videoPaused', true)
assert.equal(video.paused, true)
assert.equal(vt.getScene().videoState, 'paused')
vt.setParam('videoPaused', false)
assert.equal(video.paused, false)
await Promise.resolve()
videoEnv.visibility(true)
assert.equal(video.paused, true)
videoEnv.visibility(false)
assert.equal(video.paused, false)
const videoLoads = videoEnv.loads
vt.setParam('introVideo', 'other.mp4')
vt.setParam('veilDark', 0.7)
vt.publishTheme({ active: { colorScheme: 'light' } })
assert.equal(videoEnv.loads, videoLoads, 'theme, intro selection and veil never reload the background video')
video.onerror()
assert.equal(videoRoot.hidden, true)
assert.equal(vt.getScene().videoState, 'error')
assert.equal(videoEnv.document.body.getAttribute('data-acid-media'), null)
vt.chooseBackgroundVideo('循环 #1.webm')
const retryVideo = videoEnv.created.filter((node) => node.tagName === 'video').at(-1)
assert.notEqual(video, retryVideo, 'reselecting retries a failed video')
const staleVideo = retryVideo.onloadeddata
vt.setParam('background', 'none')
assert.equal(retryVideo.src, '')
assert.equal(retryVideo.paused, true)
staleVideo()
assert.equal(videoRoot.hidden, true, 'late loads cannot revive removed videos')
stopVideo(); stopVideo()
assert.equal(videoEnv.listeners(), 0)

const stillVideo = load({ reduced: true, stored: { background: 'video', backgroundVideo: 'still.webm' } })
const stopStillVideo = stillVideo.test.createMediaLayer()
const stillFrame = stillVideo.created.find((node) => node.tagName === 'video')
stillFrame.onloadeddata()
stillVideo.visibility(true); stillVideo.visibility(false)
assert.equal(stillFrame.plays, 0, 'reduced motion loads a frame without starting playback')
assert.equal(stillVideo.test.getScene().videoState, 'paused')
stopStillVideo()

const blockedVideo = load({ play: () => Promise.reject(new Error('NotAllowedError')), stored: { background: 'video', backgroundVideo: 'blocked.webm' } })
const stopBlocked = blockedVideo.test.createMediaLayer()
for (let i = 0; i < 8; i += 1) await Promise.resolve()
assert.equal(blockedVideo.test.getScene().videoState, 'error')
assert.equal(blockedVideo.document.body.children[0].hidden, true)
stopBlocked()

let rejectPending
const interrupted = load({ play: () => new Promise((_resolve, reject) => { rejectPending = reject }), stored: { background: 'video', backgroundVideo: 'slow.webm' } })
const stopInterrupted = interrupted.test.createMediaLayer()
interrupted.test.setParam('videoPaused', true)
rejectPending(new Error('AbortError'))
for (let i = 0; i < 8; i += 1) await Promise.resolve()
assert.notEqual(interrupted.test.getScene().videoState, 'error', 'intentional pause cancels a pending play without a false error')
stopInterrupted()

const pending = []
const network = load({ fetcher: (_url, options) => new Promise((resolve, reject) => pending.push({ resolve, reject, options })) })
const first = network.test.refreshLibrary(), second = network.test.refreshLibrary()
assert.equal(pending[0].options.signal.aborted, true)
pending[1].resolve({ ok: true, json: async () => ({ directory: 'fixture', images: [{ name: 'new.png', modified: 2, size: 20 }] }) })
await second
pending[0].reject(new Error('old request failed'))
await first
assert.equal(network.test.getLibrary().images[0].name, 'new.png')
assert.equal(network.test.getLibrary().error, false, 'late errors cannot overwrite a newer library')

function elements(node, out = []) {
  if (Array.isArray(node)) { node.forEach((child) => elements(child, out)); return out }
  if (!node || typeof node !== 'object') return out
  if (typeof node.type === 'function') return elements(node.type(node.props), out)
  out.push(node); elements(node.children, out); return out
}
const settingsNodes = elements(network.test.MediaSettings({ t: (key) => key }))
const imageMode = settingsNodes.find((node) => node.props.className === 'dsh-acid-mode' && node.children[0] === 'background.image')
imageMode.props.onClick()
const imageNodes = elements(network.test.MediaSettings({ t: (key) => key }))
imageNodes.find((node) => node.props.className === 'dsh-acid-image-tile').props.onClick()
assert.equal(network.test.getParams().image, 'new.png', 'thumbnail handler reaches the real store')
const veilSlider = imageNodes.find((node) => node.props.id === 'dsh-acid-veilDark')
veilSlider.props.onChange({ currentTarget: { value: '0.7' } })
const rerendered = elements(network.test.MediaSettings({ t: (key) => key }))
assert.equal(rerendered.find((node) => node.props.id === 'dsh-acid-veilDark').props.value, 0.7, 'controlled sliders display the updated value')

// Exercise the real HTTP handlers with an isolated image library.
const temporary = await mkdtemp(join(tmpdir(), 'dsh-acid-background-'))
let server
try {
  const directory = join(temporary, 'images')
  let opened = ''
  const handlers = createWallpaperHandlers({ directory, openFolder: async (path) => { opened = path } })
  server = createServer((req, res) => {
    const handler = handlers[new URL(req.url, 'http://localhost').pathname]
    if (handler) handler(req, res).catch((error) => { res.writeHead(500); res.end(error.message) })
    else { res.writeHead(404); res.end() }
  })
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  const base = `http://127.0.0.1:${server.address().port}`
  assert.equal((await (await fetch(base + '/acid-core/wallpapers')).json()).images.length, 0, 'missing directory is an empty library')
  assert.equal((await fetch(base + '/acid-core/open-wallpapers')).status, 405)
  assert.equal((await fetch(base + '/acid-core/open-wallpapers', { method: 'POST', headers: { Origin: 'https://example.invalid' } })).status, 403)
  assert.equal(opened, '')
  assert.equal((await fetch(base + '/acid-core/open-wallpapers', { method: 'POST', headers: { Origin: base } })).status, 200)
  assert.equal(opened, directory)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aBZkAAAAASUVORK5CYII=', 'base64')
  await writeFile(join(directory, '夜景 #1.png'), png)
  await writeFile(join(directory, 'ignore.txt'), 'text')
  await writeFile(join(directory, 'empty.png'), '')
  await mkdir(join(directory, 'directory.png'))
  await writeFile(join(temporary, 'outside.png'), png)
  try { await symlink(join(temporary, 'outside.png'), join(directory, 'escape.png')) } catch (error) { if (error.code !== 'EPERM') throw error }
  const listing = await (await fetch(base + '/acid-core/wallpapers')).json()
  assert.deepEqual(listing.images.map((entry) => entry.name), ['夜景 #1.png'])
  const response = await fetch(base + listing.images[0].url)
  assert.equal(response.headers.get('content-type'), 'image/png')
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png)
  for (const bad of ['../outside.png', '..\\outside.png', 'ignore.txt', 'C:\\outside.png']) {
    assert.equal((await fetch(base + '/acid-core/wallpaper?name=' + encodeURIComponent(bad))).status, 400)
  }
  for (const missing of ['gone.png', 'empty.png', 'directory.png', 'escape.png']) {
    assert.equal((await fetch(base + '/acid-core/wallpaper?name=' + encodeURIComponent(missing))).status, 404)
  }
  assert.equal((await fetch(base + '/acid-core/wallpapers', { method: 'POST' })).status, 405)
} finally {
  if (server) await new Promise((done) => server.close(done))
  // Check the exact absolute target before recursive cleanup, including Windows.
  assert.equal(dirname(resolve(temporary)), resolve(tmpdir()))
  assert.ok(basename(temporary).startsWith('dsh-acid-background-'))
  await rm(temporary, { recursive: true, force: true })
}
console.log('OK — visibility (with red/green proof), reduced motion, media lifecycle, theme restoration, controls, request races and HTTP image library')
