// src/utils/cryptoPrice.js
//
// Provides helper functions for fetching spot prices of crypto assets from
// CoinGecko with a small in-memory cache to reduce API calls. By default
// prices are requested in USD. When a coin alias is used (e.g. 'btc' instead
// of 'bitcoin'), the alias is resolved via a built-in mapping. Calls to
// CoinGecko are rate-limited; caching avoids hitting their public limits.

const PRICE_TTL_MS = 30_000 // 30 seconds
const LIST_TTL_MS = 60_000  // 60 seconds for "top" & "trending" lists

const priceCache = new Map() // coinId → { price: Number, ts: Number }

// Small caches for list endpoints
const topCache = { ts: 0, data: null }       // { ts, data: Array }
const trendingCache = { ts: 0, data: null }  // { ts, data: Array }

// Known aliases. Feel free to extend this object with more symbols as your
// community requests them. Keys and values should be lowercase.
export const COIN_ALIASES = {
  btc: 'bitcoin',
  bitcoin: 'bitcoin',
  eth: 'ethereum',
  ethereum: 'ethereum',
  sol: 'solana',
  solana: 'solana',
  doge: 'dogecoin',
  dogecoin: 'dogecoin',
  ada: 'cardano',
  cardano: 'cardano',
  matic: 'matic-network',
  polygon: 'matic-network',
  maticnetwork: 'matic-network',
  xrp: 'ripple',
  ripple: 'ripple',
  pepe: 'pepe',
  xmr: 'monero',
  dash: 'dash'
}

// Resolve an input symbol or id to a CoinGecko id. Returns null when the
// symbol is unknown. The lookup is case-insensitive and trims whitespace.
export function resolveCoinId (input) {
  if (!input) return null
  const key = String(input).trim().toLowerCase()
  return COIN_ALIASES[key] || null
}

// Fetch the current price for a given CoinGecko id. Uses a simple cache to
// avoid redundant requests. When the API request fails the last cached value
// is returned (if any). Throws when no price is available at all.
export async function getCryptoPrice (coinId) {
  const now = Date.now()
  const cached = priceCache.get(coinId)
  if (cached && now - cached.ts < PRICE_TTL_MS) {
    return cached.price
  }

  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=usd`

  try {
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`CoinGecko responded with status ${res.status}`)
    }
    const data = await res.json()
    const price = data?.[coinId]?.usd
    if (typeof price !== 'number') {
      throw new Error('Price not available')
    }
    priceCache.set(coinId, { price, ts: now })
    return price
  } catch (err) {
    // If we have a cached price (even stale) return it; otherwise rethrow
    if (cached) return cached.price
    throw err
  }
}

// Fetch top coins by market cap (default 10).
// Returns array of objects with: id, symbol, name, current_price, market_cap, market_cap_rank, price_change_percentage_24h, total_volume
export async function getTopCoins ({ limit = 10 } = {}) {
  const now = Date.now()
  if (topCache.data && now - topCache.ts < LIST_TTL_MS) {
    return topCache.data.slice(0, limit)
  }

  const perPage = Math.max(1, Math.min(250, Number(limit) || 10))
  const url =
    `https://api.coingecko.com/api/v3/coins/markets` +
    `?vs_currency=usd` +
    `&order=market_cap_desc` +
    `&per_page=${perPage}` +
    `&page=1` +
    `&sparkline=false` +
    `&price_change_percentage=24h`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`CoinGecko responded with status ${res.status}`)
  const data = await res.json()
  if (!Array.isArray(data)) throw new Error('Unexpected response for top coins')

  topCache.ts = now
  topCache.data = data

  return data.slice(0, perPage)
}

// Fetch trending coins.
// CoinGecko returns a list of "coin" items with metadata.
// Returns array of: id, symbol, name, market_cap_rank, score
export async function getTrendingCoins ({ limit = 10 } = {}) {
  const now = Date.now()
  if (trendingCache.data && now - trendingCache.ts < LIST_TTL_MS) {
    return trendingCache.data.slice(0, limit)
  }

  const url = `https://api.coingecko.com/api/v3/search/trending`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`CoinGecko responded with status ${res.status}`)
  const data = await res.json()

  const coins = data?.coins
  if (!Array.isArray(coins)) throw new Error('Unexpected response for trending coins')

  const normalized = coins
    .map((entry) => {
      const item = entry?.item || {}
      return {
        id: item.id,
        symbol: item.symbol,
        name: item.name,
        market_cap_rank: item.market_cap_rank ?? null,
        score: entry?.score ?? null
      }
    })
    .filter(x => x && x.id && x.symbol && x.name)

  trendingCache.ts = now
  trendingCache.data = normalized

  return normalized.slice(0, Math.max(1, Number(limit) || 10))
}
