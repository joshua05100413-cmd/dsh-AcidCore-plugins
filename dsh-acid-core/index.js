/**
 * Local wallpaper library for Acid Core. No server-side settings or media are
 * bundled. Inspired by LeeRolling/dsh-chat-wallpaper (MIT), including its
 * attribution to KylinQ01/dsh-startup-animation for the transparent shell idea.
 * This implementation uses the existing Acid Core theme service and slots.
 */
import { createReadStream } from 'node:fs'
import { mkdir, readdir, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, extname, isAbsolute, join, relative, win32 } from 'node:path'
import { spawn } from 'node:child_process'

const VERSION = '0.3.1'
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.bmp': 'image/bmp' }
const VIDEO_MIME = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm' }
const MAX_IMAGE_BYTES = 32 * 1024 * 1024
export const wallpaperDirectory = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'acid-core', 'wallpapers')
export const videoDirectory = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'acid-core', 'videos')

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  res.end(JSON.stringify(data))
}

function validName(name, types = MIME) {
  return typeof name === 'string' && name.length > 0 && name.length <= 255
    && !/[\\/\x00-\x1f]/.test(name) && basename(name) === name && win32.basename(name) === name
    && Object.hasOwn(types, extname(name).toLowerCase())
}

async function imageFile(directory, name, types = MIME, maxBytes = MAX_IMAGE_BYTES) {
  if (!validName(name, types)) return null
  try {
    const root = await realpath(directory)
    const file = await realpath(join(root, name))
    const inside = relative(root, file)
    if (!inside || inside.startsWith('..') || isAbsolute(inside)) return null
    const info = await stat(file)
    if (!info.isFile() || info.size === 0 || info.size > maxBytes) return null
    return { file, info }
  } catch { return null }
}

function openDirectory(directory) {
  return new Promise((resolve, reject) => {
    const command = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open'
    const child = spawn(command, [directory], { detached: true, stdio: 'ignore', windowsHide: true })
    child.once('error', reject)
    child.once('spawn', () => { child.unref(); resolve() })
  })
}

/** Also used by the HTTP regression tests, with an isolated fixture directory. */
export function createWallpaperHandlers({ directory = wallpaperDirectory, openFolder = openDirectory } = {}) {
  return {
    '/acid-core/wallpapers': async (req, res) => {
      if (req.method !== 'GET') return json(res, 405, { error: 'method' })
      try {
        let names
        try { names = await readdir(directory) } catch (error) { if (error.code === 'ENOENT') names = []; else throw error }
        const images = []
        // Sequential metadata reads avoid an unbounded burst of file handles.
        for (const name of names) {
          const entry = await imageFile(directory, name)
          if (!entry) continue
          images.push({ name, size: entry.info.size, modified: entry.info.mtimeMs,
            url: `/acid-core/wallpaper?name=${encodeURIComponent(name)}&v=${entry.info.mtimeMs}-${entry.info.size}` })
        }
        images.sort((a, b) => b.modified - a.modified || a.name.localeCompare(b.name))
        json(res, 200, { version: VERSION, directory, maxImageBytes: MAX_IMAGE_BYTES, images })
      } catch { json(res, 500, { error: 'library-read' }) }
    },
    '/acid-core/wallpaper': async (req, res) => {
      if (req.method !== 'GET') return json(res, 405, { error: 'method' })
      const name = new URL(req.url, 'http://localhost').searchParams.get('name')
      if (!validName(name)) return json(res, 400, { error: 'image-name' })
      const entry = await imageFile(directory, name)
      if (!entry) return json(res, 404, { error: 'image-missing' })
      const stream = createReadStream(entry.file)
      stream.once('error', () => {
        if (!res.headersSent) json(res, 404, { error: 'image-read' })
        else res.destroy()
      })
      stream.once('open', () => {
        res.writeHead(200, { 'Content-Type': MIME[extname(name).toLowerCase()], 'Content-Length': entry.info.size,
          'Cache-Control': 'private, no-cache', 'X-Content-Type-Options': 'nosniff' })
        stream.pipe(res)
      })
      res.once('close', () => stream.destroy())
    },
    '/acid-core/open-wallpapers': async (req, res) => {
      if (req.method !== 'POST') return json(res, 405, { error: 'method' })
      if (req.headers.origin) {
        try {
          if (new URL(req.headers.origin).host !== req.headers.host) return json(res, 403, { error: 'origin' })
        } catch { return json(res, 403, { error: 'origin' }) }
      }
      try {
        await mkdir(directory, { recursive: true })
        await openFolder(directory)
        json(res, 200, { ok: true })
      } catch { json(res, 500, { error: 'directory-open' }) }
    },
  }
}

