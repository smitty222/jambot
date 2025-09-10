// src/libs/ai.js — updated with request timeouts, aborts, and cleaner retries
// ESM module

import fetch from 'node-fetch'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

// ───────────────────────────────────────────────────────────
// Models
// ───────────────────────────────────────────────────────────
// Text-capable models (newest/fastest first)
const TEXT_MODELS_DEFAULT = (
  process.env.AI_TEXT_MODELS ||
  'gemini-2.5-pro,gemini-2.5-flash,gemini-1.5-flash'
)
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

// Image-capable models (newest first)
// Primary = 2.5 Flash Image Preview (returns TEXT+IMAGE)
// Fallback = 2.0 Flash Preview Image Generation (legacy)
const IMAGE_MODEL_PRIMARY =
  process.env.IMAGE_MODEL_PRIMARY || 'gemini-2.5-flash-image-preview'

const IMAGE_MODEL_FALLBACKS = (
  process.env.IMAGE_MODEL_FALLBACKS ||
  'gemini-2.0-flash-preview-image-generation'
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

const info = (...a) => { if (isInfo) console.log('[AI]', ...a) }
const debug = (...a) => { if (isDebug) console.debug('[AI]', ...a) }

// Safe truncation for logs
function preview (str, max = PROMPT_MAX) {
  const s = String(str ?? '')
    .replace(/\r/g, '')
    .replace(/\t/g, ' ')
  if (LOG_PROMPT) return s
  if (s.length <= max) return s
  return s.slice(0, max - 1) + '…'
}

const isTransientAiError = (err) => {
  const code = err?.status || err?.code
  const msg = String(err?.message || '').toLowerCase()
  // Treat rate limit + common 5xx + timeout-ish as transient
  return [429, 500, 502, 503, 504].includes(code) ||
         /quota|rate|limit|temporar|overload|unavail|timeout|timed out|aborted/.test(msg)
}

// ───────────────────────────────────────────────────────────
// Tunables (env-overridable)
// ───────────────────────────────────────────────────────────
const AI_REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS ?? 30_000) // text
const AI_IMAGE_TIMEOUT_MS   = Number(process.env.AI_IMAGE_TIMEOUT_MS   ?? 45_000) // image
const AI_RETRIES            = Number(process.env.AI_RETRIES            ?? 3)
const AI_BACKOFF_MS         = Number(process.env.AI_BACKOFF_MS         ?? 800)

// Response caching (in-memory)
const AI_CACHE_TTL_MS  = Number(process.env.AI_CACHE_TTL_MS  ?? 300_000) // 5 min
const AI_CACHE_MAX_SIZE = Number(process.env.AI_CACHE_MAX_SIZE ?? 50)

const aiCache = new Map()

function getCachedResponse (key) {
  const rec = aiCache.get(key)
  if (!rec) return null
  if (rec.exp <= Date.now()) {
    aiCache.delete(key)
    return null
  }
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

// Abortable fetch helper
async function fetchWithTimeout (url, opts = {}, ms = 30_000) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...opts, signal: controller.signal })
  } finally {
    clearTimeout(t)
  }
}

