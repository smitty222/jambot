// src/libs/ai.js
import { GoogleGenerativeAI } from '@google/generative-ai'
import fetch from 'node-fetch'
import fs from 'fs'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

// ───────────────────────────────────────────────────────────
// Logging controls
// ───────────────────────────────────────────────────────────
const LOG_LEVEL = (process.env.LOG_LEVEL || 'error').toLowerCase()
const isInfo  = LOG_LEVEL === 'info' || LOG_LEVEL === 'debug'
const isDebug = LOG_LEVEL === 'debug'
const LOG_PROMPT = ['1','true','on','yes'].includes(String(process.env.AI_LOG_PROMPT || '').toLowerCase())
const PROMPT_MAX = Math.max(80, parseInt(process.env.AI_PROMPT_MAX_CHARS || '600', 10) || 600)

const info  = (...a) => { if (isInfo)  console.log('[AI]', ...a) }
const debug = (...a) => { if (isDebug) console.debug('[AI]', ...a) }

// Safe truncation for logs
function preview(str, max = PROMPT_MAX) {
  const s = String(str ?? '')
    .replace(/\r/g, '')
    .replace(/\t/g, ' ')
  if (LOG_PROMPT) return s
  if (s.length <= max) return s
  return s.slice(0, max - 1) + '…'
}

let currentSong = null

// ───────────────────────────────────────────────────────────
// Response caching
// ───────────────────────────────────────────────────────────
// To reduce latency for repeated or similar queries, we cache recent AI
// responses in memory.  A simple Map is used where the key is the
// normalized prompt string and the value is an object containing the
// response and an expiry timestamp.  When the cache size exceeds the
// configured limit, the oldest entry is evicted.  The TTL and maximum
// number of cached entries can be configured via environment variables.

const AI_CACHE_TTL_MS   = Number(process.env.AI_CACHE_TTL_MS ?? 300_000); // default 5 minutes
const AI_CACHE_MAX_SIZE = Number(process.env.AI_CACHE_MAX_SIZE ?? 50);

const aiCache = new Map();

function getCachedResponse(prompt) {
  const rec = aiCache.get(prompt);
  if (!rec) return null;
  if (rec.exp <= Date.now()) {
    aiCache.delete(prompt);
    return null;
  }
  return rec.value;
}

function isImageIntent(raw) {
  if (!raw || typeof raw !== 'string') return false;
  let q = raw.toLowerCase().trim();
  if (/\b(how to|how do i|explain|what is|tell me about|define|history of|lyrics|instructions)\b/.test(q)) return false;

  // Remove polite fillers so patterns match
  q = q.replace(/\b(can you|could you|would you|please|plz|kindly)\b/g, '')
       .replace(/\b(for (me|us)|me|us)\b/g, ' ')
       .replace(/\s+/g, ' ')
       .trim();

  // “make me an image of …”, etc.
  if (/(make|create|generate|draw|paint|illustrate|render|sketch)\s+(an?|the)?\s*(image|picture|pic|photo|poster|logo|graphic)?\s*(of|about)\s+\S/.test(q)) return true;

  // direct verb+noun “create an image/poster…”
  if (/(make|create|generate|draw|paint|illustrate|render|sketch)\s+(an?|the)?\s*(image|picture|pic|photo|poster|logo|graphic)\b/.test(q)) return true;

  // noun-led “image/poster of …”
  if (/^(image|picture|pic|photo|poster|logo|graphic)\b.*\b(of|that says)\b/.test(q)) return true;

  // file / output hints
  if (/\b(png|jpg|jpeg|svg|transparent|square|wallpaper|banner|thumbnail|avatar|icon|sticker|dpi|aspect ratio|pixels?)\b/.test(q)) return true;

  return false;
}



function setCachedResponse(prompt, value) {
  // Enforce max size; remove oldest entry if necessary
  if (aiCache.size >= AI_CACHE_MAX_SIZE) {
    const firstKey = aiCache.keys().next().value;
    if (firstKey) aiCache.delete(firstKey);
  }
  aiCache.set(prompt, { value, exp: Date.now() + AI_CACHE_TTL_MS });
}

