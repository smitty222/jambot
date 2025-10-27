// userJoined.js
import { postMessage } from '../libs/cometchat.js'
import { logger } from '../utils/logging.js'
// Use the shared roomThemes object from its dedicated util instead of
// pulling it through the message handler. This avoids circular
// dependencies and makes theme updates globally visible.
import { roomThemes } from '../utils/roomThemes.js'
import * as themeManager from '../utils/themeManager.js'
import { askQuestion } from '../libs/ai.js'

// Persist or update user information when they join. This avoids
// storing mention tokens as nicknames and ensures the users table
// contains a human‑friendly name and the current balance. See
// dbwalletmanager.js for implementation details.
import { addOrUpdateUser } from '../database/dbwalletmanager.js'

/** ───────────────────────────────────────────────────────────────
 * TOGGLES
 * - greetingMessagesEnabled → controls STANDARD greet only
 * - aiGreetingEnabled       → controls AI greet (used when no custom)
 * Precedence: custom > AI (if on) > standard (if on)
 * ─────────────────────────────────────────────────────────────── */
let greetingMessagesEnabled = true
let aiGreetingEnabled = false

const AI_TIMEOUT_MS = 12000
const ROOM = process.env.ROOM_UUID

// When AI is ON but fails/times out, we fall back to STANDARD greet.
// For these specific nicknames, DO NOT @-mention on that fallback.
const SUPPRESS_MENTION_ON_AI_FALLBACK_FOR_NAMES = ['@totally in class']

/** Your custom greet map (Rsmitty removed) */
const customWelcomeMessages = {
  '210141ad-6b01-4665-84dc-e47ea7c27dcb': '{nickname} has arrived!', // ← removed
  '072b0bb3-518e-4422-97fd-13dc53e8ae7e': '🎧{nickname} in the building — not shy, just silently cooking heat 🔥', // Shirey
  '92302b7d-ae5e-466f-975b-d3fee461f13f': 'Ello {nickname}! Welcome!', // Cam
  '1225f84a-c57a-4589-8994-8069794b91ab': 'Govna! Welcome Back {nickname}!', // Dan
  '4c340480-4f5c-4b9a-9e43-f80519154cb0': '{nickname}! Im so happy to see you!', // BeRad
  'df2cd59d-c1ab-4589-98cd-e14f8a400f77': 'All the way from Kenya, everybody welcome {nickname}! Great to see you!', // Alvn
  '3ea72ae7-77db-4d08-9dc6-ce875890c1b5': 'He loves his Metal, but dont let him fool you, hes got tunes from all genres. Welcome back, {nickname}!', // Metalman
  'e99d7d47-7d45-4ab5-b868-8a188db1ec5f': 'Nobody chills harder than {nickname}! Welcome back!', // Straight up Chill
  '554d0d38-0b7b-45d8-9f18-20b4f5689e70': 'Busterrrrrrrrr Douglassssssss {nickname}! In the house!', // P Eacho
  'fd2f1b47-b1d4-4100-8f88-6e56aa82e13f': 'Our favorite groupie has arrived! Welcome {nickname}!', // Gab
  'f3b152a3-b29b-41b8-88b1-dea4d9b952aa': '🌵 From the mysterious deserts of Arizona... emerging once again — it’s the long-lost legend of the aux cord himself! Welcome back, {nickname}!',//sish
  'a122488b-d9ec-4d2f-97bf-9d9472d299a0': 'Hey tall guy {nickname}'//alex

}

