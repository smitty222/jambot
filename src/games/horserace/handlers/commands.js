// src/games/horserace/handlers/commands.js
// Updated horse race command handlers with bot-only race support, improved visual
// presentation, fair odds, and realistic bot names. If no owners enter a horse,
// house horses automatically fill the field, and the race continues as normal.

import { postMessage } from '../../../libs/cometchat.js'
import { getUserWallet, removeFromUserWallet } from '../../../database/dbwalletmanager.js'
import { getUserNickname } from '../../../utils/nickname.js'
import { getAllHorses, getUserHorses } from '../../../database/dbhorses.js'
import { fetchCurrentUsers } from '../../../utils/API.js'

import { bus, safeCall } from '../service.js'
import { runRace, LEGS } from '../simulation.js'
import { getCurrentOdds, formatOdds } from '../utils/odds.js'
import { renderProgress, renderRacecard } from '../utils/progress.js'

const ROOM = process.env.ROOM_UUID

// ── Display tuning ─────────────────────────────────────────────────────
const BAR_STYLE = 'solid' // continuous track
const BAR_CELLS = 12 // width of the progress bar
const NAME_WIDTH = 24
const TV_MODE = true
const PHOTO_SUSPENSE_MS = 2500

// Ticks inside the solid rail
const TICKS_EVERY = 3
const TICK_CHAR = ':'

// ── SILKS (colored “jerseys”) ─────────────────────────────────────────
// Provide a palette of colored square emojis so each horse (user-owned or bot)
// gets a distinct jersey. We cycle through this list for races with more than
// the available colors.
const SILKS = [
  '🟥', // red
  '🟧', // orange
  '🟨', // yellow
  '🟩', // green
  '🟦', // blue
  '🟪', // purple
  '🟫', // brown
  '⬛', // black
  '⬜', // white
  '🔶', // orange diamond
  '🔷', // blue diamond
  '🟣'  // violet
]
const silk = (i) => SILKS[i % SILKS.length]

// ── Bot name generator ────────────────────────────────────────────────
const HORSE_ADJECTIVES = [
  'Swift', 'Wild', 'Silent', 'Midnight', 'Golden', 'Thundering', 'Rapid',
  'Lucky', 'Brave', 'Majestic', 'Fierce', 'Clever', 'Mighty', 'Noble',
  'Radiant', 'Bold', 'Starry', 'Daring', 'Gallant', 'Vibrant'
]
const HORSE_NOUNS = [
  'Spirit', 'Dream', 'Storm', 'Fire', 'Wind', 'Comet', 'Rocket', 'Shadow',
  'Blaze', 'Surge', 'Flash', 'Thunder', 'Whisper', 'Blitz', 'Mirage',
  'Avalanche', 'Echo', 'Aurora', 'Falcon', 'Phantom'
]

function generateHorseName (usedNames) {
  for (let attempts = 0; attempts < 20; attempts++) {
    const adj = HORSE_ADJECTIVES[Math.floor(Math.random() * HORSE_ADJECTIVES.length)]
    const noun = HORSE_NOUNS[Math.floor(Math.random() * HORSE_NOUNS.length)]
    const name = `${adj} ${noun}`
    if (!usedNames.has(name)) return name
  }
  let base = `${HORSE_ADJECTIVES[0]} ${HORSE_NOUNS[0]}`
  let suffix = 1
  let unique = base
  while (usedNames.has(unique)) unique = `${base} ${suffix++}`
  return unique
}

// ── Race flow timing ───────────────────────────────────────────────────
const ENTRY_MS = 30_000
const BET_MS = 45_000

// ── Suspense / pacing ──────────────────────────────────────────────────
const DELAY = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const RESULTS_PACING = {
  preResultBeatMs: 900,                 // after finish gif
  photoFinishBeatMs: PHOTO_SUSPENSE_MS, // if tight margin
  officialBeatMs: 1100,                 // before announcing winner
  standingsBeatMs: 900,                 // before posting final standings card
  payoutLineBeatMs: 700,                // between payout lines (per-user)
  ownerBonusBeatMs: 900                 // before owner bonus line
}