// ───────────────────────────────────────────────────────────
// Text generation with retries and tuning parameters
// ───────────────────────────────────────────────────────────
/**
 * Generate text using the Gemini API with support for multiple models, retries
 * and optional sampling parameters.  If one model fails, the next model will
 * be tried.  Between attempts the function backs off exponentially.
 *
 * @param {string} prompt - The full prompt to send to the model.
 * @param {Object} [options] - Optional parameters to control generation.
 * @param {Array<string>} [options.models] - List of model names to try.
 * @param {number} [options.retries] - Number of retry rounds.
 * @param {number} [options.backoffMs] - Base backoff in milliseconds.
 * @param {number} [options.temperature] - Sampling temperature (0–2); lower
 *   values make output more deterministic, higher values increase variety.
 * @param {number} [options.topP] - Nucleus sampling probability (0–1); lower
 *   values limit tokens to the highest probability mass.
 * @param {number} [options.maxTokens] - Maximum tokens to generate.
 * @returns {Promise<string>} The generated text.
 */
async function generateTextWithRetries(prompt, {
  // Prefer the Gemini 2.5 Pro model for text tasks.  Fallback to the 2.5 Flash
  // variant and the older 1.5 Flash in case the Pro model is unavailable or
  // returns an error.  See docs for model capabilities【824137802243041†L177-L187】.
  models = ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-1.5-flash'],
  retries = 2,
  backoffMs = 600,
  temperature = undefined,
  topP = undefined,
  maxTokens = undefined
} = {}) {
  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    // Try each model in order.  If one fails, continue to next.
    for (const modelName of models) {
      try {
        // Log the prompt once per (model, attempt)
        info('[text request]', { model: modelName, attempt })
        debug('[prompt]', { length: String(prompt || '').length })
        console.log('[AI][PROMPT]', preview(prompt))

        // Create the model instance per request.  This ensures token refreshes
        // and avoids stale connections.
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
        const model = genAI.getGenerativeModel({ model: modelName })

        let out = ''
        // Primary attempt: use structured request with generationConfig if
        // sampling parameters are provided.  Not all SDK versions support
        // generationConfig, so we catch errors and fall back.
        if (temperature !== undefined || topP !== undefined || maxTokens !== undefined) {
          try {
            const req = {
              contents: [ { role: 'user', parts: [ { text: String(prompt) } ] } ],
              generationConfig: {}
            }
            if (temperature !== undefined) req.generationConfig.temperature = temperature
            if (topP !== undefined) req.generationConfig.topP = topP
            if (maxTokens !== undefined) req.generationConfig.maxOutputTokens = maxTokens
            const res = await model.generateContent(req)
            const text = res?.response?.text?.() || ''
            out = (text || '').trim()
          } catch (innerErr) {
            // fallback to simple string request if structured call fails
            const res = await model.generateContent(String(prompt))
            const text = res?.response?.text?.() || ''
            out = (text || '').trim()
          }
        } else {
          // If no tuning params provided, use simple string call
          const res = await model.generateContent(String(prompt))
          const text = res?.response?.text?.() || ''
          out = (text || '').trim()
        }

        info('[text response]', { model: modelName, chars: out.length })
        if (isDebug) console.debug('[response preview]', preview(out, 240))

        if (out) return out
        lastErr = new Error('EMPTY_RESPONSE')
      } catch (e) {
        lastErr = e
        const code = e?.status || e?.code
        const msg = (e?.message || '').toLowerCase()
        const transient = [429, 500, 502, 503, 504].includes(code) || /temporar|overload|unavail|timeout/.test(msg)
        console.warn('[AI][error]', { model: modelName, attempt, code, msg, transient })
        // continue to next model; if all models fail, retry after backoff
      }
    }
    // Only back off if we will retry again
    if (attempt < retries) {
      await new Promise(r => setTimeout(r, backoffMs * (attempt + 1)))
    }
  }
  // If nothing succeeded, throw last error or a generic error
  throw lastErr || new Error('AI_FAILED')
}