/** Helpers */
function sanitize (s) {
  if (typeof s !== 'string') return ''
  return s
    .replace(/[`*_~>#]/g, '')
    .replace(/@/g, '') // avoid raw @
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140)
}

function extractAIText (res) {
  if (!res) return ''
  if (typeof res === 'string') return res
  if (res.text) return res.text
  return res?.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

function mentionOrName (uuid, nickname) {
  return uuid ? `<@uid:${uuid}>` : String(nickname || 'friend').replace(/^@/, '')
}

// Replace <NAME> with a proper mention; gracefully fall back to plain name if uuid missing
function finalizeAiLine (aiRaw, nickname, uuid) {
  const mention = mentionOrName(uuid, nickname)
  let s = sanitize(aiRaw || '')
  if (!s) return null

  // Replace common placeholder variants
  s = s
    .replace(/<\s*NAME\s*>/gi, mention) // <NAME>
    .replace(/\[\s*NAME\s*\]/gi, mention) // [NAME]
    .replace(/\(\s*NAME\s*\)/gi, mention) // (NAME)
    .replace(/\{\s*NAME\s*\}/gi, mention) // {NAME}
    .replace(/«\s*NAME\s*»/gi, mention) // «NAME»
    .replace(/<\s*NAME\b/gi, mention) // malformed "<NAME!"

  // If the model forgot to put a placeholder anywhere, prefix the mention
  if (!s.includes(mention)) s = `${mention} ${s}`

  // Keep it tight (120 chars + mention wiggle room)
  if (s.length > 180) s = s.slice(0, 180)

  return s
}

// Adults-only prompt: witty, can include profanity (but no slurs/illegal/etc.)
async function getAIWelcomeLine (nickname) {
  const ROOM_NAME = 'Just Jam'
  const prompt = `You write ONE short, funny welcome line for an adults-only music chat room called "${ROOM_NAME}".
The user's nickname is: ${nickname}

Tone & content:
- Be witty and personalize based on the nickname if possible (light roasting is OK).
- Profanity is allowed. HOWEVER: no slurs, hate speech, threats, illegal content, or sexual content involving minors.
- Avoid graphic sexual detail; keep it playful and punchy.

Format rules:
- Use the exact placeholder <NAME> (no @) where the user's name/mention should appear.
- 1 sentence, <=120 characters, up to 2 emojis total.
- Mention "${ROOM_NAME}" once if it fits naturally.
- Return ONLY the line (no quotes, hashtags, links, or markdown).

Examples (format only):
- 🎛️ <NAME> slid into ${ROOM_NAME} — queue chaos, drop heat.
- 🪩 <NAME> hit ${ROOM_NAME} — bring the noise, keep the vibe.`

  try {
    const res = await Promise.race([
      askQuestion(prompt),
      new Promise((_, rej) => setTimeout(() => rej(new Error('AI_TIMEOUT')), AI_TIMEOUT_MS))
    ])
    const txt = extractAIText(res)
    const cleaned = sanitize(txt)
    return cleaned || null // we'll inject the mention later
  } catch {
    return null
  }
}

/** Build standard greeting (supports suppressing @ mention) */
function buildStandardGreeting (uuid, nickname, room, { suppressMention = false } = {}) {
  const theme = themeManager.getTheme(room) || 'Just Jam'
  const nameOnly = String(nickname || 'friend').replace(/^@/, '')
  const mention = suppressMention ? nameOnly : mentionOrName(uuid, nickname)

  if (!greetingMessagesEnabled) {
    return `Welcome to the room, ${mention}`
  }

  return `Hey ${mention}! 👋 Welcome to Just Jam! Feel free to hop on stage or vibe in the crowd. If you have any questions, just ask! Don't forget to say hi and invite friends who love music too 🎶
- Current Theme is: ${theme}
- Type /commands to see what else I can do!`
}

/** Precedence: custom > AI (if on) > standard (if on) */
async function generateWelcomeMessage (uuid, nickname, room) {
  const nickLower = (nickname || '').trim().toLowerCase()

  // 1) Custom
  if (customWelcomeMessages[uuid]) {
    console.log('[greet] using CUSTOM for', nickname)
    return customWelcomeMessages[uuid].replace('{nickname}', mentionOrName(uuid, nickname))
  }

  // 2) AI (only if enabled)
  if (aiGreetingEnabled) {
    const aiRaw = await getAIWelcomeLine(nickname || 'friend')
    if (aiRaw) {
      const aiLine = finalizeAiLine(aiRaw, nickname || 'friend', uuid) // pass uuid for proper mention
      if (aiLine) {
        console.log('[greet] using AI for', nickname)
        const theme = themeManager.getTheme(room) || 'Just Jam'
        // Append the requested hyphenated lines to the AI greeting
        return `${aiLine}
- Current Theme is: ${theme}
- Type /commands to see what else I can do!`
      }
    }

    // AI failed → STANDARD fallback with special no-@ rule
    const suppress = SUPPRESS_MENTION_ON_AI_FALLBACK_FOR_NAMES
      .map(n => n.toLowerCase())
      .includes(nickLower)
    console.log('[greet] AI failed → STANDARD for', nickname, '(suppress mention =', suppress, ')')
    return buildStandardGreeting(uuid, nickname || 'friend', room, { suppressMention: suppress })
  }

  // 3) STANDARD
  console.log('[greet] using STANDARD for', nickname)
  return buildStandardGreeting(uuid, nickname || 'friend', room)
}

/** Main entry */
const handleUserJoinedWithStatePatch = async (payload) => {
  try {
    logger.debug?.('State updated for userJoined', { service: 'your-service-name' })

    // Robustly resolve the new user and their UUID, even if field names differ
    let newUserProfile = null
    let uuidFromPath = null

    for (const patch of (payload?.statePatch || [])) {
      if (patch.op === 'add' && typeof patch.path === 'string' && patch.path.startsWith('/allUserData/')) {
        newUserProfile = patch?.value?.userProfile || patch?.value || null

        // parse UUID from the path: "/allUserData/<UUID>"
        const parts = patch.path.split('/')
        if (parts.length >= 3 && parts[2]) uuidFromPath = parts[2]
      }
    }

    if (!newUserProfile) {
      console.log('No new user identified in statePatch.')
      return
    }

    const nickname =
      newUserProfile?.nickname ||
      newUserProfile?.name ||
      'friend'

    const uuid =
      newUserProfile?.uuid ||
      newUserProfile?.uid ||
      newUserProfile?.id ||
      newUserProfile?.userId ||
      uuidFromPath ||
      null

    console.log('[greet] resolved UUID:', uuid, 'nickname:', nickname)

    // Persist the user's nickname in the database. If the nickname
    // looks like a mention (e.g. <@uid:…>) the helper will ignore it
    // and fall back to storing the UUID as the nickname. This call
    // intentionally does not await because it performs a synchronous
    // upsert and should not block the greeting logic.
    try {
      addOrUpdateUser(uuid, nickname)
    } catch (e) {
      console.error('[userJoined] Failed to add/update user:', e?.message || e)
    }

    const welcomeMessage = await generateWelcomeMessage(uuid, nickname, ROOM)

    const messagePayload = {
      room: ROOM,
      message: welcomeMessage,
      sender: process.env.BOT_USER_UUID
    }

    console.log('Sending message payload:', messagePayload)
    const response = await postMessage(messagePayload)
    console.log('Message sent response:', response)
  } catch (error) {
    logger.error('Error handling userJoined event with statePatch:', error?.message || error)
  }
}

/** Exports */
const enableGreetingMessages = () => { greetingMessagesEnabled = true }
const disableGreetingMessages = () => { greetingMessagesEnabled = false }

const enableAIGreeting = () => { aiGreetingEnabled = true }
const disableAIGreeting = () => { aiGreetingEnabled = false }

export default handleUserJoinedWithStatePatch
export {
  enableGreetingMessages,
  disableGreetingMessages,
  greetingMessagesEnabled,
  enableAIGreeting,
  disableAIGreeting,
  aiGreetingEnabled
}
