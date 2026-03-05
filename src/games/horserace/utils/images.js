import { readdirSync } from 'fs'
import path from 'path'

const HORSE_IMAGE_BASE_URL = (process.env.HORSE_IMAGE_BASE_URL ||
  'https://raw.githubusercontent.com/smitty222/jambot/main/src/games/horserace/assets/horses').replace(/\/$/, '')

const HORSE_ASSETS_DIR = path.resolve(process.cwd(), 'src/games/horserace/assets/horses')
const ALLOWED_IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])

export function listHorseTierImageFiles (tierKey) {
  const tier = String(tierKey || '').toLowerCase()
  if (!tier) return []

  try {
    const dir = path.join(HORSE_ASSETS_DIR, tier)
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => ALLOWED_IMAGE_EXT.has(path.extname(name).toLowerCase()))
  } catch {
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
