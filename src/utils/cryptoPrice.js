// src/utils/cryptoPrice.js
//
// Provides helper functions for fetching spot prices of crypto assets from
// CoinGecko with a small in‑memory cache to reduce API calls. By default
// prices are requested in USD. When a coin alias is used (e.g. 'btc' instead
// of 'bitcoin'), the alias is resolved via a built‑in mapping. Calls to
// CoinGecko are rate‑limited; caching avoids hitting their public limits.

const PRICE_TTL_MS = 30_000 // 30 seconds
const priceCache = new Map() // coinId → { price: Number, ts: Number }

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
  usdt: 'tether',
  tether: 'tether',
  usdc: 'usd-coin',
  'usd-coin': 'usd-coin'
}

// Resolve an input symbol or id to a CoinGecko id. Returns null when the
// symbol is unknown. The lookup is case‑insensitive and trims whitespace.
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
    if (cached) {
      return cached.price
    }
    throw err
  }
}