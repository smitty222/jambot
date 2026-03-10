import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveDispatchCommand } from '../src/handlers/commandRouting.js'
import { parseSportsBetArgs } from '../src/handlers/sportsCommands.js'
import {
  parseReviewRating,
  parseAlbumReviewRating
} from '../src/handlers/musicReviewCommands.js'

test('resolveDispatchCommand returns null for non-commands', () => {
  assert.equal(resolveDispatchCommand('hello world'), null)
  assert.equal(resolveDispatchCommand(''), null)
})

test('resolveDispatchCommand keeps standard slash commands intact', () => {
  const resolved = resolveDispatchCommand('/slots 250', new Set(['slots']))

  assert.deepEqual(resolved, {
    parts: ['slots', '250'],
    rawCmd: 'slots',
    cmd: 'slots',
    args: '250'
  })
})

test('resolveDispatchCommand normalizes inline /review ratings', () => {
  const commands = new Set(['review', 'songreview', 'albumreview'])

  assert.equal(resolveDispatchCommand('/review7.5', commands)?.cmd, 'review')
  assert.equal(resolveDispatchCommand('/songreview8', commands)?.cmd, 'songreview')
  assert.equal(resolveDispatchCommand('/albumreview9.5', commands)?.cmd, 'albumreview')
})

test('resolveDispatchCommand preserves unknown commands when no alias applies', () => {
  const resolved = resolveDispatchCommand('/totallyunknown arg', new Set(['review']))

  assert.equal(resolved?.cmd, 'totallyunknown')
  assert.equal(resolved?.args, 'arg')
})

test('resolveDispatchCommand keeps avatar aliases routable as explicit commands', () => {
  const commands = new Set(['recordguy', 'jukeboxguy', 'vibeguy', 'dumbdumb', 'botalien1', 'addavatar', 'q+', 'q-'])

  assert.equal(resolveDispatchCommand('/recordguy', commands)?.cmd, 'recordguy')
  assert.equal(resolveDispatchCommand('/jukeboxguy', commands)?.cmd, 'jukeboxguy')
  assert.equal(resolveDispatchCommand('/vibeguy', commands)?.cmd, 'vibeguy')
  assert.equal(resolveDispatchCommand('/dumbdumb', commands)?.cmd, 'dumbdumb')
  assert.equal(resolveDispatchCommand('/botalien1', commands)?.cmd, 'botalien1')
  assert.equal(resolveDispatchCommand('/addavatar custom', commands)?.cmd, 'addavatar')
  assert.equal(resolveDispatchCommand('/q+', commands)?.cmd, 'q+')
  assert.equal(resolveDispatchCommand('/q-', commands)?.cmd, 'q-')
})

test('resolveDispatchCommand prefers explicit commands over prefix aliases', () => {
  const commands = new Set(['review', 'reviewhelp', 'songreview', 'songreviewhelp', 'albumreview', 'blackjack', 'bj', 'join', 'bet', 'hit'])

  assert.equal(resolveDispatchCommand('/reviewhelp', commands)?.cmd, 'reviewhelp')
  assert.equal(resolveDispatchCommand('/songreviewhelp', commands)?.cmd, 'songreviewhelp')
  assert.equal(resolveDispatchCommand('/blackjack table', commands)?.cmd, 'blackjack')
  assert.equal(resolveDispatchCommand('/bj join', commands)?.cmd, 'bj')
  assert.equal(resolveDispatchCommand('/join', commands)?.cmd, 'join')
  assert.equal(resolveDispatchCommand('/bet 50', commands)?.cmd, 'bet')
  assert.equal(resolveDispatchCommand('/hit', commands)?.cmd, 'hit')
})

test('parseSportsBetArgs parses a valid sports bet command', () => {
  const parsed = parseSportsBetArgs('/sportsbet mlb 2 NYY ml 50')

  assert.deepEqual(parsed, {
    ok: true,
    sportAlias: 'mlb',
    sport: 'baseball_mlb',
    index: 1,
    team: 'NYY',
    betType: 'ml',
    amount: 50
  })
})

test('parseSportsBetArgs parses a valid ncaab sports bet command', () => {
  const parsed = parseSportsBetArgs('/sportsbet ncaab 3 duke ml 20')

  assert.deepEqual(parsed, {
    ok: true,
    sportAlias: 'ncaab',
    sport: 'basketball_ncaab',
    index: 2,
    team: 'duke',
    betType: 'ml',
    amount: 20
  })
})

test('parseSportsBetArgs rejects unsupported sports and invalid amounts', () => {
  assert.deepEqual(parseSportsBetArgs('/sportsbet soccer 2 MIA ml 50'), {
    ok: false,
    reason: 'sport'
  })

  assert.deepEqual(parseSportsBetArgs('/sportsbet mlb 2 NYY ml nope'), {
    ok: false,
    reason: 'args'
  })

  assert.deepEqual(parseSportsBetArgs('/sportsbet mlb'), {
    ok: false,
    reason: 'usage'
  })
})

test('parseReviewRating accepts inline and spaced song review formats', () => {
  assert.equal(parseReviewRating('review', '/review 7.5'), 7.5)
  assert.equal(parseReviewRating('review', '/review7.5'), 7.5)
  assert.equal(parseReviewRating('songreview', '/songreview 10'), 10)
  assert.equal(parseReviewRating('songreview', '/songreview8.2'), 8.2)
})

test('parseReviewRating rejects out-of-range and malformed ratings', () => {
  assert.ok(Number.isNaN(parseReviewRating('review', '/review 0')))
  assert.ok(Number.isNaN(parseReviewRating('review', '/review 11')))
  assert.ok(Number.isNaN(parseReviewRating('review', '/review seven')))
})

test('parseAlbumReviewRating accepts album review formats used by the dispatcher', () => {
  assert.equal(parseAlbumReviewRating('/albumreview 8.5'), 8.5)
  assert.equal(parseAlbumReviewRating('/albumreview9'), 9)
})

test('parseAlbumReviewRating rejects invalid album ratings', () => {
  assert.ok(Number.isNaN(parseAlbumReviewRating('/albumreview 0')))
  assert.ok(Number.isNaN(parseAlbumReviewRating('/albumreview nope')))
})