// ── Post-time countdown ────────────────────────────────────────────────
async function postCountdown (n = 5) {
  for (let i = n; i >= 1; i--) {
    await postMessage({ room: ROOM, message: `⏱️ Post time in ${i}…` })
    await new Promise(r => setTimeout(r, 800))
  }
  await postMessage({ room: ROOM, message: ' *And they’re off!*' })
}

// Career limit heuristics (used by /myhorses).
const TIER_RETIRE_LIMIT = { champion: 50, elite: 40, pro: 30, rookie: 25, amateur: 20, default: 25 }
function careerLimitFor (h) {
  if (Number.isFinite(h?.careerLength)) return Number(h.careerLength)
  if (Number.isFinite(h?.careerLimit)) return Number(h?.careerLimit)
  const t = String(h?.tier || '').toLowerCase()
  for (const key of Object.keys(TIER_RETIRE_LIMIT)) {
    if (key !== 'default' && t.includes(key)) return TIER_RETIRE_LIMIT[key]
  }
  return TIER_RETIRE_LIMIT.default
}

// ── State ──────────────────────────────────────────────────────────────
let isAcceptingEntries = false
let isBettingOpen = false
let isRaceRunning = false

const entered = new Set()
let horses = []
let horseBets = {} // userId -> [{horseIndex, amount}]

// ── Public API ─────────────────────────────────────────────────────────
export function isWaitingForEntries () { return isAcceptingEntries === true }

export async function startHorseRace () {
  // Guard against overlap
  if (isAcceptingEntries || isBettingOpen || isRaceRunning) {
    await safeCall(postMessage, [{ room: ROOM, message: '⛔ A horse race is already in progress.' }])
    return
  }

  // reset state
  isAcceptingEntries = true
  isBettingOpen = false
  isRaceRunning = false
  entered.clear()
  horses = []
  horseBets = {}

  await safeCall(postMessage, [{
    room: ROOM,
    message: ` HORSE RACE STARTING! Type your horse’s exact name in the next ${ENTRY_MS / 1000}s to enter.`
  }])

  const all = await safeCall(getAllHorses)
  const activeIds = await safeCall(fetchCurrentUsers).catch(() => [])
  const avail = all.filter(h => activeIds.includes(h.ownerId) && !h.retired && h.ownerId !== 'allen')

  if (avail.length) {
    const byTier = avail.reduce((acc, h) => {
      const t = h.tier || 'Unrated'
      ;(acc[t] ||= []).push(h)
      return acc
    }, {})
    const tiers = Object.keys(byTier).sort()
    const lines = []
    for (const t of tiers) {
      lines.push(`**${t}**`)
      for (const h of byTier[t]) {
        const nick = await safeCall(getUserNickname, [h.ownerId]).catch(() => '@owner')
        lines.push(`- ${h.emoji || ''} ${h.name} (by ${nick?.replace(/^@/, '') || 'Unknown'})`)
      }
    }
    const listMsg = ['Available horses by tier:', ...lines].join('\n')
    await safeCall(postMessage, [{ room: ROOM, message: '```\n' + listMsg + '\n```' }])
  } else {
    await safeCall(postMessage, [{ room: ROOM, message: '⚠️ No user horses detected online — bots may fill the field.' }])
  }

  setTimeout(openBetsPhase, ENTRY_MS)
}

export async function handleHorseEntryAttempt (ctx) {
  if (!isAcceptingEntries) return

  const txt = String(ctx.message || '').trim()
  const sender = ctx.sender
  const all = await safeCall(getAllHorses)

  const match = all.find(h =>
    !h.retired &&
    h.ownerId &&
    h.ownerId !== 'allen' &&
    h.name.toLowerCase() === txt.toLowerCase()
  )
  if (!match) return
  if (entered.has(match.name)) return

  entered.add(match.name)
  const nick = await safeCall(getUserNickname, [sender]).catch(() => '@user')
  await safeCall(postMessage, [{
    room: ROOM,
    message: `✅ ${nick?.replace(/^@/, '')} entered **${match.name}**!`
  }])
}

