// test/api-failures.test.js
//
// Verifies that the bot handles external API failures gracefully:
//   - AI (Gemini/OpenAI) timeouts and rejections → safeAskQuestion fallback
//   - Odds API failures → cached fallback or user-friendly error message
//   - Sports scores API failures → user-friendly error message
//
// All tests use dependency injection — no real network calls are made.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  safeAskQuestion,
  extractText,
  checkCooldown
} from '../src/utils/aiHelpers.js'

import { OddsApiError } from '../src/utils/sportsBetAPI.js'
import { createOddsCommandHandler } from '../src/handlers/sportsCommands.js'
import { createSportsScoresCommandHandler } from '../src/handlers/handlerFactories.js'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const silentLogger = { error: () => {}, warn: () => {}, info: () => {} }
const AI_FALLBACK = 'My AI brain buffered too long. Try again in a sec. \uD83D\uDE05'

// ─────────────────────────────────────────────────────────────────────────────
// extractText — pure function, no side effects
// ─────────────────────────────────────────────────────────────────────────────

test('extractText: null returns null', () => {
  assert.strictEqual(extractText(null), null)
})

test('extractText: undefined returns null', () => {
  assert.strictEqual(extractText(undefined), null)
})

test('extractText: string returns the string directly', () => {
  assert.strictEqual(extractText('hello world'), 'hello world')
})

test('extractText: object with .text returns .text', () => {
  assert.strictEqual(extractText({ text: 'from .text' }), 'from .text')
})

test('extractText: Gemini candidates structure returns nested text', () => {
  const geminiReply = {
    candidates: [{ content: { parts: [{ text: 'Gemini says hi.' }] } }]
  }
  assert.strictEqual(extractText(geminiReply), 'Gemini says hi.')
})

test('extractText: unrecognized object shape returns null', () => {
  assert.strictEqual(extractText({ foo: 'bar', baz: 42 }), null)
})

// ─────────────────────────────────────────────────────────────────────────────
// safeAskQuestion — AI timeout + failure guard
// ─────────────────────────────────────────────────────────────────────────────

test('safeAskQuestion: returns fallback when askFn times out', async () => {
  const neverResolves = () => new Promise(() => {})
  const result = await safeAskQuestion('prompt', neverResolves, silentLogger, { timeoutMs: 30 })
  assert.strictEqual(result, AI_FALLBACK)
})

test('safeAskQuestion: returns fallback when askFn rejects immediately', async () => {
  const alwaysFails = () => Promise.reject(new Error('UPSTREAM_DOWN'))
  const result = await safeAskQuestion('prompt', alwaysFails, silentLogger, { timeoutMs: 5000 })
  assert.strictEqual(result, AI_FALLBACK)
})

test('safeAskQuestion: returns fallback when askFn returns null', async () => {
  const returnsNull = () => Promise.resolve(null)
  const result = await safeAskQuestion('prompt', returnsNull, silentLogger, { timeoutMs: 5000 })
  assert.strictEqual(result, AI_FALLBACK)
})

test('safeAskQuestion: returns fallback when askFn returns empty string', async () => {
  const returnsEmpty = () => Promise.resolve('')
  const result = await safeAskQuestion('prompt', returnsEmpty, silentLogger, { timeoutMs: 5000 })
  assert.strictEqual(result, AI_FALLBACK)
})

test('safeAskQuestion: returns trimmed text on success', async () => {
  const askFn = () => Promise.resolve('  The answer.  ')
  const result = await safeAskQuestion('prompt', askFn, silentLogger, { timeoutMs: 5000 })
  assert.strictEqual(result, 'The answer.')
})

test('safeAskQuestion: unwraps .text from object response', async () => {
  const askFn = () => Promise.resolve({ text: 'Wrapped answer.' })
  const result = await safeAskQuestion('prompt', askFn, silentLogger, { timeoutMs: 5000 })
  assert.strictEqual(result, 'Wrapped answer.')
})

