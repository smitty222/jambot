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
// Provide a palette of colored square emojis so each horse (user‑owned or bot)
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

function buildSilkLegend (horses) {
  return horses.map((h, i) => `${String(i + 1).padStart(2, ' ')} ${silk(i)} ${h.name}`).join('\n')
}

// ── Bot name generator ────────────────────────────────────────────────
// To make bot horses feel more authentic, we generate names by randomly
// combining an adjective and a noun. These lists are curated with a
// race‑appropriate vibe.
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

/**
 * Generate a unique horse name not present in the given set.  Randomly
 * combines an adjective and noun until an unused combination is found.
 *
 * @param {Set<string>} usedNames A set of names already taken.
 * @returns {string} A unique horse name.
 */
function generateHorseName (usedNames) {
  // Try a few times to find a unique combination. In the unlikely event
  // of exhaustion, fall back to a timestamp.
  for (let attempts = 0; attempts < 20; attempts++) {
    const adj = HORSE_ADJECTIVES[Math.floor(Math.random() * HORSE_ADJECTIVES.length)]
    const noun = HORSE_NOUNS[Math.floor(Math.random() * HORSE_NOUNS.length)]
    const name = `${adj} ${noun}`
    if (!usedNames.has(name)) {
      return name
    }
  }
  // Fallback: ensure uniqueness by appending a number
  let base = `${HORSE_ADJECTIVES[0]} ${HORSE_NOUNS[0]}`
  let suffix = 1
  let unique = base
  while (usedNames.has(unique)) {
    unique = `${base} ${suffix++}`
  }
  return unique
}

// ── Race flow timing ───────────────────────────────────────────────────
const ENTRY_MS = 30_000
// Extended betting window to allow more time to wager
const BET_MS = 45_000

// ── Post-time countdown ────────────────────────────────────────────────
async function postCountdown (n = 5) {
  for (let i = n; i >= 1; i--) {
    await postMessage({ room: ROOM, message: `⏱️ Post time in ${i}…` })
    await new Promise(r => setTimeout(r, 800))
  }
  await postMessage({ room: ROOM, message: ' *And they’re off!*' })
}

// Career limit heuristics (used by /myhorses).  If a horse has a defined
// careerLength (assigned when purchased) use that; otherwise fall back
// to tier-based defaults.
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
const entered = new Set()
let horses = []
let horseBets = {} // userId -> [{horseIndex, amount}]

// ── Public API ─────────────────────────────────────────────────────────
export function isWaitingForEntries () { return isAcceptingEntries === true }

