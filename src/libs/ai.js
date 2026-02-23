// src/libs/ai.js — FREE-TIER SAFE (text-only), rate-aware, global+per-model cooldowns, respectful backoff
// ESM module

import fetch from 'node-fetch'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

// ───────────────────────────────────────────────────────────
// Model catalog & limits (best-effort local gate)
// RPM=requests/min, TPM=tokens/min, RPD=requests/day
// Keys are *normalized* (see normalizeModelName).
// ───────────────────────────────────────────────────────────
const MODEL_LIMITS = {
  'gemini-2.5-pro': { rpm: 5, tpm: 250_000, rpd: 100 },
  'gemini-2.5-flash': { rpm: 10, tpm: 250_000, rpd: 250 },
  'gemini-2.5-flash-lite': { rpm: 15, tpm: 250_000, rpd: 1_000 },
  'gemini-2.0-flash': { rpm: 15, tpm: 1_000_000, rpd: 200 },
  'gemini-2.0-flash-lite': { rpm: 30, tpm: 1_000_000, rpd: 200 },

  // Treat preview aliases like their base
  'gemini-2.5-flash-preview': { rpm: 10, tpm: 250_000, rpd: 250 },
  'gemini-2.5-flash-lite-preview': { rpm: 15, tpm: 250_000, rpd: 1_000 },

  // Gemini 3 flash preview (if your key has it)
  'gemini-3-flash-preview': { rpm: 10, tpm: 250_000, rpd: 250 }
}

// ───────────────────────────────────────────────────────────
// Default model order (free-tier friendly).
// Override with AI_TEXT_MODELS (comma-separated).
// ───────────────────────────────────────────────────────────
const TEXT_MODELS_DEFAULT = (
  process.env.AI_TEXT_MODELS ||
  'gemini-2.5-flash-lite,gemini-2.5-flash,gemini-3-flash-preview'
)
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

// ───────────────────────────────────────────────────────────
// Logging controls
// ───────────────────────────────────────────────────────────
const LOG_LEVEL = (process.env.LOG_LEVEL || 'error').toLowerCase()
const isInfo = LOG_LEVEL === 'info' || LOG_LEVEL === 'debug'
const isDebug = LOG_LEVEL === 'debug'
const LOG_PROMPT = ['1', 'true', 'on', 'yes'].includes(String(process.env.AI_LOG_PROMPT || '').toLowerCase())
const PROMPT_MAX = Math.max(80, parseInt(process.env.AI_PROMPT_MAX_CHARS || '600', 10) || 600)

const info = (...a) => { if (isInfo) console.log('[AI]', ...a) }
const debug = (...a) => { if (isDebug) console.debug('[AI]', ...a) }
function preview (str, max = PROMPT_MAX) {
  const s = String(str ?? '').replace(/\r/g, '').replace(/\t/g, ' ')
  if (LOG_PROMPT) return s
  return s.length <= max ? s : s.slice(0, max - 1) + '…'
}
const isTransientAiError = (err) => {
  const code = err?.status || err?.code
  const msg = String(err?.message || '').toLowerCase()
  return [408, 429, 500, 502, 503, 504].includes(code) ||
         /quota|rate|limit|temporar|overload|unavail|timeout|timed out|aborted|ecs?onn?reset/.test(msg)
}

// ───────────────────────────────────────────────────────────
// Tunables
// ───────────────────────────────────────────────────────────
const AI_REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS ?? 30_000)
const AI_RETRIES = Number(process.env.AI_RETRIES ?? 3)
const AI_BACKOFF_MS = Number(process.env.AI_BACKOFF_MS ?? 800)

// Global free-tier cool-off default if Retry-After not parseable
const GLOBAL_429_DEFAULT_WAIT_MS = Number(process.env.AI_GLOBAL_429_DEFAULT_WAIT_MS ?? 60_000)

// Local token-bucket (global) to smooth spikes hitting askQuestion
const AI_LOCAL_RL_TOKENS = Number(process.env.AI_LOCAL_RL_TOKENS ?? 6)
const AI_LOCAL_RL_WINDOW_MS = Number(process.env.AI_LOCAL_RL_WINDOW_MS ?? 30_000)
const rlBucket = { tokens: AI_LOCAL_RL_TOKENS, lastRefill: Date.now() }
function rlRefill () {
  const now = Date.now()
  if (now - rlBucket.lastRefill >= AI_LOCAL_RL_WINDOW_MS) {
    rlBucket.tokens = AI_LOCAL_RL_TOKENS
    rlBucket.lastRefill = now
  }
}
function rlTryTake () { rlRefill(); if (rlBucket.tokens > 0) { rlBucket.tokens--; return true } return false }

