// src/utils/pgaTourUnofficial.js
// ⚠️ Unofficial PGA Tour JSON scraper
// Source: statdata.pgatour.com (used by pgatour.com site)

const BASE = 'https://statdata.pgatour.com'

// small cache so chat spam doesn't hammer the site
const cache = new Map()

function cacheGet (key) {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() > hit.expires) {
    cache.delete(key)
    return null
  }
  return hit.value
}

function cacheSet (key, value, ttlMs) {
  cache.set(key, { value, expires: Date.now() + ttlMs })
}

export async function getTournamentLeaderboard (tournamentId) {
  if (!tournamentId) throw new Error('Missing tournamentId')

  const url = `${BASE}/r/${tournamentId}/leaderboard-v2.json`
  const cacheKey = `leaderboard:${tournamentId}`

  const cached = cacheGet(cacheKey)
  if (cached) return cached

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Jambot/1.0',
      'Accept': 'application/json'
    }
  })

  if (!res.ok) {
    throw new Error(`PGA Tour fetch failed (${res.status})`)
  }

  const json = await res.json()

  // basic sanity check
  if (!json?.leaderboard?.players) {
    throw new Error('Unexpected PGA Tour response format')
  }

  cacheSet(cacheKey, json, 30_000) // 30s cache
  return json
}