export async function handleHorseBet (ctx) {
  if (!isBettingOpen) return

  const txt = String(ctx.message || '')
  const sender = ctx.sender
  const m = txt.match(/^\/horse\s*(\d+)\s+(\d+)\b/i)
  if (!m) return

  const idx = parseInt(m[1], 10) - 1
  const amt = parseInt(m[2], 10)
  if (Number.isNaN(idx) || Number.isNaN(amt) || amt <= 0 || idx < 0 || idx >= horses.length) return

  const balance = await safeCall(getUserWallet, [sender])
  const nick = await safeCall(getUserNickname, [sender]).catch(() => '@user')
  if (balance < amt) {
    await safeCall(postMessage, [{ room: ROOM, message: `${nick}, insufficient funds: $${balance}.` }])
    return
  }

  await safeCall(removeFromUserWallet, [sender, amt])
  ;(horseBets[sender] ||= []).push({ horseIndex: idx, amount: amt })

  const h = horses[idx]
  await safeCall(postMessage, [{
    room: ROOM,
    message: `${nick} bets $${amt} on #${idx + 1} **${h.name}**! `
  }])
}

// ── Flow helpers ───────────────────────────────────────────────────────
async function openBetsPhase () {
  try {
    isAcceptingEntries = false

    const all = await safeCall(getAllHorses)
    const ownerHorses = all.filter(h => entered.has(h.name))

    if (ownerHorses.length === 0) {
      await safeCall(postMessage, [{ room: ROOM, message: '⚠️ No owners entered; house horses take the field!' }])
    } else {
      const entryNames = ownerHorses.map(h => `${h.emoji || ''} ${h.name}`.trim()).join(', ')
      await safeCall(postMessage, [{ room: ROOM, message: `✅ Entries closed! Participants: ${entryNames}.` }])
    }

    const need = Math.max(0, 6 - ownerHorses.length)

    let bots = all
      .filter(h => (!h.ownerId || h.ownerId === 'allen') && !h.retired)
      .sort((a, b) => (b.baseOdds || 0) - (a.baseOdds || 0))

    if (bots.length < need) {
      const fillerCount = need - bots.length
      const existingNames = new Set(all.map(h => h.name))
      for (const h of bots) existingNames.add(h.name)
      for (const h of ownerHorses) existingNames.add(h.name)

      for (let i = 0; i < fillerCount; i++) {
        const uniqueName = generateHorseName(existingNames)
        existingNames.add(uniqueName)
        const baseOdds = 2.0 + Math.random() * 5.0
        const vol = 1.2 + Math.random() * 0.8

        bots.push({
          id: null,
          name: uniqueName,
          baseOdds: parseFloat(baseOdds.toFixed(1)),
          volatility: parseFloat(vol.toFixed(2)),
          wins: 0,
          racesParticipated: 0,
          careerLength: 0,
          owner: 'House',
          ownerId: null,
          tier: 'bot',
          emoji: '',
          price: 0,
          retired: false
        })
      }
    }

    bots = bots.slice(0, need)

    horses = [...ownerHorses, ...bots].map(h => ({
      ...h,
      odds: getCurrentOdds(h)
    }))

    if (!horses.length) {
      await safeCall(postMessage, [{ room: ROOM, message: '❌ No eligible horses. Race canceled.' }])
      cleanup()
      return
    }

    const entries = horses.map((h, i) => ({
      index: i,
      name: `${silk(i)} ${h.name}`,
      odds: formatOdds(h.odds, 'fraction')
    }))

    const card = renderRacecard(entries, { nameWidth: 24, oddsWidth: 6 })

    await safeCall(postMessage, [{
      room: ROOM,
      message: [
        '** Post parade — today’s field & odds**',
        '```',
        card,
        '```',
        `Place your bets using /horse <number> <amount> (for example, /horse 2 50) in the next ${BET_MS / 1000}s.`
      ].join('\n')
    }])

    isBettingOpen = true

    setTimeout(() => {
      if (isBettingOpen) {
        safeCall(postMessage, [{
          room: ROOM,
          message: `⌛ Halfway to post! Place your bet now using /horse <number> <amount> (e.g., /horse 1 25).`
        }])
      }
    }, BET_MS / 2)

    setTimeout(() => {
      isBettingOpen = false
      startRunPhase()
    }, BET_MS)
  } catch (err) {
    console.error('[openBetsPhase] error:', err)
    await safeCall(postMessage, [{ room: ROOM, message: '❌ Couldn’t open betting.' }])
    cleanup()
  }
}

// ── GIF helpers ────────────────────────────────────────────────────────
const GIFS_ENABLED = String(process.env.HORSE_RACE_GIFS ?? '1') !== '0'