export async function startHorseRace () {
  // reset state
  isAcceptingEntries = true
  isBettingOpen = false
  entered.clear()
  horses = []
  horseBets = {}

  await safeCall(postMessage, [{
    room: ROOM,
    message: ` HORSE RACE STARTING! Type your horse’s exact name in the next ${ENTRY_MS / 1000}s to enter.`
  }])

  // show available online owner horses by tier
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
    // wrap in a code block for readability
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

    // Choose racers: entered owner horses + fill with bots up to 6.
    const all = await safeCall(getAllHorses)
    const ownerHorses = all.filter(h => entered.has(h.name))

    // If no owners entered a horse, we still proceed with a bot‑only field.
    // Notify the room that house horses will run the race.
    if (ownerHorses.length === 0) {
      await safeCall(postMessage, [{
        room: ROOM,
        message: '⚠️ No owners entered; house horses take the field!'
      }])
    } else {
      // Inform chat about the entries once the entry window closes. List the owner horses that made it in.
      const entryNames = ownerHorses.map(h => `${h.emoji || ''} ${h.name}`.trim()).join(', ')
      await safeCall(postMessage, [{ room: ROOM, message: `✅ Entries closed! Participants: ${entryNames}.` }])
    }

    const need = Math.max(0, 6 - ownerHorses.length)
    // Gather available house/bot horses from the database
    let bots = all
      .filter(h => (!h.ownerId || h.ownerId === 'allen') && !h.retired)
      .sort((a, b) => (b.baseOdds || 0) - (a.baseOdds || 0))
    // Generate additional bot horses if not enough are available to fill the field.
    if (bots.length < need) {
      const fillerCount = need - bots.length
      const existingNames = new Set(all.map(h => h.name))
      // Also include names of selected bots and owner horses so we don't duplicate.
      for (const h of bots) existingNames.add(h.name)
      for (const h of ownerHorses) existingNames.add(h.name)
      for (let i = 0; i < fillerCount; i++) {
        const uniqueName = generateHorseName(existingNames)
        existingNames.add(uniqueName)
        // Assign a realistic base odds between 2.0 and 7.0 (favored to longshot)
        const baseOdds = 2.0 + Math.random() * 5.0
        // Volatility influences how much odds swing; choose a mild random value
        const vol = 1.2 + Math.random() * 0.8 // 1.2–2.0
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
          emoji: '', // silks convey colour instead of emoji
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

    // Pre-race card: put the silk next to the horse name
    const entries = horses.map((h, i) => ({
      index: i,
      name: `${silk(i)} ${h.name}`, //  silk inline
      odds: formatOdds(h.odds, 'fraction')
    }))

    // widen name column slightly for emoji + name
    const card = renderRacecard(entries, { nameWidth: 24, oddsWidth: 6 })

    await safeCall(postMessage, [{
      room: ROOM,
      message: [
        '** Post parade — today’s field & odds**',
        '```',
        card,
        '```',
        // Inform players how to place bets with a concrete example.
        `Place your bets using /horse <number> <amount> (for example, /horse 2 50) in the next ${BET_MS / 1000}s.`
      ].join('\n')
    }])

    isBettingOpen = true
    // Send a mid-betting reminder halfway through the betting window to nudge players.
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
// Post a hype GIF by type. Turntable/CometChat will usually unfurl the URL.
// If you ever want to disable these, set HORSE_RACE_GIFS=0 in env.
const GIFS_ENABLED = String(process.env.HORSE_RACE_GIFS ?? '1') !== '0'

const RACE_GIFS = {
  start: [
    // replace/add URLs you like
    'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
    'https://media.giphy.com/media/3o7aD2saalBwwftBIY/giphy.gif'
  ],
  finish: [
    'https://media.giphy.com/media/3o6Zt481isNVuQI1l6/giphy.gif',
    'https://media.giphy.com/media/xT0GqFhyNd0Wmfo6sM/giphy.gif'
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
  // Posting the raw URL typically unfurls as a GIF preview
  await safeCall(postMessage, [{ room: ROOM, message: url }])
}


async function startRunPhase () {
  try {
    // Start GIF, then a proper post-time countdown + bell
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
    options.push(
      `️ Down the **Stretch** — **${leader.name}** digs in, **${second.name}** charging!`,
      `️ Final furlong — **${leader.name}** under pressure!`
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
  // Compute whether the frame changed enough to warrant a redraw.
  const MIN_CELL_CHANGE = 1 / (finishDistance * BAR_CELLS) // about 1 cell
  const prev = _lastFrame?.raceState
  const changed = raceState.some(
    (h, i) => Math.abs((h.progress ?? 0) - (prev?.[i]?.progress ?? 0)) >= MIN_CELL_CHANGE
  )
  if (!changed && (turnIndex % 2 !== 0)) return // skip every other low-change frame

  // Inject silks into displayed names (names only; progress is the same).
  const displayState = raceState.map((h, i) => ({ ...h, name: `${silk(i)} ${h.name}` }))

  const track = renderProgress(displayState, {
    barLength: BAR_CELLS,
    finishDistance,
    style: BAR_STYLE,
    ticksEvery: TICKS_EVERY,
    tickChar: TICK_CHAR,
    nameWidth: NAME_WIDTH
  })

  // Use commentary helpers to generate flavour text
  const comment = (turnIndex === LEGS - 1)
    ? makeFinalCommentary(raceState, rankOrder(raceState)[0], finishDistance)
    : makeTurnCommentary(turnIndex, raceState, _lastFrame?.raceState, finishDistance, _lastLine)

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
    // Emit a finish GIF for drama
    await postGif('finish')
    // Build a display with silks and the final positions
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
    // Compose final commentary line. If the winner had long odds, prefix an "Upset!" callout.
    let comment = makeFinalCommentary(raceState, winnerIdx, finishDistance)
    try {
      const oddsNum = Number(horses?.[winnerIdx]?.odds || 0)
      if (oddsNum >= 5) {
        comment = ` Upset! ${comment.trim()}`
      }
    } catch (_) {
      // ignore errors reading odds
    }
    // Build payout messages
    const payoutLines = []
    if (payouts && Object.keys(payouts).length > 0) {
      for (const [userId, amount] of Object.entries(payouts)) {
        if (!amount) continue
        const nick = await safeCall(getUserNickname, [userId]).catch(() => null)
        const name = nick?.replace(/^@/, '') || `<@uid:${userId}>`
        payoutLines.push(`💵 ${name} wins **$${amount}**`)
      }
    }
    let ownerLine = ''
    if (ownerBonus && ownerBonus.ownerId && ownerBonus.amount) {
      const nick = await safeCall(getUserNickname, [ownerBonus.ownerId]).catch(() => null)
      const name = nick?.replace(/^@/, '') || `<@uid:${ownerBonus.ownerId}>`
      ownerLine = `🎉 ${name} receives an owner bonus of **$${ownerBonus.amount}**`
    }
    const messages = [
      '```',
      ' Final Standings',
      track,
      '```',
      comment
    ]
    if (payoutLines.length > 0) {
      messages.push('', ...payoutLines)
    }
    if (ownerLine) {
      messages.push('', ownerLine)
    }
    await safeCall(postMessage, [{ room: ROOM, message: messages.join('\n') }])
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
  // Sort by wins desc, then win% desc
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
  const nameArg = (text.match(/^\/horsestats\\s+(.+)/i) || [])[1]

  const all = await getAllHorses()
  const horsesList = Array.isArray(all) ? all : []

  if (!nameArg) {
    // Leaderboards
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

  // Specific horse lookup (case-insensitive, supports partial)
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

  // Allen / house filters
  const allenIds = String(process.env.ALLEN_USER_IDS || process.env.CHAT_USER_ID || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  // Only user-owned horses (must have ownerId) and not owned by Allen/bot
  const userHorses = list.filter(h => {
    const owner = h?.ownerId
    if (!owner) return false // exclude house/no-owner
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
// Responds to `/horsehelp` with a summary of available horse race commands.
export async function handleHorseHelpCommand (ctx) {
  const room = ctx?.room || ROOM
  const helpLines = [
    ' **Horse Race Commands**',
    '',
    '/buyhorse <tier> – Purchase a new horse. Tiers include champion, elite, pro, rookie and amateur.',
    '/myhorses – List your owned horses with their race counts, wins and career limits.',
    '/horsestats [name] – Show detailed stats for a specific horse by name, or view leaderboards when no name is given.',
    '/tophorses – See the top user‑owned horses ranked by wins and win percentage.',
    '/horse <number> <amount> – Place a bet on a horse during the betting phase (use the number shown on the race card).',
    '/horsehelp – Display this help message.',
    '',
    'Note: Horses have a finite career limit assigned when purchased. Once a horse reaches this limit, it will automatically retire and cannot enter new races.'
  ]
  await postMessage({ room, message: '```\n' + helpLines.join('\n') + '\n```' })
}
