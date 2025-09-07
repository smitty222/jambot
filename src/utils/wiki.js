// src/utils/wiki.js
import { makeRequest } from './networking.js'

const WIKI_LANG = process.env.WIKI_LANG || 'en'
const WIKI_TIMEOUT_MS = Number(process.env.WIKI_TIMEOUT_MS || 2500)
const LOG_LEVEL = (process.env.LOG_LEVEL || 'error').toLowerCase()
const isDebug = LOG_LEVEL === 'debug'
const d = (...a) => { if (isDebug) console.debug('[WIKI]', ...a) }

function host (lang) {
  return `${lang || WIKI_LANG}.wikipedia.org`
}

async function wikiGet (url, { timeoutMs = WIKI_TIMEOUT_MS, signal } = {}) {
  const res = await makeRequest(url, {
    headers: { accept: 'application/json' },
    timeoutMs,
    signal
  })
  return res
}

function pickSongResult (results = [], title, artist) {
  if (!results.length) return null
  const tLow = String(title || '').toLowerCase()
  const aLow = String(artist || '').toLowerCase()
  const score = (it) => {
    const s = String(it?.title || '').toLowerCase()
    let sc = 0
    if (s.includes('(song)')) sc += 4
    if (s.includes('(single)')) sc += 3
    if (tLow && s.includes(tLow)) sc += 2
    if (aLow && s.includes(aLow)) sc += 1
    return sc
  }
  const sorted = [...results].sort((x, y) => score(y) - score(x))
  return sorted[0]
}

export async function getSongSummaryFromWikipedia ({ title, artist, lang = WIKI_LANG, signal } = {}) {
  if (!title) return null
  // Search for the page
  const q = `${title} ${artist || ''} song`.trim()
  const searchUrl = `https://${host(lang)}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=5&format=json`
  const s = await wikiGet(searchUrl, { signal })
  if (!s.ok) return null
  const hits = s.data?.query?.search || []
  const best = pickSongResult(hits, title, artist) || hits[0]
  if (!best?.title) return null

  // Summary via REST endpoint (follows redirects)
  const sumUrl = `https://${host(lang)}/api/rest_v1/page/summary/${encodeURIComponent(best.title)}`
  const r = await wikiGet(sumUrl, { signal })
  if (!r.ok) return null

  const extract = String(r.data?.extract || '').trim()
  if (!extract) return null
  const pageUrl = r.data?.content_urls?.desktop?.page || null

  // Prefer first complete sentence; fallback to whole extract
  const sentence = extract.split(/(?<=\.)\s/)[0] || extract
  return { title: best.title, extract: sentence, url: pageUrl }
}
