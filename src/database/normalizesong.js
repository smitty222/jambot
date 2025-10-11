// Utility functions for normalizing song titles and artist names. These
// helpers are used to generate a canonical form of a track and to
// perform lightweight fuzzy comparisons between strings. The goal is
// to eliminate common sources of duplication across platforms (e.g.
// differences in punctuation, casing, remix tags, etc.).

/* eslint-disable no-control-regex */

// Remove diacritics (accents) from characters. This converts
// characters like "é" to "e" so that accented and unaccented
// versions of a title are treated the same.
function stripAccents (s) {
  return s
    ? s.normalize('NFD').replace(/\p{Diacritic}+/gu, '')
    : ''
}

// Collapse multiple spaces and trim leading/trailing whitespace.
function normalizeSpaces (s) {
  return s.replace(/\s+/g, ' ').trim()
}

// Standardise the representation of featured artists. Various
// spellings such as "feat.", "ft.", "featuring" are reduced to
// "feat" to aid deduplication.
function canonicalizeFeat (s) {
  return s.replace(/\b(feat\.?|ft\.?|featuring)\b/gi, 'feat')
}

// Remove parenthetical or bracketed metadata from a title, such as
// "(Live)", "(Remastered 2011)", "[Radio Edit]". These often vary
// across releases but do not materially change the song identity.
function removeParenMeta (s) {
  return s.replace(/[\(\[][^)\]]*[\)\]]/g, ' ')
}

// Remove trailing metadata after a dash if it looks like a remix or
// version tag. For example, "Song - Remastered" will drop the
// "Remastered" suffix. If the portion after the dash does not match
// known tags, it is left intact.
const DEBLOAT_TAGS = [
  'remaster', 'remastered', 'mono', 'stereo', 'live', 'edit',
  'radio edit', 'clean', 'explicit', 'version', 'single version',
  'deluxe', 'bonus track', 'acoustic', 'demo', 'mix', 'club mix',
  'extended', 'original mix', 'feat', 'featuring', 'with'
]
function removeDashMeta (s) {
  const parts = s.split(/\s+-\s+/)
  if (parts.length === 1) return s
  const [base, ...rest] = parts
  const tail = rest.join(' - ').toLowerCase()
  if (DEBLOAT_TAGS.some(t => tail.includes(t))) return base
  return s
}

// Convert HTML-style quotes and ampersands into normalised forms.
function normalisePunctuation (s) {
  let out = s.replace(/&/g, ' and ')
  out = out.replace(/[’‘]/g, "'")
  out = out.replace(/[“”]/g, '"')
  // Remove all punctuation except apostrophes and quotes. This
  // includes characters like commas, periods, exclamation marks and
  // emojis. Keeping quotes allows us to distinguish songs like
  // "A Hard Day's Night" from "A Hard Days Night" if necessary.
  out = out.replace(/[^a-z0-9'"\s]/gi, ' ')
  return out
}

// Normalise a raw track title. Steps:
//   1. Convert to string and strip accents
//   2. Canonicalise "feat" style tokens
//   3. Remove parenthetical/bracketed metadata
//   4. Remove trailing dash metadata
//   5. Normalise punctuation
//   6. Convert to lowercase
//   7. Collapse whitespace
function normalizeTitle (raw) {
  if (!raw) return ''
  let s = String(raw)
  s = stripAccents(s)
  s = canonicalizeFeat(s)
  s = removeParenMeta(s)
  s = removeDashMeta(s)
  s = normalisePunctuation(s)
  s = s.toLowerCase()
  s = normalizeSpaces(s)
  return s
}

// Normalise an artist name. Similar to normalizeTitle but only
// preserves the primary artist when multiple artists are listed. This
// avoids merging songs across completely different artists while
// handling variants like "Artist & Another" and "Artist feat X".
function normalizeArtist (raw) {
  if (!raw) return ''
  let s = String(raw)
  s = stripAccents(s)
  s = canonicalizeFeat(s)
  s = s.replace(/&/g, ' and ')
  s = s.replace(/[’‘]/g, "'")
  s = s.replace(/[“”]/g, '"')
  s = s.toLowerCase()
  // Split on separators and take the primary artist
  const primary = s.split(/\s*(,|&| and |;| feat\b)\s*/g)[0] || s
  const cleaned = normalizeSpaces(primary)
  return cleaned
}

// Compute the Dice similarity between two strings based on bigrams.
// The similarity ranges from 0 (completely different) to 1 (exact
// match). This is a simple metric suitable for fuzzy matching of
// song titles.
function diceSimilarity (a, b) {
  // Early exit for empty strings
  if (!a && !b) return 1
  if (!a || !b) return 0
  const bigrams = str => {
    const arr = []
    for (let i = 0; i < str.length - 1; i++) arr.push(str.slice(i, i + 2))
    return arr
  }
  const A = new Map()
  for (const g of bigrams(a)) A.set(g, (A.get(g) || 0) + 1)
  const B = new Map()
  for (const g of bigrams(b)) B.set(g, (B.get(g) || 0) + 1)
  let intersect = 0
  for (const [g, countA] of A.entries()) {
    const countB = B.get(g)
    if (countB) intersect += Math.min(countA, countB)
  }
  const denom = Array.from(A.values()).reduce((t, x) => t + x, 0) +
                Array.from(B.values()).reduce((t, x) => t + x, 0)
  return denom ? (2 * intersect) / denom : 0
}

// Build a normalised key and components from a raw track and artist
// name. Returns an object with normArtist, normTrack and normKey.
// normKey is the concatenation of normArtist and normTrack with a
// pipe separator. If either component is empty, normKey will be
// null. This allows us to guard against rows lacking sufficient
// information.
export function buildNormKey (trackName, artistName) {
  const normTrack = normalizeTitle(trackName)
  const normArtist = normalizeArtist(artistName)
  const normKey = (normArtist && normTrack) ? `${normArtist}|${normTrack}` : null
  return { normArtist, normTrack, normKey }
}

// Determine whether two songs are a fuzzy match. We require the
// normalised artists to match exactly and the title similarity to
// exceed a threshold. The threshold (0.92) can be tuned to be more
// conservative or aggressive. A higher threshold reduces the chance
// of false positives (merging different songs) at the cost of fewer
// matches.
export function isFuzzyMatch (aTitle, bTitle, aArtist, bArtist) {
  const aNormArtist = normalizeArtist(aArtist)
  const bNormArtist = normalizeArtist(bArtist)
  if (!aNormArtist || aNormArtist !== bNormArtist) return false
  const aNormTitle = normalizeTitle(aTitle)
  const bNormTitle = normalizeTitle(bTitle)
  const score = diceSimilarity(aNormTitle, bNormTitle)
  return score >= 0.92
}

// Export helper functions for testing and reuse. Note: Only
// buildNormKey and isFuzzyMatch are intended as part of the public
// API; the other helpers remain internal but can be exported for
// testing if needed.
export const _internal = {
  stripAccents,
  normalizeSpaces,
  canonicalizeFeat,
  removeParenMeta,
  removeDashMeta,
  normalisePunctuation,
  normalizeTitle,
  normalizeArtist,
  diceSimilarity
}