const RACE_GIFS = {
  start: [
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExY2o1c2M5amVzNnd0ZHY5bzRmNDFvNXZlZXNvNHMzcmFlNXprdmZ5NyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/SuI4fzUBQzG1H1kEtI/giphy.gif'
  ],
  finish: [
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExMGpwbGVpNHp4ZmV3dDRrOWJ4cWhpcDQ5YWw2Mm1qM2l4ZWZ6cm45MSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/iD7jBggMvtFQ5BdNpV/giphy.gif'
  ]
}

function pickRandom (arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null
  return arr[Math.floor(Math.random() * arr.length)]
}

async function postGif (type) {
  if (!GIFS_ENABLED) return
  const url = pickRandom(RACE_GIFS[type])
  if (!url) return
  // Correct CometChat format for GIF posting
  await safeCall(postMessage, [{ room: ROOM, message: '', images: [url] }])
}

async function startRunPhase () {
  try {
    isRaceRunning = true

    await postGif('start')
    await postCountdown(5)
    await runRace({ horses, horseBets })
  } catch (err) {
    console.error('[startRunPhase] error:', err)
    await safeCall(postMessage, [{ room: ROOM, message: '❌ Race failed to start.' }])
    cleanup()
  }
}

function cleanup () {
  isAcceptingEntries = false
  isBettingOpen = false
  isRaceRunning = false
  entered.clear()
  horses = []
  horseBets = {}
}

// ── TV commentary helpers ──────────────────────────────────────────────
function rankOrder (raceState) {
  return raceState.map((h, i) => ({ i, p: h.progress }))
    .sort((a, b) => b.p - a.p).map(x => x.i)
}

function blocks (progress, finishDistance, barCells = BAR_CELLS) {
  const pct = Math.max(0, Math.min(1, progress / (finishDistance || 1)))
  return Math.round(pct * barCells)
}

function phaseName (legIdx) {
  return ['Break', 'Backstretch', 'Far Turn', 'Stretch'][legIdx] || `Leg ${legIdx + 1}`
}

function pickDifferent (prev, choices) {
  const pool = choices.filter(l => l && l !== prev)
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : (choices[0] || '')
}

function makeTurnCommentary (legIndex, raceState, prevState, finishDistance, prevLine) {
  const order = rankOrder(raceState)
  const leader = raceState[order[0]]
  const second = raceState[order[1]]
  const phase = phaseName(legIndex)
  const late = (legIndex === LEGS - 1)

  if (!prevState) {
    return pickDifferent(prevLine, [
      `️ Clean **Break** — **${leader.name}** shows speed; **${second.name}** keeps tabs.`,
      `️ They spring away — **${leader.name}** quick into stride.`
    ])
  }

  const prevOrder = rankOrder(prevState)
  const leadGap = blocks(leader.progress - second.progress, finishDistance)

  const options = []
  if (leadGap <= 1) {
    options.push(
      `️ ${phase}: Bunched up — anyone’s race.`,
      `️ ${phase}: Wall of horses — looking for room.`
    )
  }
  if (late) {
    // IMPORTANT: last-leg commentary should NOT declare "photo finish" / winner.
    // Keep it as tension-only; official result comes in raceFinished.
    options.push(
      `️ Down the **Stretch** — **${leader.name}** digs in, **${second.name}** charging!`,
      `️ Final strides — they’re all out!`
    )
  }
  if (prevOrder[0] !== order[0]) {
    options.push(`️ New leader! **${leader.name}** takes command.`)
  }
  if (!options.length) {
    options.push(`️ ${phase}: **${leader.name}** controls; **${second.name}** poised.`)
  }
  return pickDifferent(prevLine, options)
}

function makeFinalCommentary (raceState, winnerIdx, finishDistance) {
  const order = rankOrder(raceState)
  const winner = raceState[winnerIdx]
  const runnerUp = raceState[order[0] === winnerIdx ? order[1] : order[0]]
  const margin = blocks(winner.progress - runnerUp.progress, finishDistance)

  if (margin <= 1) return ` Photo finish! **${winner.name}** noses out **${runnerUp.name}** at the wire.`
  if (margin <= 3) return ` **${winner.name}** holds off **${runnerUp.name}** late.`
  return ` Dominant — **${winner.name}** powers clear in the final strides.`
}

