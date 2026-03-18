import fs from 'node:fs/promises'
import { watchFile } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const BLACKLIST_PATH = path.join(__dirname, '../data/songBlacklist.json')

let blacklistCache = null
let blacklistLoadPromise = null
let watcherInitialized = false

function ensureWatcher () {
  if (watcherInitialized) return
  watcherInitialized = true

  try {
    watchFile(BLACKLIST_PATH, { persistent: false }, (curr, prev) => {
      if (curr.mtimeMs !== prev.mtimeMs) {
        blacklistCache = null
      }
    })
  } catch {
    // Ignore watcher setup failures and rely on cache invalidation on writes.
  }
}

export async function readSongBlacklist () {
  ensureWatcher()

  if (Array.isArray(blacklistCache)) {
    return [...blacklistCache]
  }

  if (!blacklistLoadPromise) {
    blacklistLoadPromise = (async () => {
      try {
        const raw = await fs.readFile(BLACKLIST_PATH, 'utf8')
        const parsed = JSON.parse(raw)
        blacklistCache = Array.isArray(parsed) ? parsed : []
      } catch {
        blacklistCache = []
      } finally {
        blacklistLoadPromise = null
      }

      return [...blacklistCache]
    })()
  }

  return blacklistLoadPromise
}

export async function writeSongBlacklist (items) {
  const nextItems = Array.isArray(items) ? [...items] : []
  await fs.mkdir(path.dirname(BLACKLIST_PATH), { recursive: true })
  await fs.writeFile(BLACKLIST_PATH, JSON.stringify(nextItems, null, 2))
  blacklistCache = nextItems
}

export async function isSongBlacklisted (trackName, artistName) {
  const list = await readSongBlacklist()
  return list.includes(`${artistName} - ${trackName}`)
}