// In-memory response cache (TEXT ONLY)
const AI_CACHE_TTL_MS = Number(process.env.AI_CACHE_TTL_MS ?? 300_000) // 5m
const AI_CACHE_MAX_SIZE = Number(process.env.AI_CACHE_MAX_SIZE ?? 50)
const aiCache = new Map()
function getCachedResponse (key) {
  const rec = aiCache.get(key)
  if (!rec) return null
  if (rec.exp <= Date.now()) { aiCache.delete(key); return null }
  return rec.value
}
function setCachedResponse (key, value) {
  if (aiCache.size >= AI_CACHE_MAX_SIZE) {
    const firstKey = aiCache.keys().next().value
    if (firstKey) aiCache.delete(firstKey)
  }
  aiCache.set(key, { value, exp: Date.now() + AI_CACHE_TTL_MS })
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// Abortable fetch
async function fetchWithTimeout (url, opts = {}, ms = 30_000) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), ms)
  try { return await fetch(url, { ...opts, signal: controller.signal }) } finally { clearTimeout(t) }
}

// ───────────────────────────────────────────────────────────
// Name normalization & discovery
// ───────────────────────────────────────────────────────────
function normalizeModelName (name) {
  return String(name || '')
    .replace(/^models\//i, '')
    .replace(/-latest$/i, '')
    .replace(/-stable$/i, '')
    .replace(/-(?:\d+|0\d\d)$/i, '') // -001, -002
    .replace(/-preview(?:-[0-9-]+)?$/i, '-preview') // preview→canonical
    .replace(/-exp(?:erimental)?$/i, '') // experimental→base
    .trim()
}

let availableModelsCache = null
async function listModelsAvailable () {
  if (availableModelsCache) return availableModelsCache
  if (!GEMINI_API_KEY) return []
  try {
    const res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`,
      { method: 'GET' },
      10_000
    )
    const data = await res.json().catch(() => ({}))
    const names = (data.models || [])
      .map(m => normalizeModelName(m.name))
      .filter(Boolean)
    availableModelsCache = names
    return names
  } catch {
    return []
  }
}

// ───────────────────────────────────────────────────────────
// 429 helpers, backoff, cooldowns (global + per-model)
// ───────────────────────────────────────────────────────────
function parseRetryAfterSeconds (err) {
  try {
    const ra = err?.headers?.get?.('retry-after')
    if (ra) {
      const secs = Number(ra)
      if (Number.isFinite(secs) && secs > 0) return Math.ceil(secs)
    }
  } catch {}
  const m = /retry in\s+([0-9.]+)s/i.exec(String(err?.message || err?.msg || ''))
  if (m) {
    const secs = parseFloat(m[1])
    if (Number.isFinite(secs) && secs > 0) return Math.ceil(secs)
  }
  return null
}
function expoBackoffMs (attempt, baseMs = 500, capMs = 20_000) {
  const pow = Math.min(capMs, baseMs * 2 ** (attempt - 1))
  const jitter = Math.floor(Math.random() * 250)
  return pow + jitter
}

// Per-model cooldowns (until timestamp)
const MODEL_COOLDOWNS = new Map()
function modelIsCoolingDown (modelNorm) {
  const until = MODEL_COOLDOWNS.get(modelNorm)
  if (!until) return false
  if (Date.now() >= until) { MODEL_COOLDOWNS.delete(modelNorm); return false }
  return true
}
function msUntilModelReady (modelNorm) {
  const until = MODEL_COOLDOWNS.get(modelNorm)
  if (!until) return 0
  return Math.max(0, until - Date.now())
}

// Global free-tier cooldown (server-wide “free_tier_requests” window)
let GLOBAL_FREE_TIER_COOLDOWN_UNTIL = 0
function globalCooldownMsLeft () {
  return Math.max(0, GLOBAL_FREE_TIER_COOLDOWN_UNTIL - Date.now())
}
function armGlobalCooldown (waitMs) {
  GLOBAL_FREE_TIER_COOLDOWN_UNTIL = Date.now() + Math.max(0, waitMs)
  info('[rate-limit][global] cooling', { ms: waitMs })
}

// ───────────────────────────────────────────────────────────
// Local rate-gate per model (minute/day/token buckets)
// NOTE: best-effort to avoid hitting server limits; server is source of truth.
// ───────────────────────────────────────────────────────────
const rateState = new Map() // model -> { minute:{startTs,count,tokens}, day:{date,count} }

function nowMinuteKey () { const d = new Date(); d.setSeconds(0, 0); return d.getTime() }
function todayKey () { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() }

function estTokensFromPrompt (prompt, maxOutputTokens) {
  // Rough char→token approximation; good enough to budget TPM
  const inputTokens = Math.ceil(String(prompt || '').length / 4)
  const outputTokens = Number.isFinite(maxOutputTokens) ? maxOutputTokens : 512
  return { inputTokens, outputTokens, total: inputTokens + outputTokens }
}

function getModelLimits (norm) { return MODEL_LIMITS[norm] || null }

function getRateState (modelNorm) {
  let st = rateState.get(modelNorm)
  if (!st) {
    st = { minute: { startTs: nowMinuteKey(), count: 0, tokens: 0 }, day: { date: todayKey(), count: 0 } }
    rateState.set(modelNorm, st)
  }
  // roll minute window
  const minKey = nowMinuteKey()
  if (st.minute.startTs !== minKey) { st.minute.startTs = minKey; st.minute.count = 0; st.minute.tokens = 0 }
  // roll day window
  const dayKey = todayKey()
  if (st.day.date !== dayKey) { st.day.date = todayKey(); st.day.count = 0 }
  return st
}

function modelLocalCapacityOk (modelNorm, tokenBudget) {
  const lim = getModelLimits(modelNorm)
  if (!lim) return true // unknown model → don't block locally
  const st = getRateState(modelNorm)
  const willReq = st.minute.count + 1
  const willDay = st.day.count + 1
  const willTok = st.minute.tokens + (tokenBudget?.total ?? 0)
  const rpmOk = willReq <= lim.rpm
  const rpdOk = willDay <= lim.rpd
  const tpmOk = willTok <= lim.tpm
  return rpmOk && rpdOk && tpmOk
}
function noteModelUsage (modelNorm, tokenBudget) {
  const lim = getModelLimits(modelNorm)
  const st = getRateState(modelNorm)
  st.minute.count++
  st.day.count++
  if (lim) st.minute.tokens += (tokenBudget?.total ?? 0)
}
function nextLocalReadyDelayMs (modelNorm, tokenBudget) {
  const lim = getModelLimits(modelNorm)
  if (!lim) return 0
  const st = getRateState(modelNorm)
  const msToNextMinute = st.minute.startTs + 60_000 - Date.now()
  const msToNextDay = st.day.date + 86_400_000 - Date.now()
  if (st.minute.count >= lim.rpm || st.minute.tokens + (tokenBudget?.total ?? 0) > lim.tpm) {
    return Math.max(0, msToNextMinute)
  }
  if (st.day.count >= lim.rpd) {
    return Math.max(0, msToNextDay)
  }
  return 0
}

// ───────────────────────────────────────────────────────────
// Song state (kept for backwards compatibility with existing code)
// NOTE: Prefer passing context.currentSong to askQuestion instead of relying on this.
// ───────────────────────────────────────────────────────────
let currentSong = null
export const setCurrentSong = (song) => { currentSong = song }

// ───────────────────────────────────────────────────────────
// Context wrapping (keeps chat answers short + relevant)
// ───────────────────────────────────────────────────────────
function buildContextPreamble (context = {}) {
  const {
    roomName,
    botName,
    userNickname,
    currentSong: ctxSong,
    currentAlbum,
    tone,
    gameState
  } = context || {}

  // Prefer explicit context song; fallback to global currentSong if present.
  const song = ctxSong || currentSong

  const lines = []
  if (botName) lines.push(`Bot name: ${botName}`)
  if (roomName) lines.push(`Room: ${roomName}`)
  if (userNickname) lines.push(`User: ${userNickname}`)
  if (tone) lines.push(`Tone: ${tone}`)
  if (gameState) lines.push(`Game state: ${gameState}`)

  if (song) {
    const s = song
    const parts = []
    if (s.trackName) parts.push(`Track: ${s.trackName}`)
    if (s.artistName) parts.push(`Artist: ${s.artistName}`)
    if (s.albumName && s.albumName !== 'Unknown') parts.push(`Album: ${s.albumName}`)
    if (s.releaseDate && s.releaseDate !== 'Unknown') parts.push(`Release: ${s.releaseDate}`)
    if (s.isrc) parts.push(`ISRC: ${s.isrc}`)
    if (s.popularity != null) parts.push(`Popularity: ${s.popularity}`)
    const link = s?.links?.spotify?.url || s?.links?.appleMusic?.url || s?.links?.youtube?.url
    lines.push(`Now playing: ${parts.join(' | ')}${link ? ` | Link: ${link}` : ''}`)
  } else if (currentAlbum) {
    const a = currentAlbum
    const parts = []
    if (a.albumName) parts.push(`Album: ${a.albumName}`)
    if (a.artistName) parts.push(`Artist: ${a.artistName}`)
    if (parts.length) lines.push(`Current album: ${parts.join(' | ')}`)
  }

  if (!lines.length) return ''
  return `Context:\n${lines.map(l => `- ${l}`).join('\n')}\n\n`
}

function wrapPromptWithContext (question, context) {
  const pre = buildContextPreamble(context)
  const contract =
    `Reply in a chat-friendly way:\n` +
    `- Keep it concise (max ~1200 characters unless asked otherwise)\n` +
    `- Use 1 short paragraph + up to 3 bullets when helpful\n` +
    `- If recommending music, give exactly 1 rec and why\n\n`

  return `${pre}${contract}User asked:\n${String(question || '').trim()}`
}

// ───────────────────────────────────────────────────────────
// Text generation via REST
// ───────────────────────────────────────────────────────────
async function generateTextREST (modelName, prompt, genCfg = {}, timeoutMs = AI_REQUEST_TIMEOUT_MS) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`
  const body = { contents: [{ role: 'user', parts: [{ text: String(prompt) }] }], generationConfig: genCfg }

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }, timeoutMs)

  const rawText = await res.text()
  let data = {}
  try { data = JSON.parse(rawText) } catch {}

  if (!res.ok) {
    const message = data?.error?.message || res.statusText || rawText || ''
    const e = new Error(`Gemini text API error ${res.status}: ${message}`)
    e.status = res.status
    e.headers = res.headers
    throw e
  }

  const cand = data?.candidates?.[0]
  const parts = cand?.content?.parts || []
  const out = parts.map(p => p?.text || '').join('').trim()

  if (!out) {
    const fr = String(cand?.finishReason || '').toUpperCase()
    if (fr.includes('SAFETY') || fr.includes('BLOCKLIST') || fr.includes('OTHER')) {
      return 'I can’t answer that as asked. Try rephrasing or asking for general info.'
    }
  }
  return out
}

