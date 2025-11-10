// src/utils/networking.js
// Use the native fetch implementation provided by modern versions of Node.js.
// Avoid a hard dependency on node-fetch so that unit tests can run without
// installing external packages.  When run in environments like browsers or
// older Node versions without fetch, set global.fetch yourself or install
// node-fetch as a dependency.
const fetch = globalThis.fetch
import https from 'https'
import http from 'http'

/**
 * Tunables (override via env if you want)
 */
const NET_MAX_SOCKETS = Number(process.env.NET_MAX_SOCKETS ?? 50)
const NET_TIMEOUT_MS = Number(process.env.NET_TIMEOUT_MS ?? 10000) // per-attempt timeout
const NET_RETRIES = Number(process.env.NET_RETRIES ?? 2) // extra attempts (total attempts = 1 + NET_RETRIES)
const NET_BACKOFF_MS = Number(process.env.NET_BACKOFF_MS ?? 300) // base backoff
const ACCEPT_ENCODING = 'gzip,deflate,br'

const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: NET_MAX_SOCKETS })
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: NET_MAX_SOCKETS })

const IDEMPOTENT = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Build a URL from host + path segments + optional search params.
 * `searchParams` may be an array of [key, value] or a plain object.
 */
export const buildUrl = (host, paths = [], searchParams, protocol = 'https') => {
  const url = new URL(paths.join('/'), `${protocol}://${host}`)
  if (searchParams) {
    const params = new URLSearchParams(searchParams)
    url.search = params.toString()
  }
  return url
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const jitter = (ms) => Math.floor(ms * (0.75 + Math.random() * 0.5))

const isRetryableStatus = (s) =>
  s === 408 || s === 429 || (s >= 500 && s !== 501 && s !== 505)

const parseRetryAfter = (hdr) => {
  if (!hdr) return null
  const secs = Number(hdr)
  if (Number.isFinite(secs)) return secs * 1000
  // HTTP-date fallback is rare; ignore for simplicity
  return null
}

const isRetryableError = (err) => {
  const code = err && (err.code || err.name)
  return (
    code === 'AbortError' ||
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'EAI_AGAIN' ||
    code === 'ENOTFOUND' ||
    code === 'ETIMEDOUT' ||
    code === 'EPIPE'
  )
}

const pickAgent = (urlObj) => (urlObj.protocol === 'http:' ? httpAgent : httpsAgent)

const mergeHeaders = (a = {}, b = {}) => {
  // Lowercase merge preserving later overrides
  const out = {}
  for (const [k, v] of Object.entries(a)) out[k.toLowerCase()] = v
  for (const [k, v] of Object.entries(b)) out[k.toLowerCase()] = v
  return out
}

/**
 * makeRequest(url, options?, extraHeaders?)
 *
 * - Automatic keep-alive agents
 * - Per-attempt timeout (AbortController)
 * - Safe retries for idempotent methods (GET/HEAD/OPTIONS) on 408/429/5xx and common network errors
 * - Gzip/deflate/br enabled
 * - Returns { ok, status, data, error }
 */
export const makeRequest = async (url, options = {}, extraHeaders = {}) => {
  const urlObj = url instanceof URL ? url : new URL(String(url))
  const method = String(options.method || 'GET').toUpperCase()

  // Build final headers (caller options.headers wins over extraHeaders)
  const baseHeaders = {
    accept: 'application/json, text/plain;q=0.8, */*;q=0.5',
    'accept-encoding': ACCEPT_ENCODING
  }

  // Only set content-type if caller didn't specify and a string body is present
  const hasBody = typeof options.body === 'string' || Buffer.isBuffer(options.body)
  if (hasBody && !('content-type' in mergeHeaders(extraHeaders, options.headers || {}))) {
    baseHeaders['content-type'] = 'application/json'
  }

  const headers = mergeHeaders(baseHeaders, mergeHeaders(extraHeaders, options.headers || {}))

  const totalAttempts = 1 + Number(options.retries ?? NET_RETRIES)
  const perAttemptTimeout = Number(options.timeout ?? NET_TIMEOUT_MS)

  let lastError = null

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), perAttemptTimeout)

    try {
      const res = await fetch(urlObj.href, {
        ...options,
        headers,
        // Node-fetch uses the agent to decide keep-alive; choose based on protocol
        agent: options.agent || pickAgent(urlObj),
        signal: controller.signal,
        compress: true
      })

      // Parse body (json → text fallback)
      const ct = (res.headers.get('content-type') || '').toLowerCase()
      let data
      if (ct.includes('application/json') || ct.endsWith('+json')) {
        try {
          data = await res.json()
        } catch {
          // fall back to text if json parse fails
          data = await res.text()
        }
      } else if (method === 'HEAD' || res.status === 204) {
        data = null
      } else {
        data = await res.text()
      }

      if (res.ok) {
        clearTimeout(timer)
        return { ok: true, status: res.status, data, error: null }
      }

      // Maybe retry on retryable HTTP status (idempotent only unless opt-in)
      const canRetry =
        (options.retryNonIdempotent === true || IDEMPOTENT.has(method)) &&
        isRetryableStatus(res.status) &&
        attempt < totalAttempts - 1

      if (!canRetry) {
        clearTimeout(timer)
        return { ok: false, status: res.status, data, error: (data && data.message) || res.statusText }
      }

      // Honor Retry-After if present (429/503)
      const ra = parseRetryAfter(res.headers.get('retry-after'))
      const backoff = ra ?? jitter(NET_BACKOFF_MS * Math.pow(2, attempt))
      clearTimeout(timer)
      await sleep(backoff)
      continue
    } catch (err) {
      clearTimeout(timer)
      lastError = err

      const canRetry =
        (options.retryNonIdempotent === true || IDEMPOTENT.has(method)) &&
        isRetryableError(err) &&
        attempt < totalAttempts - 1

      if (!canRetry) {
        const msg = err && (err.message || String(err))
        return { ok: false, status: 0, data: null, error: msg }
      }

      const backoff = jitter(NET_BACKOFF_MS * Math.pow(2, attempt))
      await sleep(backoff)
      continue
    }
  }

  // Exhausted attempts
  const msg = lastError && (lastError.message || String(lastError)) || 'Request failed'
  return { ok: false, status: 0, data: null, error: msg }
}
