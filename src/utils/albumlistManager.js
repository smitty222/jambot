import { promises as fs } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

// Determine the absolute path to the album list file.  The JSON lives two
// directories up from this utils folder at the project root.
const __dirname = dirname(fileURLToPath(import.meta.url))
const ALBUM_LIST_PATH = join(__dirname, '../../albumlist.json')

async function readList () {
  try {
    const data = await fs.readFile(ALBUM_LIST_PATH, 'utf8')
    return JSON.parse(data)
  } catch (err) {
    // If the file doesn't exist or contains invalid JSON, start with an empty list.
    return []
  }
}

// Persist a list of album names back to the JSON file on disk.
async function writeList (list) {
  await fs.writeFile(ALBUM_LIST_PATH, JSON.stringify(list, null, 2))
}

/**
 * Add a new album to the remembered list.
 * @param {string} name The album name to add.
 * @returns {Promise<boolean>} true if added, false if already present.
 */
export async function addAlbum (name) {
  const trimmed = (name || '').trim()
  if (!trimmed) return false
  const list = await readList()
  const normalized = trimmed.toLowerCase()
  if (list.some(item => String(item).toLowerCase() === normalized)) {
    return false
  }
  list.push(trimmed)
  await writeList(list)
  return true
}

/**
 * Remove an album from the remembered list.
 * @param {string} name The album name to remove.
 * @returns {Promise<boolean>} true if removed, false if not found.
 */
export async function removeAlbum (name) {
  const trimmed = (name || '').trim()
  if (!trimmed) return false
  const list = await readList()
  const normalized = trimmed.toLowerCase()
  const index = list.findIndex(item => String(item).toLowerCase() === normalized)
  if (index === -1) {
    return false
  }
  list.splice(index, 1)
  await writeList(list)
  return true
}

/**
 * Retrieve the current list of remembered albums.
 * @returns {Promise<string[]>} the list of album names.
 */
export async function getAlbumList () {
  return await readList()
}
