// src/libs/ai.js — rate-aware, global+per-model cooldowns, and respectful backoff
// ESM module

import fetch from 'node-fetch'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

// ───────────────────────────────────────────────────────────
// Model catalog & limits (from your sheet)
// RPM=requests/min, TPM=tokens/min, RPD=requests/day
// Keys are *normalized* (see normalizeModelName).
// ───────────────────────────────────────────────────────────
const MODEL_LIMITS = {
  'gemini-2.5-pro':                { rpm: 5,  tpm: 250_000, rpd: 100 },
  'gemini-2.5-flash':              { rpm: 10, tpm: 250_000, rpd: 250 },
  'gemini-2.5-flash-lite':         { rpm: 15, tpm: 250_000, rpd: 1_000 },
  'gemini-2.0-flash':              { rpm: 15, tpm: 1_000_000, rpd: 200 },
  'gemini-2.0-flash-lite':         { rpm: 30, tpm: 1_000_000, rpd: 200 },

  // Treat preview aliases like their base
  'gemini-2.5-flash-preview':      { rpm: 10, tpm: 250_000, rpd: 250 },
  'gemini-2.5-flash-lite-preview': { rpm: 15, tpm: 250_000, rpd: 1_000 },
}

// ───────────────────────────────────────────────────────────
// Default model order: prefer quality but fall back to headroom
// Override with AI_TEXT_MODELS (comma-separated).
// ───────────────────────────────────────────────────────────
const TEXT_MODELS_DEFAULT = (
  process.env.AI_TEXT_MODELS ||
  'gemini-2.5-flash,gemini-2.5-flash-lite,gemini-2.0-flash-lite,gemini-2.0-flash,gemini-2.5-pro'
)
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

// Image-capable models — prefer free-tier multimodal Flash models
const IMAGE_MODEL_PRIMARY =
  process.env.IMAGE_MODEL_PRIMARY || 'gemini-2.5-flash'

const IMAGE_MODEL_FALLBACKS = (
  process.env.IMAGE_MODEL_FALLBACKS ||
  'gemini-2.0-flash,gemini-2.5-flash-lite'
)
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

const IMAGE_MODELS = [IMAGE_MODEL_PRIMARY, ...IMAGE_MODEL_FALLBACKS]

// ───────────────────────────────────────────────────────────
// Logging controls
// ───────────────────────────────────────────────────────────
const LOG_LEVEL = (process.env.LOG_LEVEL || 'error').toLowerCase()
const isInfo = LOG_LEVEL === 'info' || LOG_LEVEL === 'debug'
const isDebug = LOG_LEVEL === 'debug'
const LOG_PROMPT = ['1', 'true', 'on', 'yes'].includes(String(process.env.AI_LOG_PROMPT || '').toLowerCase())
const PROMPT_MAX = Math.max(80, parseInt(process.env.AI_PROMPT_MAX_CHARS || '600', 10) || 600)

const info  = (...a) => { if (isInfo)  console.log('[AI]', ...a) }
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
const AI_IMAGE_TIMEOUT_MS   = Number(process.env.AI_IMAGE_TIMEOUT_MS   ?? 45_000)
const AI_RETRIES            = Number(process.env.AI_RETRIES            ?? 3)
const AI_BACKOFF_MS         = Number(process.env.AI_BACKOFF_MS         ?? 800)

// Global free-tier cool-off default if Retry-After not parseable
const GLOBAL_429_DEFAULT_WAIT_MS = Number(process.env.AI_GLOBAL_429_DEFAULT_WAIT_MS ?? 60_000)

// Local token-bucket (global) to smooth spikes hitting askQuestion
const AI_LOCAL_RL_TOKENS    = Number(process.env.AI_LOCAL_RL_TOKENS    ?? 6)
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

// In-memory response cache
const AI_CACHE_TTL_MS   = Number(process.env.AI_CACHE_TTL_MS   ?? 300_000) // 5m
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
  try { return await fetch(url, { ...opts, signal: controller.signal }) }
  finally { clearTimeout(t) }
}

