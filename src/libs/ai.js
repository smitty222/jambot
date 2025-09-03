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
// Text generation with retries
// ───────────────────────────────────────────────────────────
async function generateTextWithRetries(prompt, {
  models = ['gemini-2.5-flash', 'gemini-1.5-flash'],
  retries = 2,
  backoffMs = 600
} = {}) {
  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    for (const modelName of models) {
      try {
        // Log the prompt once per (model, attempt)
        info('[text request]', { model: modelName, attempt })
        debug('[prompt]', { length: String(prompt || '').length })
        console.log('[AI][PROMPT]', preview(prompt)) // explicit line so it shows even at info

        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
        const model = genAI.getGenerativeModel({ model: modelName })

        const res = await model.generateContent(String(prompt))
        const text = res?.response?.text?.() || ''
        const out = (text || '').trim()

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
        // try next model; then back off before next outer attempt
      }
    }
    if (attempt < retries) {
      await new Promise(r => setTimeout(r, backoffMs * (attempt + 1)))
    }
  }
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
    models = ['gemini-2.5-flash', 'gemini-1.5-flash'],
  } = opts

  // Replace "this song" with actual details if available
  if (typeof question === 'string' && question.toLowerCase().includes('this song')) {
    const before = question
    question = replaceThisSong(question)
    if (before !== question) info('[replaceThisSong]', { applied: true })
  }

  // Detect image-style prompts
  const isImagePrompt = /(draw|generate.*image|make.*picture|create.*image|illustrate|show.*image|show.*picture|design|render|make art|generate.*visual)/i.test(String(question))
  if (isImagePrompt) {
    info('[image request] detected')
    const result = await generateImage(String(question))
    if (result.imageBase64) {
      const filePath = `./generated_${Date.now()}.png`
      try {
        fs.writeFileSync(filePath, Buffer.from(result.imageBase64, 'base64'))
        info('[image saved]', { path: filePath })
        return { text: result.text, imagePath: filePath }
      } catch (e) {
        console.error('[AI Image save error]', e)
        return { text: result.text }
      }
    }
    return { text: result.text }
  }

  // Text requests
  try {
    const text = await generateTextWithRetries(String(question), { models, retries, backoffMs })
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
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${GEMINI_API_KEY}`
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
    return { text: outputText || 'Here’s your image!', imageBase64: base64Image }
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