test('safeAskQuestion: unwraps Gemini candidates structure', async () => {
  const askFn = () => Promise.resolve({
    candidates: [{ content: { parts: [{ text: 'Gemini says hello.' }] } }]
  })
  const result = await safeAskQuestion('prompt', askFn, silentLogger, { timeoutMs: 5000 })
  assert.strictEqual(result, 'Gemini says hello.')
})

test('safeAskQuestion: logs error on failure', async () => {
  const errors = []
  const logger = { error: (...args) => errors.push(args) }
  await safeAskQuestion('prompt', () => Promise.reject(new Error('BOOM')), logger, { timeoutMs: 5000 })
  assert.ok(errors.length > 0, 'expected an error to be logged')
  assert.match(String(errors[0][0]), /BOOM|AI/i)
})

test('safeAskQuestion: logs error on timeout', async () => {
  const errors = []
  const logger = { error: (...args) => errors.push(args) }
  await safeAskQuestion('prompt', () => new Promise(() => {}), logger, { timeoutMs: 30 })
  assert.ok(errors.length > 0, 'expected timeout to be logged')
})

// ─────────────────────────────────────────────────────────────────────────────
// checkCooldown — per-user rate limiting
// ─────────────────────────────────────────────────────────────────────────────

test('checkCooldown: first call returns ok:true', () => {
  const result = checkCooldown(`u-${Date.now()}`, 'aiMention', 60_000)
  assert.strictEqual(result.ok, true)
})

test('checkCooldown: second call within window returns ok:false with remainingMs', () => {
  const uuid = `u-cd-${Date.now()}`
  checkCooldown(uuid, 'aiMention', 60_000)
  const result = checkCooldown(uuid, 'aiMention', 60_000)
  assert.strictEqual(result.ok, false)
  assert.ok(typeof result.remainingMs === 'number')
  assert.ok(result.remainingMs > 0 && result.remainingMs <= 60_000)
})

test('checkCooldown: different keys are tracked independently', () => {
  const uuid = `u-ns-${Date.now()}`
  checkCooldown(uuid, 'key-a', 60_000)
  const result = checkCooldown(uuid, 'key-b', 60_000)
  assert.strictEqual(result.ok, true)
})

test('checkCooldown: missing arguments return ok:true (no-op)', () => {
  assert.strictEqual(checkCooldown(null, 'key', 60_000).ok, true)
  assert.strictEqual(checkCooldown('uuid', null, 60_000).ok, true)
  assert.strictEqual(checkCooldown('uuid', 'key', 0).ok, true)
})

// ─────────────────────────────────────────────────────────────────────────────
// Odds API — graceful degradation via createOddsCommandHandler
// ─────────────────────────────────────────────────────────────────────────────

test('Odds API: posts error when fetch fails and no cache available', async () => {
  const posted = []
  const handler = createOddsCommandHandler({
    postMessage: async (msg) => posted.push(msg),
    fetchOddsForSport: async () => { throw new Error('Network timeout') },
    saveOddsForSport: async () => {},
    getOddsForSport: async () => [],
    formatOddsMessage: () => 'board',
    defaultSportAlias: 'mlb'
  })

  await handler({ payload: { message: '/odds mlb', sender: 'user-1' }, room: 'room-1' })

  assert.ok(posted.length > 0, 'expected a message to be posted')
  assert.ok(typeof posted[0].message === 'string')
  assert.match(posted[0].message, /mlb|odds|wrong|sorry/i)
})

test('Odds API: falls back to cached board when live fetch fails', async () => {
  const posted = []
  const fakeCached = [{ homeTeam: 'TeamA', awayTeam: 'TeamB' }]

  const handler = createOddsCommandHandler({
    postMessage: async (msg) => posted.push(msg),
    fetchOddsForSport: async () => { throw new Error('API down') },
    saveOddsForSport: async () => {},
    getOddsForSport: async () => fakeCached,
    formatOddsMessage: (data) => `Board: ${data.length} game(s)`,
    defaultSportAlias: 'nfl'
  })

  await handler({ payload: { message: '/odds nfl', sender: 'user-1' }, room: 'room-1' })

  assert.ok(posted.length > 0)
  assert.match(posted[0].message, /board|game|last saved/i)
})