// ───────────────────────────────────────────────────────────
// Name normalization & discovery
// ───────────────────────────────────────────────────────────
function normalizeModelName(name) {
  return String(name || '')
    .replace(/^models\//i, '')
    .replace(/-latest$/i, '')
    .replace(/-stable$/i, '')
    .replace(/-(?:\d+|0\d\d)$/i, '')                 // -001, -002
    .replace(/-preview(?:-[0-9-]+)?$/i, '-preview')  // preview→canonical
    .replace(/-exp(?:erimental)?$/i, '')             // experimental→base
    .trim()
}

let availableModelsCache = null
async function listModelsAvailable () {
  if (availableModelsCache) return availableModelsCache
  try {
    const res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`, { method: 'GET' }, 10_000
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
function modelIsCoolingDown (modelName) {
  const until = MODEL_COOLDOWNS.get(modelName)
  if (!until) return false
  if (Date.now() >= until) { MODEL_COOLDOWNS.delete(modelName); return false }
  return true
}
function msUntilModelReady (modelName) {
  const until = MODEL_COOLDOWNS.get(modelName)
  if (!until) return 0
  return Math.max(0, until - Date.now())
}

// Global free-tier cooldown (server-wide “free_tier_requests” window)
let GLOBAL_FREE_TIER_COOLDOWN_UNTIL = 0
function globalCooldownMsLeft() {
  return Math.max(0, GLOBAL_FREE_TIER_COOLDOWN_UNTIL - Date.now())
}
function armGlobalCooldown(waitMs) {
  GLOBAL_FREE_TIER_COOLDOWN_UNTIL = Date.now() + Math.max(0, waitMs)
  info('[AI][rate-limit][global] cooling', { ms: waitMs })
}

// ───────────────────────────────────────────────────────────
// Local rate-gate per model (minute/day/token buckets)
// NOTE: best-effort to avoid hitting server limits; server is source of truth.
// ───────────────────────────────────────────────────────────
const rateState = new Map() // model -> { minute:{startTs,count,tokens}, day:{date,count} }

function nowMinuteKey() { const d = new Date(); d.setSeconds(0, 0); return d.getTime() }
function todayKey()     { const d = new Date(); d.setHours(0,0,0,0); return d.getTime() }

function estTokensFromPrompt(prompt, maxOutputTokens) {
  // Rough char→token approximation; good enough to budget TPM
  const inputTokens  = Math.ceil(String(prompt || '').length / 4)
  const outputTokens = Number.isFinite(maxOutputTokens) ? maxOutputTokens : 512
  return { inputTokens, outputTokens, total: inputTokens + outputTokens }
}

function getModelLimits(norm) { return MODEL_LIMITS[norm] || null }

function getRateState(modelNorm) {
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

function modelLocalCapacityOk(modelNorm, tokenBudget) {
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
function noteModelUsage(modelNorm, tokenBudget) {
  const lim = getModelLimits(modelNorm)
  const st = getRateState(modelNorm)
  st.minute.count++
  st.day.count++
  if (lim) st.minute.tokens += (tokenBudget?.total ?? 0)
}
function nextLocalReadyDelayMs(modelNorm, tokenBudget) {
  const lim = getModelLimits(modelNorm)
  if (!lim) return 0
  const st = getRateState(modelNorm)
  const msToNextMinute = st.minute.startTs + 60_000 - Date.now()
  const msToNextDay    = st.day.date     + 86_400_000 - Date.now()
  if (st.minute.count >= lim.rpm || st.minute.tokens + (tokenBudget?.total ?? 0) > lim.tpm) {
    return Math.max(0, msToNextMinute)
  }
  if (st.day.count >= lim.rpd) {
    return Math.max(0, msToNextDay)
  }
  return 0
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

  const cand  = data?.candidates?.[0]
  const parts = cand?.content?.parts || []
  const out   = parts.map(p => p?.text || '').join('').trim()

  if (!out) {
    const fr = String(cand?.finishReason || '').toUpperCase()
    if (fr.includes('SAFETY') || fr.includes('BLOCKLIST') || fr.includes('OTHER')) {
      return "I can’t answer that as asked. Try rephrasing or asking for general info."
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

  // If the whole project is in a free-tier cooldown window, fail fast
  const globalMs = globalCooldownMsLeft()
  if (globalMs > 0) {
    const e = new Error(`Gemini text API error 429: global free tier cooling; retry in ${Math.ceil(globalMs/1000)}s.`)
    e.status = 429
    throw e
  }

  // Discover availability; keep caller's order but drop obvious inaccessibles when we can
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

    // Filter out models cooling down or locally rate-exhausted
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
        info('[AI][cooldown/localrate] all models blocked; waiting', { ms: minWait })
        await sleep(minWait)
        continue
      } else {
        // Unknown limits → try original order
        ready = [...modelList]
      }
    }

    for (const modelName of ready) {
      const modelNorm = normalizeModelName(modelName)
      if (modelIsCoolingDown(modelNorm)) continue

      try {
        info('[text request]', { model: modelName, attempt })
        debug('[prompt]', { length: String(prompt || '').length })
        console.log('[AI][PROMPT]', preview(prompt))

        const genCfg = {}
        if (temperature !== undefined) genCfg.temperature = temperature
        if (topP !== undefined)        genCfg.topP       = topP
        if (maxTokens !== undefined)   genCfg.maxOutputTokens = maxTokens

        // Note local usage before hitting API to avoid race-bursts in same minute
        noteModelUsage(modelNorm, tokenBudget)

        const out = await generateTextREST(modelName, prompt, genCfg, AI_REQUEST_TIMEOUT_MS)
        info('[text response]', { model: modelName, chars: (out || '').length })
        if (isDebug) console.debug('[response preview]', preview(out, 240))
        if (out) return out
        lastErr = new Error('EMPTY_RESPONSE')
      } catch (e) {
        lastErr = e
        const code = e?.status || e?.code
        const msg  = (e?.message || '')
        const low  = msg.toLowerCase()
        const transient = isTransientAiError(e)
        console.warn('[AI][error]', { model: modelName, attempt, code, msg: low, transient })

        // Auth/permission/unknown model → skip to next (long-cooldown 403s)
        if ([401, 403, 404].includes(code)) {
          info('[AI][model-skip]', { model: modelName, reason: code })
          if (code === 403) MODEL_COOLDOWNS.set(modelNorm, Date.now() + 10 * 60 * 1000) // 10m
          continue
        }

        // 429 handling
        if (code === 429) {
          const waitS = parseRetryAfterSeconds(e) || Math.ceil(GLOBAL_429_DEFAULT_WAIT_MS/1000)
          // If it's the *global* free-tier counter, arm a global cool-off too
          if (/generate_content_free_tier_requests|free[\s_-]?tier/i.test(low)) {
            armGlobalCooldown(waitS * 1000)
          }
          // Always cool this model as well
          MODEL_COOLDOWNS.set(modelNorm, Date.now() + waitS * 1000)
          info('[AI][rate-limit] model cooling down', { model: modelName, seconds: waitS })
          continue
        }

        // Other transient errors → continue to next; outer loop will back off as well
        if (transient) continue

        // Non-transient → bubble up
        throw e
      }
    }

    // Outer attempt backoff (jittered)
    if (attempt <= retries) {
      const waitMs = expoBackoffMs(attempt, backoffMs)
      info('[AI][backoff]', { attempt, waitMs })
      await sleep(waitMs)
    }
  }

  throw lastErr || new Error('AI_FAILED')
}

// ───────────────────────────────────────────────────────────
// Image generation (best-effort fallbacks)
// ───────────────────────────────────────────────────────────
async function generateImageWithFallback (prompt) {
  let lastErr

  // Filter IMAGE_MODELS to ones this key can actually see, if possible
  let modelsToTry = [...IMAGE_MODELS]
  try {
    const available = await listModelsAvailable()
    if (available.length) {
      const availSet = new Set(available.map(normalizeModelName))
      const filtered = IMAGE_MODELS.filter(m => availSet.has(normalizeModelName(m)))
      if (filtered.length) modelsToTry = filtered
    }
  } catch {
    // if listModelsAvailable fails, just fall back to IMAGE_MODELS
  }

  for (const modelId of modelsToTry) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${GEMINI_API_KEY}`
    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
    }

    try {
      info('[image request]', { modelId, promptLen: String(prompt || '').length })
      if (isDebug) console.debug('[image prompt preview]', preview(prompt, 280))

      const res = await fetchWithTimeout(
        url,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
        AI_IMAGE_TIMEOUT_MS
      )
      const rawText = await res.text()
      let data = {}; try { data = JSON.parse(rawText) } catch {}

      if (!res.ok) {
        const message = data?.error?.message || res.statusText || rawText || ''
        const e = new Error(`Gemini image API error ${res.status}: ${message}`)
        e.status = res.status

        if (res.status === 400 && /only supports text output/i.test(message)) {
          console.warn('[image model-mismatch]', { modelId, status: res.status })
          lastErr = e
          continue
        }
        if (isTransientAiError(e)) {
          console.warn('[image transient error]', { modelId, status: res.status })
          lastErr = e
          continue
        }
        console.error('[image fatal http]', { modelId, status: res.status, message })
        throw e
      }

      const cand = data.candidates?.[0]
      const parts = cand?.content?.parts || []
      let outputText = ''
      let base64Image = null
      for (const part of parts) {
        if (part.text) outputText += part.text
        if (part.inlineData?.mimeType?.startsWith('image/')) base64Image = part.inlineData.data
      }

      const hasImage = !!base64Image
      info('[image response]', { modelId, hasImage, textChars: (outputText || '').length })
      if (hasImage) {
        const dataUri = `data:image/png;base64,${base64Image}`
        const safeText = (outputText && outputText.trim()) || 'Here’s your image!'
        return { text: safeText, imageBase64: base64Image, dataUri, modelId }
      }

      console.warn('[image no-image-returned]', { modelId })
      lastErr = new Error('NO_IMAGE_RETURNED')
      continue
    } catch (err) {
      if (isTransientAiError(err)) {
        console.warn('[image transient catch]', { modelId, msg: err.message })
        lastErr = err
        continue
      } else {
        console.error('[image fatal]', { modelId, msg: err.message })
        throw err
      }
    }
  }
  console.error('[image failed all models]', { tried: modelsToTry, last: lastErr?.message })
  return { text: 'Sorry, I couldn’t create an image this time.', imageBase64: null, dataUri: null, modelId: null }
}