// ───────────────────────────────────────────────────────────
// Public: askQuestion
// ───────────────────────────────────────────────────────────
export async function askQuestion(question, opts = {}) {
  const {
    // If true, return a user-friendly apology on failure; else throw.
    returnApologyOnError = true,
    retries = 2,
    backoffMs = 600,
    // Prefer Gemini 2.5 Pro for text responses; fallback to 2.5 Flash then 1.5 Flash
    models = ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-1.5-flash'],
    // Optional tuning parameters; if undefined, defaults will be used
    temperature,
    topP,
    maxTokens,
    onStartImage,
  } = opts

  // Replace "this song" with actual details if available
  if (typeof question === 'string' && question.toLowerCase().includes('this song')) {
    const before = question
    question = replaceThisSong(question)
    if (before !== question) info('[replaceThisSong]', { applied: true })
  }

  // Detect image-style prompts
  const isImagePrompt = isImageIntent(question);
  if (isImagePrompt) {
    info('[image request] detected')
    // Check if the user is asking for a personal or self portrait; if so, ask for
    // a reference image instead of generating from description.  This prevents
    // accidental depiction of real individuals without consent.
    const lowered = String(question).toLowerCase();
    if (/\b(me|myself|my face|my portrait)\b/.test(lowered)) {
      return { text: 'If you want an image that includes you, please upload a photo of yourself first so I can use it as a reference.' };
    }
    // Normalize the key for caching: trim whitespace and collapse multiple spaces
    const key = String(question).replace(/\s+/g, ' ').trim().toLowerCase()
    const cached = getCachedResponse(key)
    if (cached) {
      info('[cache hit]', { key })
      return cached
    }

    // 👇 Fire the hook right before network work
    try { await onStartImage?.(); } catch {}

    const result = await generateImage(String(question))
    // If the model returned an image, convert it to a data URI and cache it
    if (result.dataUri) {
      const value = { text: result.text, images: [result.dataUri] }
      setCachedResponse(key, value)
      return value
    }
    // Fallback: return only text and cache
    const value = { text: result.text }
    setCachedResponse(key, value)
    return value
  }

  // Text requests
  try {
    // Normalize the key for caching: trim whitespace and collapse multiple spaces
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
    throw error // let the caller decide to skip posting
  }
}

// ───────────────────────────────────────────────────────────
// Image generation (Gemini REST)
// ───────────────────────────────────────────────────────────
async function generateImage(prompt) {
  // Use the Gemini 2.5 Flash Image Preview model for image generation.  This
  // model supports text-to-image and image editing.  See docs for details
  //【824137802243041†L170-L198】.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${GEMINI_API_KEY}`
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
  }

  try {
    info('[image request][prompt]', { length: String(prompt || '').length })
    if (isDebug) console.debug('[image prompt preview]', preview(prompt, 280))

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const data = await res.json()
    const parts = data.candidates?.[0]?.content?.parts || []
    let outputText = ''
    let base64Image = null
    for (const part of parts) {
      if (part.text) outputText += part.text
      if (part.inlineData?.mimeType?.startsWith('image/')) {
        base64Image = part.inlineData.data
      }
    }
    info('[image response]', { hasImage: !!base64Image, textChars: outputText.length })
    // When a base64 image is returned, convert it to a data URI.  Otherwise return null.
    const dataUri = base64Image ? `data:image/png;base64,${base64Image}` : null;
    return { text: outputText || 'Here’s your image!', imageBase64: base64Image, dataUri }
  } catch (error) {
    console.error('Image generation error:', error)
    return { text: 'Sorry, I couldn’t create an image this time.', imageBase64: null }
  }
}

// ───────────────────────────────────────────────────────────
// Song-aware phrase replacement
// ───────────────────────────────────────────────────────────
const replaceThisSong = (question) => {
  if (currentSong?.artistName && currentSong?.trackName) {
    const songDetails = `Artist: ${currentSong.artistName}, Track: ${currentSong.trackName}`
    return String(question).replace(/this song/gi, songDetails)
  }
  return question
}

// Public helpers
export const setCurrentSong = (song) => { currentSong = song }

export const chatWithBot = async (userMessage) => {
  try {
    const response = await askQuestion(userMessage)
    return response
  } catch {
    return { text: 'Sorry, something went wrong.' }
  }
}