// ───────────────────────────────────────────────────────────
// generateTextWithRetries: rate-aware selection + cooldowns
// ───────────────────────────────────────────────────────────
async function generateTextWithRetries (prompt, {
  models = TEXT_MODELS_DEFAULT,
  retries = AI_RETRIES,
  backoffMs = AI_BACKOFF_MS,
  temperature,
  topP,
  maxTokens
} = {}) {
  let lastErr

  const globalMs = globalCooldownMsLeft()
  if (globalMs > 0) {
    const e = new Error(`Gemini text API error 429: global free tier cooling; retry in ${Math.ceil(globalMs / 1000)}s.`)
    e.status = 429
    throw e
  }

  // Drop models your key can’t see, if possible
  let modelList = [...models]
  try {
    const available = await listModelsAvailable()
    if (available.length) {
      const availSet = new Set(available.map(normalizeModelName))
      const normalizedRequested = models.map(m => [m, normalizeModelName(m)])
      const matched = normalizedRequested.filter(([, norm]) => availSet.has(norm)).map(([orig]) => orig)
      if (matched.length) modelList = matched
    }
  } catch {}

  for (let attempt = 1; attempt <= (retries + 1); attempt++) {
    const tokenBudget = estTokensFromPrompt(prompt, maxTokens)

    let ready = modelList.filter(m => {
      const norm = normalizeModelName(m)
      if (modelIsCoolingDown(norm)) return false
      return modelLocalCapacityOk(norm, tokenBudget)
    })

    if (ready.length === 0) {
      const waits = modelList.map(m => {
        const norm = normalizeModelName(m)
        const cd = msUntilModelReady(norm)
        const lr = nextLocalReadyDelayMs(norm, tokenBudget)
        return Math.max(cd, lr)
      }).filter(ms => ms > 0)

      if (waits.length) {
        const minWait = Math.min(...waits)
        info('[cooldown/localrate] all models blocked; waiting', { ms: minWait })
        await sleep(minWait)
        continue
      } else {
        ready = [...modelList]
      }
    }

    for (const modelName of ready) {
      const modelNorm = normalizeModelName(modelName)
      if (modelIsCoolingDown(modelNorm)) continue

      try {
        info('[text request]', { model: modelName, attempt })
        debug('[prompt]', { length: String(prompt || '').length })
        if (isInfo || LOG_PROMPT) console.log('[AI][PROMPT]', preview(prompt))

        const genCfg = {}
        if (temperature !== undefined) genCfg.temperature = temperature
        if (topP !== undefined) genCfg.topP = topP
        if (maxTokens !== undefined) genCfg.maxOutputTokens = maxTokens

        noteModelUsage(modelNorm, tokenBudget)

        const out = await generateTextREST(modelName, prompt, genCfg, AI_REQUEST_TIMEOUT_MS)
        info('[text response]', { model: modelName, chars: (out || '').length })
        if (isDebug) console.debug('[response preview]', preview(out, 240))
        if (out) return out
        lastErr = new Error('EMPTY_RESPONSE')
      } catch (e) {
        lastErr = e
        const code = e?.status || e?.code
        const msg = (e?.message || '')
        const low = msg.toLowerCase()
        const transient = isTransientAiError(e)
        console.warn('[AI][error]', { model: modelName, attempt, code, msg: low, transient })

        if ([401, 403, 404].includes(code)) {
          info('[model-skip]', { model: modelName, reason: code })
          if (code === 403) MODEL_COOLDOWNS.set(modelNorm, Date.now() + 10 * 60 * 1000) // 10m
          continue
        }

        if (code === 429) {
          const waitS = parseRetryAfterSeconds(e) || Math.ceil(GLOBAL_429_DEFAULT_WAIT_MS / 1000)
          if (/generate_content_free_tier_requests|free[\s_-]?tier/i.test(low)) {
            armGlobalCooldown(waitS * 1000)
          }
          MODEL_COOLDOWNS.set(modelNorm, Date.now() + waitS * 1000)
          info('[rate-limit] model cooling down', { model: modelName, seconds: waitS })
          continue
        }

        if (transient) continue
        throw e
      }
    }

    if (attempt <= retries) {
      const waitMs = expoBackoffMs(attempt, backoffMs)
      info('[backoff]', { attempt, waitMs })
      await sleep(waitMs)
    }
  }

  throw lastErr || new Error('AI_FAILED')
}

