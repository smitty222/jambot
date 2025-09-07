// src/database/dbtheme.js
import { postMessage } from '../libs/cometchat.js'
import { isUserAuthorized, updateRoomInfo } from '../utils/API.js'
import { getTheme, setTheme, removeTheme, normalizeTheme } from '../utils/themeManager.js'

const ROOM = process.env.ROOM_UUID
const DEFAULT = 'Just Jam'
const TTL_TOKEN = process.env.TTL_USER_TOKEN

const THEME_CONFIGS = [
  { keys: ['albums', 'album monday', 'album day'], payload: { design: 'FERRY_BUILDING', numberOfDjs: 1 } },
  { keys: ['covers', 'cover friday'], payload: { design: 'FESTIVAL', numberOfDjs: 4 } },
  { keys: ['country'], payload: { design: 'BARN', numberOfDjs: 4 } },
  { keys: ['rock'], payload: { design: 'UNDERGROUND', numberOfDjs: 4 } },
  { keys: ['happy hour'], payload: { design: 'TOMORROWLAND', numberOfDjs: 5 } },
  { keys: ['just jam', 'just jams', DEFAULT.toLowerCase()], payload: { design: 'YACHT', numberOfDjs: 3 } }
]

function findRoomUpdatePayload (theme) {
  const lower = String(theme || '').toLowerCase()
  for (const cfg of THEME_CONFIGS) if (cfg.keys.includes(lower)) return cfg.payload
  return null
}

export async function handleThemeCommand ({ sender, room = ROOM, message }) {
  try {
    const [cmd, ...rest] = String(message || '').trim().split(/\s+/)
    if (cmd === '/theme') {
      const current = getTheme(room)
      return await postMessage({ room, message: `🎨 Current theme: **${current}**` })
    }

    if (cmd === '/settheme') {
      if (!(await isUserAuthorized(sender, TTL_TOKEN))) {
        return await postMessage({ room, message: '🔒 Moderator only.' })
      }
      const desired = normalizeTheme(rest.join(' '))
      const saved = setTheme(room, desired)

      const payload = findRoomUpdatePayload(saved)
      if (payload) {
        try { await updateRoomInfo(payload) } catch (e) { console.warn('[theme] updateRoomInfo failed (non-fatal):', e?.message || e) }
      }
      return await postMessage({ room, message: `✅ Theme set to: **${saved}**` })
    }

    if (cmd === '/removetheme') {
      if (!(await isUserAuthorized(sender, TTL_TOKEN))) {
        return await postMessage({ room, message: '🔒 Moderator only.' })
      }
      const saved = removeTheme(room, DEFAULT)
      try { await updateRoomInfo({ design: 'YACHT', numberOfDjs: 3 }) } catch (e) { console.warn('[theme] updateRoomInfo failed (non-fatal):', e?.message || e) }
      return await postMessage({ room, message: `♻️ Theme reset to default: **${saved}**` })
    }
  } catch (err) {
    console.error('[theme] handler error:', err)
    return await postMessage({ room, message: '⚠️ Something went wrong. Please try again later.' })
  }
}