// ───────────────────────────────────────────────────────────
// Song-aware phrase replacement
// ───────────────────────────────────────────────────────────
let currentSong = null
const replaceThisSong = (question) => {
  if (currentSong?.artistName && currentSong?.trackName) {
    const songDetails = `Artist: ${currentSong.artistName}, Track: ${currentSong.trackName}`
    return String(question).replace(/this song/gi, songDetails)
  }
  return question
}
export const setCurrentSong = (song) => { currentSong = song }

// ───────────────────────────────────────────────────────────
// Public: askQuestion (image detection + caching + retries)
// ───────────────────────────────────────────────────────────
export async function askQuestion (question, opts = {}) {
  const {
    returnApologyOnError = true,
    retries = AI_RETRIES,
    backoffMs = AI_BACKOFF_MS,
    models = TEXT_MODELS_DEFAULT,
    temperature,
    topP,
    maxTokens,
    onStartImage
  } = opts

  if (typeof question === 'string' && question.toLowerCase().includes('this song')) {
    const before = question
    question = replaceThisSong(question)
    if (before !== question) info('[replaceThisSong]', { applied: true })
  }

  // Image path (cached + local smoothing)
  const isImagePrompt = isImageIntent(question)
  if (isImagePrompt) {
    info('[image request] detected')
    const lowered = String(question).toLowerCase()
    if (/\b(me|myself|my face|my portrait)\b/.test(lowered)) {
      return { text: 'If you want an image that includes you, please upload a photo of yourself first so I can use it as a reference.' }
    }
    const key = String(question).replace(/\s+/g, ' ').trim().toLowerCase()
    const cached = getCachedResponse(key); if (cached) { info('[cache hit]', { key }); return cached }
    try { await onStartImage?.() } catch {}
    if (!rlTryTake()) return { text: 'I’m getting a lot of requests—try that image again in a moment.' }

    const result = await generateImageWithFallback(String(question))
    if (result.dataUri) { const value = { text: result.text, images: [result.dataUri] }; setCachedResponse(key, value); return value }
    const value = { text: result.text }; setCachedResponse(key, value); return value
  }

  // Text path (cached + local smoothing + rate-aware engine)
  try {
    // If the whole project is cooling due to free-tier 429, short-circuit here
    const globalMs = globalCooldownMsLeft()
    if (globalMs > 0) {
      return { text: `Rate limited (free tier). I’ll be ready again in about ${Math.ceil(globalMs/1000)}s.` }
    }

    const key = String(question).replace(/\s+/g, ' ').trim().toLowerCase()
    const cached = getCachedResponse(key)
    if (cached) { info('[cache hit]', { key }); return { text: cached } }
    if (!rlTryTake()) return { text: 'Taking a quick breather due to high traffic—try that again in a few seconds.' }

    const text = await generateTextWithRetries(String(question), { models, retries, backoffMs, temperature, topP, maxTokens })
    setCachedResponse(key, text)
    return { text }
  } catch (error) {
    console.error('AI Error:', error)
    if (returnApologyOnError) {
      const code = error?.status || error?.code
      if (code === 401 || code === 403) return { text: "I couldn't access the AI service (auth/permissions). Try again in a bit, and make sure the API key is set." }
      if (code === 404)             return { text: "That model isn't available on this key. I'll fall back to a supported one next time." }
      if (code === 429) {
        const waitS = parseRetryAfterSeconds(error) || Math.ceil(globalCooldownMsLeft()/1000) || Math.ceil(GLOBAL_429_DEFAULT_WAIT_MS/1000)
        // Arm a global cool-off if not already (defensive)
        if (globalCooldownMsLeft() === 0) armGlobalCooldown(waitS * 1000)
        return { text: `Rate limited (free tier). I’ll be ready again in about ${waitS}s.` }
      }
      return { text: 'Sorry, something went wrong trying to get a response from Gemini.' }
    }
    throw error
  }
}

export const chatWithBot = async (userMessage) => {
  try { return await askQuestion(userMessage) }
  catch { return { text: 'Sorry, something went wrong.' } }
}

// ───────────────────────────────────────────────────────────
// Utilities
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
// Intent detection (image)
// ───────────────────────────────────────────────────────────
function isImageIntent (raw) {
  if (!raw || typeof raw !== 'string') return false
  let q = raw.toLowerCase().trim()
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
