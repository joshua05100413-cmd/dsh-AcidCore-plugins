/** Optional real-browser regression: npm run test:browser (requires Playwright).
 * Arguments may supply a Playwright module and a Chrome executable, allowing
 * an existing development runtime without adding any production dependency.
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'

const { chromium } = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : 'playwright')
const source = await readFile(new URL('./client.js', import.meta.url), 'utf8')
let bundle
vm.runInNewContext(source, { window: { __ModuleLoader__: { load: (entry) => { bundle = entry } } } })
const css = bundle.factory(() => ({ createElement() {} })).__test.CSS
const shellRule = /body\[data-acid-media="on"\] #root :has\(> \[data-shell-overlay\]\)\{[^}]*\}/
assert.ok(shellRule.test(css), 'the shell transparency rule is present')
const withoutFix = css.replace(shellRule, '')
const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) })
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
  const fixture = (pluginCss) => `<!doctype html><html data-windows-titlebar lang="en"><style>
    html,body,#root{margin:0;width:100%;height:100%}
    body{--dsw-alias-bg-base:#fff;--dsw-specific-sidebar-fill:#f8f9fb;--dsw-alias-bg-layer-2:#fff}
    .host-frame{position:relative;display:flex;height:100%;background:var(--dsw-alias-bg-base)}
    /* This is the Windows AppFrame behavior that the original mock omitted. */
    [data-windows-titlebar] .host-frame{background:var(--dsw-specific-sidebar-fill)}
    .sidebar{width:200px;background:var(--dsw-specific-sidebar-fill)}
    .content{flex:1;background:var(--dsw-alias-bg-base)}
    .surface{padding:24px;background:var(--dsw-alias-bg-layer-2)}
    .unrelated-frame{background:var(--dsw-specific-sidebar-fill)}
    ${pluginCss}
    </style><body><div id="dsh-acid-media" hidden style="--acid-media-ground:#087f8c"></div>
    <div id="root"><div class="host-frame"><aside class="sidebar">Sidebar</aside><main class="content">
    <section class="surface">Readable card</section><div class="unrelated-frame">Other frame</div></main>
    <div data-shell-overlay></div></div></div></body></html>`
  const color = (selector) => page.locator(selector).evaluate((el) => getComputedStyle(el).backgroundColor)
  const reveal = () => page.evaluate(() => {
    document.body.setAttribute('data-acid-media', 'on')
    document.getElementById('dsh-acid-media').hidden = false
  })
  async function verify(pluginCss) {
    await page.setContent(fixture(pluginCss))
    assert.equal(await color('.host-frame'), 'rgb(248, 249, 251)', 'normal Windows surface stays opaque')
    await reveal()
    assert.equal(await color('.host-frame'), 'rgba(0, 0, 0, 0)', 'loaded wallpaper must be visible through the Windows shell')
    assert.equal(await color('.content'), 'rgba(0, 0, 0, 0)')
    assert.equal(await color('.sidebar'), 'rgb(248, 249, 251)', 'sidebar keeps its own surface')
    assert.equal(await color('.surface'), 'rgb(255, 255, 255)', 'reading surfaces keep their fill')
    assert.equal(await color('.unrelated-frame'), 'rgb(248, 249, 251)', 'other frames are not made transparent')
    await page.evaluate(() => {
      document.body.style.setProperty('--dsw-specific-sidebar-fill', '#151a24')
      document.body.style.setProperty('--dsw-alias-bg-base', '#08090c')
    })
    assert.equal(await color('.host-frame'), 'rgba(0, 0, 0, 0)', 'theme changes do not conceal the wallpaper')
    await page.evaluate(() => {
      document.body.removeAttribute('data-acid-media')
      document.getElementById('dsh-acid-media').hidden = true
    })
    assert.equal(await color('.host-frame'), 'rgb(21, 26, 36)', 'disabling restores the latest Windows theme fill')
    assert.equal(await color('.content'), 'rgb(8, 9, 12)')
    await page.setViewportSize({ width: 390, height: 844 })
    await reveal()
    assert.equal(await color('.host-frame'), 'rgba(0, 0, 0, 0)', 'same rule works in narrow windows')
    await page.setViewportSize({ width: 1200, height: 800 })
  }
  await verify(css)
  await assert.rejects(() => verify(withoutFix), /loaded wallpaper must be visible/, 'removing the fix reproduces the original bug')
  console.log('OK — Windows shell reveals wallpaper, preserves reading surfaces and restores the latest theme; removing the fix fails the same test')
} finally { await browser.close() }