// ── Event rendering ────────────────────────────────────────────────────
let _lastFrame = null
let _lastLine = ''

bus.on('turn', async ({ turnIndex, raceState, finishDistance }) => {
  const MIN_CELL_CHANGE = 1 / (finishDistance * BAR_CELLS)
  const prev = _lastFrame?.raceState
  const changed = raceState.some(
    (h, i) => Math.abs((h.progress ?? 0) - (prev?.[i]?.progress ?? 0)) >= MIN_CELL_CHANGE
  )
  if (!changed && (turnIndex % 2 !== 0)) return

  const displayState = raceState.map((h, i) => ({ ...h, name: `${silk(i)} ${h.name}` }))

  const track = renderProgress(displayState, {
    barLength: BAR_CELLS,
    finishDistance,
    style: BAR_STYLE,
    ticksEvery: TICKS_EVERY,
    tickChar: TICK_CHAR,
    nameWidth: NAME_WIDTH
  })

  // IMPORTANT: never use makeFinalCommentary here; it can emit "Photo finish!".
  // Official winner commentary belongs ONLY in raceFinished.
  const comment = makeTurnCommentary(turnIndex, raceState, _lastFrame?.raceState, finishDistance, _lastLine)

  _lastFrame = { raceState, finishDistance }
  _lastLine = comment

  if (TV_MODE) {
    await postMessage({ room: ROOM, message: [
      '```',
      ` Leg ${turnIndex + 1} of ${LEGS}`,
      track,
      '```',
      comment
    ].join('\n') })
  }
})

// Show final standings and payouts when the race ends
bus.on('raceFinished', async ({ winnerIdx, raceState, payouts, ownerBonus, finishDistance }) => {
  try {
    await postGif('finish')

    await DELAY(RESULTS_PACING.preResultBeatMs)
    await safeCall(postMessage, [{ room: ROOM, message: '🏁 They hit the wire…' }])

    const displayState = raceState.map((h, i) => ({ ...h, name: `${silk(i)} ${h.name}` }))

    const track = renderProgress(displayState, {
      barLength: BAR_CELLS,
      finishDistance,
      winnerIndex: winnerIdx,
      style: BAR_STYLE,
      ticksEvery: TICKS_EVERY,
      tickChar: TICK_CHAR,
      nameWidth: NAME_WIDTH
    })

    const order = rankOrder(raceState)
    const winner = raceState[winnerIdx]
    const runnerUpIdx = (order[0] === winnerIdx) ? order[1] : order[0]
    const runnerUp = raceState[runnerUpIdx]
    const margin = blocks((winner?.progress ?? 0) - (runnerUp?.progress ?? 0), finishDistance)
    const isPhotoFinish = margin <= 1

    // Beat 2: suspense line (ONLY line that says “photo finish”)
    if (isPhotoFinish) {
      await DELAY(RESULTS_PACING.photoFinishBeatMs)
      await safeCall(postMessage, [{ room: ROOM, message: '📸 Photo finish… waiting on the judges…' }])
    }

    // Commentary: avoid repeating "Photo finish!" after the judges line.
    let comment = makeFinalCommentary(raceState, winnerIdx, finishDistance)
    if (isPhotoFinish) {
      comment = ` **${winner.name}** gets the nod over **${runnerUp.name}**!`
    }

    try {
      const oddsNum = Number(horses?.[winnerIdx]?.odds || 0)
      if (oddsNum >= 5) comment = `😱 Upset! ${comment.trim()}`
    } catch (_) {}

    await DELAY(RESULTS_PACING.officialBeatMs)

    const winnerDisplayName = displayState[winnerIdx]?.name || `${silk(winnerIdx)} ${raceState[winnerIdx]?.name || ''}`
    await safeCall(postMessage, [{
      room: ROOM,
      message: `✅ **Official:** WINNER — **${winnerDisplayName}**!`
    }])

    await DELAY(RESULTS_PACING.standingsBeatMs)
    await safeCall(postMessage, [{
      room: ROOM,
      message: [
        '```',
        ' Final Standings',
        track,
        '```',
        comment
      ].join('\n')
    }])

    const payoutEntries = payouts && typeof payouts === 'object'
      ? Object.entries(payouts).filter(([, amount]) => Number(amount) > 0)
      : []

    if (payoutEntries.length > 0) {
      await DELAY(RESULTS_PACING.payoutLineBeatMs)
      for (const [userId, amount] of payoutEntries) {
        const nick = await safeCall(getUserNickname, [userId]).catch(() => null)
        const name = nick?.replace(/^@/, '') || `<@uid:${userId}>`
        await safeCall(postMessage, [{ room: ROOM, message: `💵 ${name} wins **$${amount}**` }])
        await DELAY(RESULTS_PACING.payoutLineBeatMs)
      }
    }

    if (ownerBonus && ownerBonus.ownerId && ownerBonus.amount) {
      await DELAY(RESULTS_PACING.ownerBonusBeatMs)
      const nick = await safeCall(getUserNickname, [ownerBonus.ownerId]).catch(() => null)
      const name = nick?.replace(/^@/, '') || `<@uid:${ownerBonus.ownerId}>`
      await safeCall(postMessage, [{
        room: ROOM,
        message: `🎉 ${name} receives an owner bonus of **$${ownerBonus.amount}**`
      }])
    }
  } catch (err) {
    console.error('[raceFinished] error:', err)
    await safeCall(postMessage, [{ room: ROOM, message: '❌ Error displaying race results.' }])
  } finally {
    cleanup()
  }
})