test('Odds API: shows 401-specific message for OddsApiError with status 401', async () => {
  const posted = []
  const handler = createOddsCommandHandler({
    postMessage: async (msg) => posted.push(msg),
    fetchOddsForSport: async () => {
      throw new OddsApiError('Unauthorized', { status: 401 })
    },
    saveOddsForSport: async () => {},
    getOddsForSport: async () => [],
    formatOddsMessage: () => '',
    defaultSportAlias: 'nba'
  })

  await handler({ payload: { message: '/odds nba', sender: 'user-1' }, room: 'room-1' })

  assert.ok(posted.length > 0)
  assert.match(posted[0].message, /401|unauthorized|ODDS_API_KEY/i)
})

test('Odds API: shows missing-key message for OddsApiError with key-missing message', async () => {
  const posted = []
  const handler = createOddsCommandHandler({
    postMessage: async (msg) => posted.push(msg),
    fetchOddsForSport: async () => {
      throw new OddsApiError('ODDS_API_KEY is missing.', { status: null })
    },
    saveOddsForSport: async () => {},
    getOddsForSport: async () => [],
    formatOddsMessage: () => '',
    defaultSportAlias: 'nhl'
  })

  await handler({ payload: { message: '/odds nhl', sender: 'user-1' }, room: 'room-1' })

  assert.ok(posted.length > 0)
  assert.match(posted[0].message, /ODDS_API_KEY|not configured/i)
})

test('Odds API: posts usage hint when sport alias is unrecognized', async () => {
  const posted = []
  const handler = createOddsCommandHandler({
    postMessage: async (msg) => posted.push(msg),
    fetchOddsForSport: async () => [],
    saveOddsForSport: async () => {},
    getOddsForSport: async () => [],
    formatOddsMessage: () => ''
  })

  await handler({ payload: { message: '/odds bloop', sender: 'user-1' }, room: 'room-1' })

  assert.ok(posted.length > 0)
  assert.match(posted[0].message, /usage|example/i)
})

// ─────────────────────────────────────────────────────────────────────────────
// Sports scores API — graceful degradation via createSportsScoresCommandHandler
// ─────────────────────────────────────────────────────────────────────────────

test('Sports scores: posts error message when fetch fails', async () => {
  const posted = []
  const handler = createSportsScoresCommandHandler({
    postMessage: async (msg) => posted.push(msg),
    getScores: async () => { throw new Error('Scores API timeout') },
    commandName: 'MLB',
    errorTag: 'mlb'
  })

  await handler({ payload: { message: '/mlb', sender: 'user-1' }, room: 'room-1' })

  assert.ok(posted.length > 0, 'expected a message after fetch failure')
  assert.match(posted[0].message, /error|mlb|try again/i)
})

test('Sports scores: posts the response string on success', async () => {
  const posted = []
  const handler = createSportsScoresCommandHandler({
    postMessage: async (msg) => posted.push(msg),
    getScores: async () => 'MLB scores: TeamA 5 - TeamB 3',
    commandName: 'MLB',
    errorTag: 'mlb'
  })

  await handler({ payload: { message: '/mlb', sender: 'user-1' }, room: 'room-1' })

  assert.ok(posted.length > 0)
  assert.match(posted[0].message, /TeamA|TeamB|scores/i)
})

test('Sports scores: NHL variant posts error message when fetch fails', async () => {
  const posted = []
  const handler = createSportsScoresCommandHandler({
    postMessage: async (msg) => posted.push(msg),
    getScores: async () => { throw new Error('NHL API unreachable') },
    commandName: 'NHL',
    errorTag: 'nhl'
  })

  await handler({ payload: { message: '/nhl', sender: 'user-1' }, room: 'room-1' })

  assert.ok(posted.length > 0)
  assert.match(posted[0].message, /error|nhl|try again/i)
})
