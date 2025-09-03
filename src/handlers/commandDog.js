// src/handlers/commandDog.js
import { postMessage } from '../libs/cometchat.js'
import { getRandomDogImage } from '../utils/API.js'

// LOG_LEVEL=debug to see debug logs; defaults to errors-only
const LOG_LEVEL = (process.env.LOG_LEVEL || 'error').toLowerCase()
const isDebug = LOG_LEVEL === 'debug'
const d = (...a) => { if (isDebug) console.debug('[DOG]', ...a) }

function parseBreed(args = []) {
  // Supports: "/dog", "/dog shiba", "/dog hound afghan"
  if (!Array.isArray(args) || args.length === 0) return null
  const safe = args
    .filter(Boolean)
    .map(s => String(s).toLowerCase().replace(/[^a-z\-]/g, '')) // keep letters & hyphen
    .filter(s => s.length > 0)
  if (safe.length === 0) return null
  // If two parts, treat as breed/sub-breed for dog.ceo (e.g., hound/afghan)
  return safe.length === 1 ? safe[0] : `${safe[0]}/${safe[1]}`
}

function prettyBreed(breedPath) {
  if (!breedPath) return ''
  return breedPath
    .split('/')
    .map(part => part.replace(/-+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))
    .join(' / ')
}

/**
 * Handle the /dog command.
 * @param {Object} opts
 * @param {string} opts.room - Room UUID
 * @param {string[]} [opts.args] - Command args after /dog
 */
export async function handleDogCommand({ room, args = [] }) {
  const breedPath = parseBreed(args)
  d('args:', args, 'breedPath:', breedPath)

  try {
    // Try requested breed first (if provided)
    let url = await getRandomDogImage(breedPath || undefined)

    // If requested breed failed (unknown), fall back to random
    if (!url && breedPath) {
      url = await getRandomDogImage()
    }

    if (!url) {
      await postMessage({ room, message: '🐶 Could not fetch a pup right now — try again in a bit!' })
      return
    }

    const prefix = breedPath ? `🐶 ${prettyBreed(breedPath)}:` : '🐶'
    await postMessage({ room, message: `${prefix} ${url}` })
  } catch (e) {
    console.error('[DOG] command error:', e?.message || e)
    await postMessage({ room, message: '🐶 Something went wrong fetching a pup.' })
  }
}

// Optional default export for router convenience
export default handleDogCommand