// ───────────────────────────────────────────────────────────
// Public: askQuestion (TEXT-ONLY; image generation disabled for free-tier safety)
// ───────────────────────────────────────────────────────────
export async function askQuestion (question, opts = {}) {
  const {
    context,
    returnApologyOnError = true,
    retries = AI_RETRIES,
    backoffMs = AI_BACKOFF_MS,
    models = TEXT_MODELS_DEFAULT,
    temperature,
    topP,
    maxTokens
  } = opts

  // Politely refuse image-generation asks to avoid any paid-tier risk.
  if (isImageIntent(question)) {
    return { text: "I can’t generate images right now (free tier). Ask me for text info instead 🙏" }
  }

  const prompt = context ? wrapPromptWithContext(question, context) : question

  try {
    const globalMs = globalCooldownMsLeft()
    if (globalMs > 0) {
      return { text: `Rate limited (free tier). I’ll be ready again in about ${Math.ceil(globalMs / 1000)}s.` }
    }

    // Namespace cache keys (text-only)
    const baseKey = String(question).replace(/\s+/g, ' ').trim().toLowerCase()
    const cacheKey = `text:${baseKey}`

    const cached = getCachedResponse(cacheKey)
    if (cached) { info('[cache hit]', { cacheKey }); return { text: cached } }

    if (!rlTryTake()) {
      return { text: 'Taking a quick breather due to high traffic—try that again in a few seconds.' }
    }

    const text = await generateTextWithRetries(String(prompt), { models, retries, backoffMs, temperature, topP, maxTokens })
    setCachedResponse(cacheKey, text)
    return { text }
  } catch (error) {
    console.error('AI Error:', error)

    if (returnApologyOnError) {
      const code = error?.status || error?.code
      if (code === 401 || code === 403) {
        return { text: "I couldn't access the AI service (auth/permissions). Try again in a bit, and make sure the API key is set." }
      }
      if (code === 404) {
        return { text: "That model isn't available on this key. I'll fall back to a supported one next time." }
      }
      if (code === 429) {
        const waitS =
          parseRetryAfterSeconds(error) ||
          Math.ceil(globalCooldownMsLeft() / 1000) ||
          Math.ceil(GLOBAL_429_DEFAULT_WAIT_MS / 1000)

        if (globalCooldownMsLeft() === 0) armGlobalCooldown(waitS * 1000)
        return { text: `Rate limited (free tier). I’ll be ready again in about ${waitS}s.` }
      }
      return { text: 'Sorry, something went wrong trying to get a response from Gemini.' }
    }

    throw error
  }
}

