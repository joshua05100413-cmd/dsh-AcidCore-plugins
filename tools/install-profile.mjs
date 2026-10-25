/**
 * Install workspace plugins into the live DSH profile the same way the Plugin
 * Manager does: a directory link in the profile's node_modules plus a
 * dependency and a bundle entry in the profile manifest. No pnpm run, so
 * nothing the running app has loaded is rewritten — a `link:` dependency is a
 * directory link, and that is exactly what this creates.
 *
 * Usage:
 *   node install-profile.mjs                 # install everything below
 *   node install-profile.mjs --dry-run       # report only
 *   node install-profile.mjs --revert        # restore the pre-install manifest
 */
import fs from 'node:fs'
import path from 'node:path'

const PROFILE = path.join(process.env.USERPROFILE, '.dsh', 'profiles', 'desktop')
const MANIFEST = path.join(PROFILE, 'package.json')
const BACKUP = path.join(PROFILE, 'package.json.bak-before-composer-meter')

const PLUGINS = [
  { name: 'dsh-composer-meter', dir: 'D:\\Harness plugin\\dsh-composer-meter' },
  { name: 'dsh-acid-core', dir: 'D:\\Harness plugin\\dsh-acid-core' },
]

const dryRun = process.argv.includes('--dry-run')
const revert = process.argv.includes('--revert')
const log = (...args) => console.log(...args)
const fail = (message) => {
  console.error(`FAIL: ${message}`)
  process.exit(1)
}

if (!fs.existsSync(MANIFEST)) fail(`profile manifest missing: ${MANIFEST}`)

if (revert) {
  if (!fs.existsSync(BACKUP)) fail(`no backup to restore: ${BACKUP}`)
  fs.copyFileSync(BACKUP, MANIFEST)
  log(`restored ${MANIFEST} from ${path.basename(BACKUP)}`)
  for (const plugin of PLUGINS) {
    const link = path.join(PROFILE, 'node_modules', plugin.name)
    if (fs.existsSync(link)) {
      fs.rmSync(link, { recursive: true, force: true })
      log(`removed link ${link}`)
    }
  }
  process.exit(0)
}

for (const plugin of PLUGINS) {
  if (!fs.existsSync(path.join(plugin.dir, 'package.json'))) fail(`plugin directory missing: ${plugin.dir}`)
}

const before = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
const after = structuredClone(before)
after.dependencies = after.dependencies ?? {}
after.dsh = after.dsh ?? {}
after.dsh.profile = after.dsh.profile ?? {}
const bundles = after.dsh.profile.bundles ?? []

for (const plugin of PLUGINS) {
  after.dependencies[plugin.name] = `link:${plugin.dir}`
  if (!bundles.includes(plugin.name)) bundles.push(plugin.name)
  log(`plugin:  ${plugin.name}\n         ${plugin.dir}`)
}
after.dependencies = Object.fromEntries(Object.entries(after.dependencies).sort(([a], [b]) => a.localeCompare(b)))
after.dsh.profile.bundles = bundles
log(`profile: ${PROFILE}`)
log(`bundles: ${bundles.length} entries`)

if (dryRun) {
  log('\n--dry-run: nothing written')
  process.exit(0)
}

// Backup once: a second run must not overwrite the pristine pre-install copy.
if (!fs.existsSync(BACKUP)) {
  fs.copyFileSync(MANIFEST, BACKUP)
  log(`backup:  ${path.basename(BACKUP)}`)
} else {
  log('backup:  already present, left untouched')
}

// Link first, manifest second: the app watches the manifest and recomposes as
// soon as it changes, so every package has to resolve before that write lands.
for (const plugin of PLUGINS) {
  const link = path.join(PROFILE, 'node_modules', plugin.name)
  if (fs.existsSync(link)) {
    log(`link:    ${plugin.name} already present`)
    continue
  }
  fs.symlinkSync(plugin.dir, link, 'junction')
  log(`link:    ${plugin.name} created`)
}

fs.writeFileSync(MANIFEST, `${JSON.stringify(after, null, 2)}\n`)
log('manifest: written — the running app should recompose now')