/** A single HTTP byte range, including suffix ranges. Invalid ranges are 416. */
export function parseByteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header)
  if (!match || (!match[1] && !match[2])) return null
  let start, end
  if (!match[1]) {
    const suffix = Number(match[2])
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null
    start = Math.max(0, size - suffix); end = size - 1
  } else {
    start = Number(match[1]); end = match[2] ? Number(match[2]) : size - 1
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || start > end) return null
  return { start, end: Math.min(end, size - 1) }
}

export function createVideoHandlers({ directory = videoDirectory, openFolder = openDirectory } = {}) {
  return {
    '/acid-core/videos': async (req, res) => {
      if (req.method !== 'GET') return json(res, 405, { error: 'method' })
      try {
        let names
        try { names = await readdir(directory) } catch (error) { if (error.code === 'ENOENT') names = []; else throw error }
        const videos = []
        for (const name of names) {
          const entry = await imageFile(directory, name, VIDEO_MIME, 2 * 1024 * 1024 * 1024)
          if (entry) videos.push({ name, size: entry.info.size, modified: entry.info.mtimeMs })
        }
        videos.sort((a, b) => b.modified - a.modified || a.name.localeCompare(b.name))
        json(res, 200, { version: VERSION, directory, videos })
      } catch { json(res, 500, { error: 'video-library-read' }) }
    },
    '/acid-core/video': async (req, res) => {
      if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: 'method' })
      const name = new URL(req.url, 'http://localhost').searchParams.get('name')
      if (!validName(name, VIDEO_MIME)) return json(res, 400, { error: 'video-name' })
      const entry = await imageFile(directory, name, VIDEO_MIME, 2 * 1024 * 1024 * 1024)
      if (!entry) return json(res, 404, { error: 'video-missing' })
      const range = req.headers.range ? parseByteRange(req.headers.range, entry.info.size) : undefined
      if (range === null) {
        res.writeHead(416, { 'Content-Range': `bytes */${entry.info.size}`, 'Accept-Ranges': 'bytes' })
        return res.end()
      }
      const headers = { 'Content-Type': VIDEO_MIME[extname(name).toLowerCase()], 'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, no-cache', 'X-Content-Type-Options': 'nosniff',
        'Content-Length': range ? range.end - range.start + 1 : entry.info.size }
      if (range) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${entry.info.size}`
      if (req.method === 'HEAD') { res.writeHead(range ? 206 : 200, headers); return res.end() }
      const stream = createReadStream(entry.file, range || {})
      stream.once('error', () => {
        if (!res.headersSent) json(res, 404, { error: 'video-read' })
        else res.destroy()
      })
      stream.once('open', () => { res.writeHead(range ? 206 : 200, headers); stream.pipe(res) })
      res.once('close', () => stream.destroy())
    },
    '/acid-core/open-videos': async (req, res) => {
      if (req.method !== 'POST') return json(res, 405, { error: 'method' })
      if (req.headers.origin) {
        try { if (new URL(req.headers.origin).host !== req.headers.host) return json(res, 403, { error: 'origin' }) }
        catch { return json(res, 403, { error: 'origin' }) }
      }
      try { await mkdir(directory, { recursive: true }); await openFolder(directory); json(res, 200, { ok: true }) }
      catch { json(res, 500, { error: 'directory-open' }) }
    },
  }
}

export function apply(ctx) {
  // Optional injection keeps theme/crystal activation independent of the server.
  ctx.inject(['webServer'], (serverCtx) => {
    for (const [path, handler] of Object.entries({ ...createWallpaperHandlers(), ...createVideoHandlers() })) {
      serverCtx.effect(() => serverCtx.webServer.register({ kind: 'exact', path,
        handler: (req, res) => { Promise.resolve(handler(req, res)).catch(() => {
          if (!res.headersSent) json(res, 500, { error: 'wallpaper' })
          else res.destroy()
        }) } }))
    }
  })
}

export default { name: 'dsh-acid-core', inject: [], apply }