export const chatWithBot = async (userMessage) => {
  try { return await askQuestion(userMessage) } catch { return { text: 'Sorry, something went wrong.' } }
}

// ───────────────────────────────────────────────────────────
// Utilities (still text-only)
// ───────────────────────────────────────────────────────────
export async function summarizeText (text, {
  maxWords = 100,
  returnApologyOnError = true,
  retries = AI_RETRIES,
  backoffMs = AI_BACKOFF_MS,
  models = TEXT_MODELS_DEFAULT,
  temperature,
  topP,
  maxTokens
} = {}) {
  const prompt = `Summarize the following text in no more than ${maxWords} words. Focus on the main points and avoid unnecessary detail.\n\n` + text
  return askQuestion(prompt, { returnApologyOnError, retries, backoffMs, models, temperature, topP, maxTokens })
}

export async function translateText (text, language, {
  returnApologyOnError = true,
  retries = AI_RETRIES,
  backoffMs = AI_BACKOFF_MS,
  models = TEXT_MODELS_DEFAULT,
  temperature,
  topP,
  maxTokens
} = {}) {
  const prompt = `Translate the following text into ${language}.\n\n` + text
  return askQuestion(prompt, { returnApologyOnError, retries, backoffMs, models, temperature, topP, maxTokens })
}

