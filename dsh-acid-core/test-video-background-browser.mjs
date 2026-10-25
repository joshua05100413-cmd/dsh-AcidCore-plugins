/** Optional real Chromium decoding check. Pass Playwright, Chrome and a short
 * WebM fixture as arguments. Uses an isolated library and production routes. */
import assert from 'node:assert/strict'
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, basename } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createVideoHandlers } from './index.js'

const { chromium } = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : 'playwright')
const source = await readFile(new URL('./client.js', import.meta.url), 'utf8')
assert.ok(process.argv[4], 'Supply a short WebM fixture as argument 4 (after Playwright and Chrome)')
const fixture = await readFile(process.argv[4])
const directory = await mkdtemp(join(tmpdir(), 'dsh-acid-video-browser-'))
let browser, server
try {
  browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) })
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
  await writeFile(join(directory, '循环 #1.webm'), fixture)
  const handlers = createVideoHandlers({ directory })
  server = createServer((req, res) => {
    const handler = handlers[new URL(req.url, 'http://localhost').pathname]
    if (handler) handler(req, res).catch(() => { if (!res.headersSent) res.writeHead(500); res.end() })
    else { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<html><body></body></html>') }
  })
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  const url = `http://127.0.0.1:${server.address().port}`
  await page.goto(url)
  await page.evaluate(() => {
    const create = document.createElement.bind(document)
    document.createElement = (...args) => {
      const node = create(...args)
      if (args[0] === 'video') {
        window.lastBackgroundVideo = node
        const play = node.play.bind(node)
        node.play = () => play().catch((error) => { window.lastPlayError = error.message; throw error })
      }
      return node
    }
    localStorage.setItem('dsh.acid-core.params', JSON.stringify({ background: 'video', backgroundVideo: '循环 #1.webm' }))
    window.__ModuleLoader__ = { load(entry) { window.acidTest = entry.factory(() => ({
      Fragment: 'fragment', createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
      useSyncExternalStore: (_subscribe, snapshot) => snapshot(), useEffect() {},
    })).__test } }
  })
  await page.addScriptTag({ content: source })
  await page.evaluate(() => {
    const style = document.createElement('style'); style.textContent = window.acidTest.CSS; document.head.appendChild(style)
    window.disposeMedia = window.acidTest.createMediaLayer()
  })
  try { await page.waitForFunction(() => window.acidTest.getScene().videoState === 'ready', null, { timeout: 10000 }) }
  catch (error) {
    console.log(await page.evaluate(() => ({ scene: window.acidTest.getScene(), playError: window.lastPlayError, element: [window.lastBackgroundVideo].filter(Boolean).map((v) => ({ readyState: v.readyState, paused: v.paused, networkState: v.networkState, error: v.error?.message, src: v.src })) })))
    throw error
  }
  await page.waitForFunction(() => document.querySelector('#dsh-acid-media video')?.currentTime > 0.15)
  assert.deepEqual(await page.locator('#dsh-acid-media video').evaluate((v) => ({ muted: v.muted, loop: v.loop, fit: getComputedStyle(v).objectFit })), { muted: true, loop: true, fit: 'cover' })
  // Confirm more than one full iteration while decoding through the real route.
  await page.evaluate(() => {
    const video = document.querySelector('#dsh-acid-media video')
    let previous = video.currentTime
    const onTime = () => { if (video.currentTime < previous) { window.videoLooped = true; video.removeEventListener('timeupdate', onTime) }; previous = video.currentTime }
    video.addEventListener('timeupdate', onTime)
  })
  await page.waitForFunction(() => window.videoLooped, null, { timeout: 10000 })
  await page.evaluate(() => window.acidTest.setParam('videoPaused', true))
  assert.equal(await page.locator('video').evaluate((v) => v.paused), true)
  await page.evaluate(() => window.acidTest.setParam('videoPaused', false))
  await page.waitForFunction(() => !document.querySelector('video').paused)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForFunction(() => document.querySelector('video').paused)
  assert.equal(await page.evaluate(() => window.acidTest.getScene().videoState), 'paused')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.waitForFunction(() => !document.querySelector('video').paused)
  // Render the actual background settings tree with lightweight hook snapshots.
  await page.evaluate(() => {
    document.documentElement.lang = 'zh'
    for (const [key, value] of Object.entries(window.acidTest.ACID_TOKENS)) document.body.style.setProperty(key, value)
    document.body.style.cssText += ';font-family:system-ui;color:#f1f5f9;margin:16px;--acid-accent:#ccff00;--acid-accent-rgb:204,255,0'
    const panel = document.createElement('div'); panel.className = 'dsh-acid-settings'; panel.id = 'test-settings'
    const append = (parent, item) => {
      if (Array.isArray(item)) { item.forEach((child) => append(parent, child)); return }
      if (item === null || item === undefined || typeof item === 'boolean') return
      if (typeof item !== 'object') { parent.appendChild(document.createTextNode(String(item))); return }
      if (typeof item.type === 'function') { append(parent, item.type(item.props)); return }
      if (item.type === 'fragment') { append(parent, item.children); return }
      const node = document.createElement(item.type)
      for (const [key, value] of Object.entries(item.props)) {
        if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value)
        else if (key === 'className') node.className = value
        else if (key !== 'key' && value !== undefined) { if (key in node) node[key] = value; else node.setAttribute(key, String(value)) }
      }
      append(node, item.children)
      if (item.props.value !== undefined) node.value = item.props.value
      parent.appendChild(node)
    }
    const tree = window.acidTest.MediaSettings({ t: window.acidTest.fallbackT })
    append(panel, tree.children[0]); document.body.appendChild(panel)
  })
  for (const width of [1200, 390]) {
    await page.setViewportSize({ width, height: 800 })
    assert.equal(await page.locator('video').evaluate((v) => Math.round(v.getBoundingClientRect().width)), width)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'settings fit the viewport')
    if (process.argv[5]) await page.screenshot({ path: `${process.argv[5]}-${width}.png`, fullPage: true })
  }
  assert.equal(await page.getByLabel('背景视频', { exact: true }).inputValue(), '循环 #1.webm')
  await page.getByRole('button', { name: '暂停背景', exact: true }).click()
  assert.equal(await page.locator('video').evaluate((v) => v.paused), true, 'settings button reaches the real player')
  await page.evaluate(() => window.acidTest.chooseBackgroundVideo('missing.webm'))
  await page.waitForFunction(() => window.acidTest.getScene().videoState === 'error')
  assert.equal(await page.evaluate(() => document.body.hasAttribute('data-acid-media')), false)
  await page.evaluate(() => { window.acidTest.chooseBackgroundVideo('循环 #1.webm'); window.disposeMedia() })
  assert.equal(await page.locator('#dsh-acid-media').count(), 0)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.evaluate(() => { window.acidTest.setParam('videoPaused', false); window.disposeMedia = window.acidTest.createMediaLayer() })
  await page.waitForFunction(() => window.acidTest.getScene().videoState === 'paused')
  assert.equal(await page.locator('video').evaluate((v) => v.readyState >= 2 && v.paused), true, 'reduced motion can load a decoded still without autoplay')
  await page.evaluate(() => window.disposeMedia())
  console.log('OK — real WebM decoding and looping through HTTP, pause/resume, live reduced motion, viewport fit, missing file and teardown')
} finally {
  if (browser) await browser.close()
  if (server) await new Promise((done) => server.close(done))
  assert.equal(dirname(resolve(directory)), resolve(tmpdir()))
  assert.ok(basename(directory).startsWith('dsh-acid-video-browser-'))
  await rm(directory, { recursive: true, force: true })
}