// ── Misc helpers ───────────────────────────────────────────────────────
function _fmtPct (w, r) {
  const wins = Number(w || 0)
  const races = Number(r || 0)
  if (!races) return '0%'
  return Math.round((wins / races) * 100) + '%'
}
function _fmtOdds (h) { return formatOdds(getCurrentOdds(h)) }
function _fmtLine (h, idx = null) {
  const tag = (idx != null) ? `${String(idx + 1).padStart(2, ' ')}.` : '•'
  const races = Number(h?.racesParticipated || 0)
  const wins = Number(h?.wins || 0)
  const pct = _fmtPct(wins, races)
  const retired = h?.retired ? ' (retired)' : ''
  const tier = h?.tier ? ` [${String(h.tier).toUpperCase()}]` : ''
  const limit = careerLimitFor(h)
  const raceInfo = Number.isFinite(limit) ? `${races}/${limit}` : `${races}`
  return `${tag} ${h.name}${retired}${tier} — Odds ${_fmtOdds(h)} · Races ${raceInfo} · Wins ${wins} (${pct})`
}

export async function handleMyHorsesCommand (ctx) {
  const userId = ctx?.sender || ctx?.userId || ctx?.uid
  const nick = await getUserNickname(userId)
  const mine = await getUserHorses(userId)
  if (!mine || mine.length === 0) {
    await postMessage({ room: ROOM, message: `${nick}, you don’t own any horses yet. Use **/buyhorse <tier>** to get started.` })
    return
  }

  const arranged = mine.slice().sort((a, b) => {
    const aw = Number(a?.wins || 0)
    const bw = Number(b?.wins || 0)
    if (bw !== aw) return bw - aw
    const ap = (Number(a?.wins || 0) / Math.max(1, Number(a?.racesParticipated || 0)))
    const bp = (Number(b?.wins || 0) / Math.max(1, Number(b?.racesParticipated || 0)))
    return bp - ap
  })

  const lines = arranged.map((h, i) => _fmtLine(h, i))
  const header = ` **${nick}’s Stable** (${arranged.length})`
  const body = ['```', header, ...lines, '```'].join('\n')
  await postMessage({ room: ROOM, message: body })
}