// ───────────────────────────────────────────────────────────
// Additional helper functions
// ───────────────────────────────────────────────────────────
/**
 * Generate a concise summary of the provided text.  Uses the underlying
 * language model with a summarisation prompt and respects cache settings.
 *
 * @param {string} text - The text to summarise.
 * @param {Object} [options] - Options controlling summarisation.
 * @param {number} [options.maxWords=100] - Maximum number of words to return.
 * @param {boolean} [options.returnApologyOnError=true] - Whether to catch errors and return an apology.
 * @param {number} [options.retries] - Number of retry rounds.
 * @param {number} [options.backoffMs] - Backoff interval in milliseconds.
 * @param {Array<string>} [options.models] - Ordered list of models to try.
 * @param {number} [options.temperature] - Optional sampling temperature.
 * @param {number} [options.topP] - Optional nucleus sampling probability.
 * @param {number} [options.maxTokens] - Optional maximum tokens.
 * @returns {Promise<{text: string}>} The summary result.
 */
export async function summarizeText(text, {
  maxWords = 100,
  returnApologyOnError = true,
  retries = 2,
  backoffMs = 600,
  // Use the Pro model first for summarization; fallback to Flash variants
  models = ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-1.5-flash'],
  temperature,
  topP,
  maxTokens
} = {}) {
  const prompt = `Summarize the following text in no more than ${maxWords} words. Focus on the main points and avoid unnecessary detail.\n\n` + text
  return askQuestion(prompt, { returnApologyOnError, retries, backoffMs, models, temperature, topP, maxTokens })
}

/**
 * Translate the provided text into the specified language using the AI.  The
 * function constructs a translation prompt and delegates to askQuestion.
 *
 * @param {string} text - The text to translate.
 * @param {string} language - Target language (e.g. "Spanish", "French").
 * @param {Object} [options] - Options controlling translation.
 * @param {boolean} [options.returnApologyOnError=true] - Whether to catch errors and return an apology.
 * @param {number} [options.retries] - Number of retry rounds.
 * @param {number} [options.backoffMs] - Backoff interval in milliseconds.
 * @param {Array<string>} [options.models] - Ordered list of models to try.
 * @param {number} [options.temperature] - Optional sampling temperature.
 * @param {number} [options.topP] - Optional nucleus sampling probability.
 * @param {number} [options.maxTokens] - Optional maximum tokens.
 * @returns {Promise<{text: string}>} The translation result.
 */
export async function translateText(text, language, {
  returnApologyOnError = true,
  retries = 2,
  backoffMs = 600,
  // Prefer Pro for translation; fallback to Flash variants
  models = ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-1.5-flash'],
  temperature,
  topP,
  maxTokens
} = {}) {
  const prompt = `Translate the following text into ${language}.\n\n` + text
  return askQuestion(prompt, { returnApologyOnError, retries, backoffMs, models, temperature, topP, maxTokens })
}

/**
 * Categorize or classify the given text.  If no categories are provided the
 * model will infer appropriate labels.  You can supply an array of
 * categories to constrain the classification.
 *
 * @param {string} text - The text to categorize.
 * @param {Object} [options] - Options controlling categorisation.
 * @param {Array<string>} [options.categories] - Optional list of categories to choose from.
 * @param {boolean} [options.returnApologyOnError=true] - Whether to catch errors and return an apology.
 * @param {number} [options.retries] - Number of retry rounds.
 * @param {number} [options.backoffMs] - Backoff interval in milliseconds.
 * @param {Array<string>} [options.models] - Ordered list of models to try.
 * @param {number} [options.temperature] - Optional sampling temperature.
 * @param {number} [options.topP] - Optional nucleus sampling probability.
 * @param {number} [options.maxTokens] - Optional maximum tokens.
 * @returns {Promise<{text: string}>} The categorization result.
 */
export async function categorizeText(text, {
  categories,
  returnApologyOnError = true,
  retries = 2,
  backoffMs = 600,
  // Use Pro by default for categorisation; fallback to Flash variants
  models = ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-1.5-flash'],
  temperature,
  topP,
  maxTokens
} = {}) {
  let prompt
  if (Array.isArray(categories) && categories.length > 0) {
    const categoryList = categories.join(', ')
    prompt = `Classify the following text into one of the predefined categories: ${categoryList}. If none match, suggest a suitable category.\n\n` + text
  } else {
    prompt = `Identify appropriate categories or topics for the following text.\n\n` + text
  }
  return askQuestion(prompt, { returnApologyOnError, retries, backoffMs, models, temperature, topP, maxTokens })
}