export async function categorizeText (text, {
  categories,
  returnApologyOnError = true,
  retries = AI_RETRIES,
  backoffMs = AI_BACKOFF_MS,
  models = TEXT_MODELS_DEFAULT,
  temperature,
  topP,
  maxTokens
} = {}) {
  const prompt = Array.isArray(categories) && categories.length > 0
    ? `Classify the following text into one of the predefined categories: ${categories.join(', ')}. If none match, suggest a suitable category.\n\n` + text
    : 'Identify appropriate categories or topics for the following text.\n\n' + text
  return askQuestion(prompt, { returnApologyOnError, retries, backoffMs, models, temperature, topP, maxTokens })
}

// ───────────────────────────────────────────────────────────
// Intent detection (image) — used ONLY to refuse image requests safely.
// (No image generation code exists in this file.)
// ───────────────────────────────────────────────────────────
function isImageIntent (raw) {
  if (!raw || typeof raw !== 'string') return false
  let q = raw.toLowerCase().trim()

  // common “text questions” that mention image words in passing
  if (/\b(how to|how do i|explain|what is|tell me about|define|history of|lyrics|instructions)\b/.test(q)) return false

  q = q.replace(/\b(can you|could you|would you|please|plz|kindly)\b/g, '')
    .replace(/\b(for (me|us)|me|us)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (/(make|create|generate|draw|paint|illustrate|render|sketch)\s+(an?|the)?\s*(image|picture|pic|photo|poster|logo|graphic)?\s*(of|about)\s+\S/.test(q)) return true
  if (/(make|create|generate|draw|paint|illustrate|render|sketch)\s+(an?|the)?\s*(image|picture|pic|photo|poster|logo|graphic)\b/.test(q)) return true
  if (/^(image|picture|pic|photo|poster|logo|graphic)\b.*\b(of|that says)\b/.test(q)) return true
  if (/\b(png|jpg|jpeg|svg|transparent|square|wallpaper|banner|thumbnail|avatar|icon|sticker|dpi|aspect ratio|pixels?)\b/.test(q)) return true

  return false
}