export async function handleHorseStatsCommand (ctx) {
  const room = ctx?.room || ROOM
  const text = String(ctx?.message || '').trim()
  // FIX: this should be \s not \\s
  const nameArg = (text.match(/^\/horsestats\s+(.+)/i) || [])[1]

  const all = await getAllHorses()
  const horsesList = Array.isArray(all) ? all : []

  if (!nameArg) {
    const topWins = horsesList.slice()
      .sort((a, b) => Number(b?.wins || 0) - Number(a?.wins || 0))
      .slice(0, 10)

    const topPct = horsesList.slice()
      .filter(h => Number(h?.racesParticipated || 0) >= 5)
      .sort((a, b) => {
        const ap = Number(a?.wins || 0) / Math.max(1, Number(a?.racesParticipated || 0))
        const bp = Number(b?.wins || 0) / Math.max(1, Number(b?.racesParticipated || 0))
        return bp - ap
      })
      .slice(0, 10)

    const linesWins = topWins.map((h, i) => _fmtLine(h, i))
    const linesPct = topPct.map((h, i) => _fmtLine(h, i))

    const msg = [
      ' **Horse Stats**',
      '',
      ' Top Wins',
      ...linesWins,
      '',
      ' Best Win% (min 5 starts)',
      ...linesPct
    ].join('\n')

    await postMessage({ room, message: '```\n' + msg + '\n```' })
    return
  }

  const needle = nameArg.toLowerCase()
  const match = horsesList.find(h => String(h?.name || '').toLowerCase() === needle) ||
                 horsesList.find(h => String(h?.name || '').toLowerCase().includes(needle))

  if (!match) {
    await postMessage({ room, message: `❗ Couldn’t find a horse named **${nameArg}**.` })
    return
  }

  const races = Number(match?.racesParticipated || 0)
  const wins = Number(match?.wins || 0)
  const pct = _fmtPct(wins, races)
  const owner = match?.ownerId ? `<@uid:${match.ownerId}>` : 'House'

  const limit = careerLimitFor(match)
  const left = Number.isFinite(limit) ? Math.max(limit - races, 0) : null

  const details = [
    ` **${match.name}**` + (match.retired ? ' (retired)' : ''),
    `Owner: ${owner}`,
    `Tier: ${String(match?.tier || '').toUpperCase() || '—'}`,
    `Odds (current): ${_fmtOdds(match)}`,
    `Record: ${wins} wins from ${races} starts (${pct})`,
    Number.isFinite(limit)
      ? `Career limit: ${limit} · Races left: ${left}`
      : 'Career limit: —',
    `Base odds: ${match?.baseOdds ?? '—'} · Volatility: ${match?.volatility ?? '—'}`
  ].join('\n')

  await postMessage({ room, message: '```\n' + details + '\n```' })
}

export async function handleTopHorsesCommand (ctx) {
  const room = ctx?.room || ROOM
  const all = await getAllHorses()
  const list = Array.isArray(all) ? all : []

  const allenIds = String(process.env.ALLEN_USER_IDS || process.env.CHAT_USER_ID || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  const userHorses = list.filter(h => {
    const owner = h?.ownerId
    if (!owner) return false
    return !allenIds.includes(String(owner))
  })

  if (userHorses.length === 0) {
    await postMessage({ room, message: '```\nNo user-owned horses found yet.\n```' })
    return
  }

  const top = userHorses.slice()
    .sort((a, b) => {
      const dw = Number(b?.wins || 0) - Number(a?.wins || 0)
      if (dw) return dw
      const ap = Number(a?.wins || 0) / Math.max(1, Number(a?.racesParticipated || 0))
      const bp = Number(b?.wins || 0) / Math.max(1, Number(b?.racesParticipated || 0))
      return bp - ap
    })
    .slice(0, 10)

  const lines = top.map((h, i) => _fmtLine(h, i))
  await postMessage({ room, message: '```\n' + [' Top Horses by Wins', ...lines].join('\n') + '\n```' })
}

// ── Help command ─────────────────────────────────────────────────────────
export async function handleHorseHelpCommand (ctx) {
  const room = ctx?.room || ROOM
  const helpLines = [
    ' **Horse Race Commands**',
    '',
    '/buyhorse <tier> – Purchase a new horse. Tiers include champion, elite, pro, rookie and amateur.',
    '/myhorses – List your owned horses with their race counts, wins and career limits.',
    '/horsestats [name] – Show detailed stats for a specific horse by name, or view leaderboards when no name is given.',
    '/tophorses – See the top user-owned horses ranked by wins and win percentage.',
    '/horse <number> <amount> – Place a bet on a horse during the betting phase (use the number shown on the race card).',
    '/horsehelp – Display this help message.',
    '',
    'Note: Horses have a finite career limit assigned when purchased. Once a horse reaches this limit, it will automatically retire and cannot enter new races.'
  ]
  await postMessage({ room, message: '```\n' + helpLines.join('\n') + '\n```' })
}