// ───────────────────────────────────────────────────────────
// Intent detection
// ───────────────────────────────────────────────────────────
function isImageIntent (raw) {
  if (!raw || typeof raw !== 'string') return false
  let q = raw.toLowerCase().trim()
  if (/\b(how to|how do i|explain|what is|tell me about|define|history of|lyrics|instructions)\b/.test(q)) return false

  // Remove polite fillers so patterns match
  q = q.replace(/\b(can you|could you|would you|please|plz|kindly)\b/g, '')
    .replace(/\b(for (me|us)|me|us)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // “make me an image of …”, etc.
  if (/(make|create|generate|draw|paint|illustrate|render|sketch)\s+(an?|the)?\s*(image|picture|pic|photo|poster|logo|graphic)?\s*(of|about)\s+\S/.test(q)) return true

  // direct verb+noun “create an image/poster…”
  if (/(make|create|generate|draw|paint|illustrate|render|sketch)\s+(an?|the)?\s*(image|picture|pic|photo|poster|logo|graphic)\b/.test(q)) return true

  // noun-led “image/poster of …”
  if (/^(image|picture|pic|photo|poster|logo|graphic)\b.*\b(of|that says)\b/.test(q)) return true

  // file / output hints
  if (/\b(png|jpg|jpeg|svg|transparent|square|wallpaper|banner|thumbnail|avatar|icon|sticker|dpi|aspect ratio|pixels?)\b/.test(q)) return true

  return false
}

// ───────────────────────────────────────────────────────────
// Text generation via REST (AbortController-aware) with retries
// ───────────────────────────────────────────────────────────
async function generateTextREST (modelName, prompt, genCfg = {}, timeoutMs = AI_REQUEST_TIMEOUT_MS) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`
  const body = {
    contents: [{ role: 'user', parts: [{ text: String(prompt) }] }],
    generationConfig: genCfg
  }
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }, timeoutMs)

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    const message = data?.error?.message || res.statusText || ''
    const e = new Error(`Gemini text API error ${res.status}: ${message}`)
    e.status = res.status
    throw e
  }

  const parts = data?.candidates?.[0]?.content?.parts || []
  const out = parts.map(p => p?.text || '').join('').trim()
  return out
}

async function generateTextWithRetries (prompt, {
  models = TEXT_MODELS_DEFAULT,
  retries = AI_RETRIES,
  backoffMs = AI_BACKOFF_MS,
  temperature = undefined,
  topP = undefined,
  maxTokens = undefined
} = {}) {
  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    for (const modelName of models) {
      try {
        info('[text request]', { model: modelName, attempt })
        debug('[prompt]', { length: String(prompt || '').length })
        console.log('[AI][PROMPT]', preview(prompt))

        const genCfg = {}
        if (temperature !== undefined) genCfg.temperature = temperature
        if (topP !== undefined) genCfg.topP = topP
        if (maxTokens !== undefined) genCfg.maxOutputTokens = maxTokens

        const out = await generateTextREST(modelName, prompt, genCfg, AI_REQUEST_TIMEOUT_MS)
        info('[text response]', { model: modelName, chars: out.length })
        if (isDebug) console.debug('[response preview]', preview(out, 240))

        if (out) return out
        lastErr = new Error('EMPTY_RESPONSE')
      } catch (e) {
        lastErr = e
        const code = e?.status || e?.code
        const msg = (e?.message || '').toLowerCase()
        const transient = isTransientAiError(e)
        console.warn('[AI][error]', { model: modelName, attempt, code, msg, transient })
      }
    }
    if (attempt < retries) {
      await sleep(backoffMs * (attempt + 1))
    }
  }
  throw lastErr || new Error('AI_FAILED')
}

// ───────────────────────────────────────────────────────────
// Image generation (Gemini REST: generateContent)
// ───────────────────────────────────────────────────────────
async function generateImageWithFallback (prompt) {
  let lastErr
  for (const modelId of IMAGE_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${GEMINI_API_KEY}`

    // Must request both TEXT and IMAGE per Google docs (image-only output not supported)
    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
    }

    try {
      info('[image request]', { modelId, promptLen: String(prompt || '').length })
      if (isDebug) console.debug('[image prompt preview]', preview(prompt, 280))

      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }, AI_IMAGE_TIMEOUT_MS)

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        const message = data?.error?.message || res.statusText || ''
        const e = new Error(`Gemini image API error ${res.status}: ${message}`)
        e.status = res.status

        // If the model is text-only, continue to next model
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

        // Non-transient hard error
        console.error('[image fatal http]', { modelId, status: res.status, message })
        throw e
      }

      const cand = data.candidates?.[0]
      const parts = cand?.content?.parts || []

      let outputText = ''
      let base64Image = null
      for (const part of parts) {
        if (part.text) outputText += part.text
        if (part.inlineData?.mimeType?.startsWith('image/')) {
          base64Image = part.inlineData.data
        }
      }

      const hasImage = !!base64Image
      info('[image response]', { modelId, hasImage, textChars: (outputText || '').length })

      if (hasImage) {
        const dataUri = `data:image/png;base64,${base64Image}`
        const safeText = (outputText && outputText.trim()) || 'Here’s your image!'
        return { text: safeText, imageBase64: base64Image, dataUri, modelId }
      }

      // No image produced (safety block or model didn’t return one). Try next model.
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

  console.error('[image failed all models]', { tried: IMAGE_MODELS, last: lastErr?.message })
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

// Public helpers
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

  // Replace "this song" with actual details if available
  if (typeof question === 'string' && question.toLowerCase().includes('this song')) {
    const before = question
    question = replaceThisSong(question)
    if (before !== question) info('[replaceThisSong]', { applied: true })
  }

  // Detect image-style prompts
  const isImagePrompt = isImageIntent(question)
  if (isImagePrompt) {
    info('[image request] detected')

    const lowered = String(question).toLowerCase()
    if (/\b(me|myself|my face|my portrait)\b/.test(lowered)) {
      return { text: 'If you want an image that includes you, please upload a photo of yourself first so I can use it as a reference.' }
    }

    const key = String(question).replace(/\s+/g, ' ').trim().toLowerCase()
    const cached = getCachedResponse(key)
    if (cached) {
      info('[cache hit]', { key })
      return cached
    }

    try { await onStartImage?.() } catch {}

    const result = await generateImageWithFallback(String(question))
    if (result.dataUri) {
      const value = { text: result.text, images: [result.dataUri] }
      setCachedResponse(key, value)
      return value
    }
    const value = { text: result.text }
    setCachedResponse(key, value)
    return value
  }

  // Text requests
  try {
    const key = String(question).replace(/\s+/g, ' ').trim().toLowerCase()
    const cached = getCachedResponse(key)
    if (cached) {
      info('[cache hit]', { key })
      return { text: cached }
    }

    const text = await generateTextWithRetries(String(question), { models, retries, backoffMs, temperature, topP, maxTokens })
    setCachedResponse(key, text)
    return { text }
  } catch (error) {
    console.error('AI Error:', error)
    if (returnApologyOnError) {
      return { text: 'Sorry, something went wrong trying to get a response from Gemini.' }
    }
    throw error
  }
}

export const chatWithBot = async (userMessage) => {
  try {
    const response = await askQuestion(userMessage)
    return response
  } catch {
    return { text: 'Sorry, something went wrong.' }
  }
}

// ───────────────────────────────────────────────────────────
// Utility flows
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
  let prompt
  if (Array.isArray(categories) && categories.length > 0) {
    const categoryList = categories.join(', ')
    prompt = `Classify the following text into one of the predefined categories: ${categoryList}. If none match, suggest a suitable category.\n\n` + text
  } else {
    prompt = 'Identify appropriate categories or topics for the following text.\n\n' + text
  }
  return askQuestion(prompt, { returnApologyOnError, retries, backoffMs, models, temperature, topP, maxTokens })
}
