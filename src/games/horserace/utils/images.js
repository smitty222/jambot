import { readdirSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const HORSE_IMAGE_BASE_URL = (process.env.HORSE_IMAGE_BASE_URL ||
  'https://raw.githubusercontent.com/smitty222/jambot/main/src/games/horserace/assets/horses').replace(/\/$/, '')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const HORSE_ASSETS_DIR = path.resolve(__dirname, '../assets/horses')
const ALLOWED_IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])
const horseTierFilesCache = new Map()

function readTierFiles (tier) {
  const dir = path.join(HORSE_ASSETS_DIR, tier)
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => ALLOWED_IMAGE_EXT.has(path.extname(name).toLowerCase()))
}

function primeHorseImageCache () {
  try {
    const tiers = readdirSync(HORSE_ASSETS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name.toLowerCase())

    for (const tier of tiers) {
      horseTierFilesCache.set(tier, readTierFiles(tier))
    }
  } catch {
    horseTierFilesCache.clear()
  }
}

primeHorseImageCache()

export function listHorseTierImageFiles (tierKey) {
  const tier = String(tierKey || '').toLowerCase()
  if (!tier) return []

  if (horseTierFilesCache.has(tier)) {
    return horseTierFilesCache.get(tier)
  }

  try {
    const files = readTierFiles(tier)
    horseTierFilesCache.set(tier, files)
    return files
  } catch {
    horseTierFilesCache.set(tier, [])
    return []
  }
}

export function buildHorseImageUrl (tierKey, fileName) {
  const tier = String(tierKey || '').toLowerCase()
  const file = String(fileName || '').trim()
  if (!tier || !file) return null
  return `${HORSE_IMAGE_BASE_URL}/${tier}/${encodeURIComponent(file)}`
}

export function pickHorseImageUrl (tierKey) {
  const tier = String(tierKey || '').toLowerCase()
  const files = listHorseTierImageFiles(tier)
  if (!files.length) return null

  const picked = files[Math.floor(Math.random() * files.length)]
  return buildHorseImageUrl(tier, picked)
}
