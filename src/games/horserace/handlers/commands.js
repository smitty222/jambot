// src/games/horserace/handlers/commands.js

import { postMessage } from '../../../libs/cometchat.js'
import { getUserWallet, debitGameBet } from '../../../database/dbwalletmanager.js'
import { getUserNickname } from '../../../utils/nickname.js'
import { getAllHorses, getUserHorses, setHorseImageUrl } from '../../../database/dbhorses.js'
import { fetchCurrentUsers } from '../../../utils/API.js'
import { pickHorseImageUrl } from '../utils/images.js'

import { bus, safeCall } from '../service.js'
import { runRace, LEGS } from '../simulation.js'
import { getCurrentOdds, lockToteBoardOdds } from '../utils/odds.js'
import { renderProgress, renderRacecard } from '../utils/progress.js'
import { getHofList, getHofEntryByHorseName } from '../../../database/dbhorsehof.js'

const ROOM = process.env.ROOM_UUID

// ── Display tuning ─────────────────────────────────────────────────────
const BAR_STYLE = 'solid' // continuous track
const BAR_CELLS = 12 // width of the progress bar
const NAME_WIDTH = 24
const TV_MODE = true
const PHOTO_SUSPENSE_MS = 2500
const HORSE_ENTRY_FEE_BY_TIER = {
  basic: Number(process.env.HORSE_ENTRY_FEE_BASIC ?? 150),
  elite: Number(process.env.HORSE_ENTRY_FEE_ELITE ?? 350),
  champion: Number(process.env.HORSE_ENTRY_FEE_CHAMPION ?? 700)
}

// Ticks inside the solid rail
const TICKS_EVERY = 3
const TICK_CHAR = ':'

// ── SILKS (colored “jerseys”) ─────────────────────────────────────────
// Squares only (consistent “silks” look).
const SILKS = [
  '🟥', // red
  '🟧', // orange
  '🟨', // yellow
  '🟩', // green
  '🟦', // blue
  '🟪', // purple
  '🟫', // brown
  '⬛', // black
  '⬜' // white
]
const silk = (i) => SILKS[i % SILKS.length]

async function ensurePersistentHorseImages (horsesList = []) {
  if (!Array.isArray(horsesList) || !horsesList.length) return horsesList

  for (const h of horsesList) {
    if (!h || h.imageUrl) continue
    if (!h.id) continue

    const tierKey = String(h.tier || '').toLowerCase()
    if (!tierKey || tierKey === 'bot') continue

    const imageUrl = pickHorseImageUrl(tierKey)
    if (!imageUrl) continue

    h.imageUrl = imageUrl
    await safeCall(setHorseImageUrl, [h.id, imageUrl]).catch(() => null)
  }

  return horsesList
}

function getHorseEntryFee (tierKey) {
  const key = String(tierKey || '').toLowerCase()
  const raw = Number(HORSE_ENTRY_FEE_BY_TIER[key] ?? HORSE_ENTRY_FEE_BY_TIER.basic)
  return Math.max(0, Math.floor(raw))
}

function shuffleArray (arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Bot name generator ────────────────────────────────────────────────
const HORSE_ADJECTIVES = [
  'Swift', 'Wild', 'Silent', 'Midnight', 'Golden', 'Thundering', 'Rapid',
  'Lucky', 'Brave', 'Majestic', 'Fierce', 'Clever', 'Mighty', 'Noble',
  'Radiant', 'Bold', 'Starry', 'Daring', 'Gallant', 'Vibrant', 'Iron',
  'Rugged', 'Grim', 'Dusty', 'Crimson'
]
const HORSE_NOUNS = [
  'Spirit', 'Dream', 'Storm', 'Fire', 'Wind', 'Comet', 'Rocket', 'Shadow',
  'Blaze', 'Surge', 'Flash', 'Thunder', 'Whisper', 'Blitz', 'Mirage',
  'Avalanche', 'Echo', 'Aurora', 'Falcon', 'Phantom', 'Ridge', 'Riot',
  'Ember', 'Breaker', 'Raven'
]

function generateHorseName (usedNames) {
  for (let attempts = 0; attempts < 20; attempts++) {
    const adj = HORSE_ADJECTIVES[Math.floor(Math.random() * HORSE_ADJECTIVES.length)]
    const noun = HORSE_NOUNS[Math.floor(Math.random() * HORSE_NOUNS.length)]
    const name = `${adj} ${noun}`
    if (!usedNames.has(name)) return name
  }
  const base = `${HORSE_ADJECTIVES[0]} ${HORSE_NOUNS[0]}`
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
  preResultBeatMs: 900, // after finish gif
  photoFinishBeatMs: PHOTO_SUSPENSE_MS, // if tight margin
  officialBeatMs: 1100, // before announcing winner
  standingsBeatMs: 900, // before posting final standings card
  payoutLineBeatMs: 700, // between payout lines (per-user)
  ownerBonusBeatMs: 900 // before owner bonus line
}

// ── Post-time countdown ────────────────────────────────────────────────
async function postCountdown (n = 5) {
  for (let i = n; i >= 1; i--) {
    await postMessage({ room: ROOM, message: `⏱️ Post time in ${i}…` })
    await new Promise((resolve) => setTimeout(resolve, 800))
  }
  await postMessage({ room: ROOM, message: '🏁 *And they’re off!*' })
}

// Career limit heuristics (used by /myhorses) — only used if careerLength absent.
const TIER_RETIRE_LIMIT = { champion: 50, elite: 40, basic: 30, default: 25 }
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
let raceSilks = []

// ✅ Eligible horses lookup for owner-only entry (no DB hits per message)
let eligibleByName = new Map() // nameLower -> horse

// ── Public API ─────────────────────────────────────────────────────────
export function isWaitingForEntries () { return isAcceptingEntries === true }

export async function startHorseRace () {
  if (isAcceptingEntries || isBettingOpen || isRaceRunning) {
    await safeCall(postMessage, [{ room: ROOM, message: '⛔ A horse race is already in progress.' }])
    return
  }

  isAcceptingEntries = true
  isBettingOpen = false
  isRaceRunning = false
  entered.clear()
  horses = []
  horseBets = {}
  eligibleByName = new Map()

  await safeCall(postMessage, [{
    room: ROOM,
    message:
      `🏇 HORSE RACE STARTING! Owners: type your horse’s exact name in the next ${ENTRY_MS / 1000}s to enter.\n` +
      `Entry fees: BASIC ${'$'}${getHorseEntryFee('basic')} · ELITE ${'$'}${getHorseEntryFee('elite')} · CHAMPION ${'$'}${getHorseEntryFee('champion')}`
  }])

  const all = await safeCall(getAllHorses)
  await ensurePersistentHorseImages(all)
  const activeIds = await safeCall(fetchCurrentUsers).catch(() => [])
  const avail = all.filter(h => activeIds.includes(h.ownerId) && !h.retired && h.ownerId !== 'allen')

  // ✅ Build eligibility map (only horses shown here can be entered)
  for (const h of avail) {
    eligibleByName.set(String(h.name || '').toLowerCase(), h)
  }

  if (avail.length) {
    // Group horses by tier
    const byTier = avail.reduce((acc, h) => {
      const key = String(h.tier || 'Unrated').toLowerCase()
      ;(acc[key] ||= []).push(h)
      return acc
    }, {})

    // Tier display order: champion -> elite -> basic -> everything else alphabetically
    const priority = ['champion', 'elite', 'basic']
    const tiers = Object.keys(byTier).sort((a, b) => {
      const ai = priority.indexOf(a)
      const bi = priority.indexOf(b)
      const ar = ai === -1 ? 999 : ai
      const br = bi === -1 ? 999 : bi
      if (ar !== br) return ar - br
      return a.localeCompare(b)
    })

    const tierTitle = (t) => {
      if (t === 'champion') return 'CHAMPION'
      if (t === 'elite') return 'ELITE'
      if (t === 'basic') return 'BASIC'
      if (t === 'unrated') return 'UNRATED'
      return t.toUpperCase()
    }

    const lines = []
    lines.push('AVAILABLE HORSES (owners only — type exact name to enter)')
    lines.push('')

    for (const t of tiers) {
      const list = byTier[t]
        .slice()
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))

      lines.push(`[${tierTitle(t)}] (${list.length})`)

      for (const h of list) {
        const nick = await safeCall(getUserNickname, [h.ownerId]).catch(() => null)
        const owner = (nick ? String(nick).replace(/^@/, '') : 'Unknown')
        const emoji = String(h.emoji || '').trim()
        const prefix = emoji ? `${emoji} ` : ''

        // ✅ Make the exact entry token explicit (avoid emoji copy/paste confusion)
        lines.push(`• ${prefix}${h.name} — ${owner}  (enter: ${h.name})`)
      }

      lines.push('') // blank line between tiers
    }

    await safeCall(postMessage, [{
      room: ROOM,
      message: '```' + '\n' + lines.join('\n').trimEnd() + '\n' + '```'
    }])
  } else {
    await safeCall(postMessage, [{ room: ROOM, message: '⚠️ No user horses detected online — bots may fill the field.' }])
  }

  setTimeout(openBetsPhase, ENTRY_MS)
}

export async function handleHorseEntryAttempt (ctx) {
  if (!isAcceptingEntries) return

  const sender = ctx.sender
  const txtRaw = String(ctx.message || '').trim()
  if (!txtRaw) return

  const key = txtRaw.toLowerCase()
  const match = eligibleByName.get(key)
  if (!match) return

  // ✅ Owner-only entry
  if (String(match.ownerId) !== String(sender)) return

  if (entered.has(match.name)) return

  const entryFee = getHorseEntryFee(match.tier)
  const balance = await safeCall(getUserWallet, [sender]).catch(() => null)
  if (typeof balance !== 'number' || balance < entryFee) {
    const nick = await safeCall(getUserNickname, [sender]).catch(() => '@user')
    await safeCall(postMessage, [{
      room: ROOM,
      message: `❗ ${nick?.replace(/^@/, '')} needs $${entryFee} to enter ${match.name}.`
    }])
    return
  }

  const paid = await safeCall(debitGameBet, [sender, entryFee, {
    source: 'horse_race',
    category: 'entry_fee',
    note: `${String(match.tier || 'basic').toUpperCase()} entry for ${match.name}`
  }]).catch(() => false)
  if (!paid) return

  entered.add(match.name)
  const nick = await safeCall(getUserNickname, [sender]).catch(() => '@user')
  await safeCall(postMessage, [{
    room: ROOM,
    message: `✅ ${nick?.replace(/^@/, '')} entered **${match.name}** for $${entryFee}!`
  }])
}

export async function handleHorseBet (ctx) {
  if (!isBettingOpen) return

  const txt = String(ctx.message || '').trim()
  const sender = ctx.sender
  const nick = await safeCall(getUserNickname, [sender]).catch(() => '@user')

  let slip = null
  let betLabel = ''

  const parseSingle = (re, type) => {
    const m = txt.match(re)
    if (!m) return null
    const idx = parseInt(m[1], 10) - 1
    const amt = parseInt(m[2], 10)
    if (Number.isNaN(idx) || Number.isNaN(amt) || amt <= 0 || idx < 0 || idx >= horses.length) return null
    return { slip: { type, horseIndex: idx, amount: amt }, amt, label: `${type.toUpperCase()} #${idx + 1}` }
  }

  const pWin = parseSingle(/^\/horse\s*(\d+)\s+(\d+)\b/i, 'win')
  const pPlace = parseSingle(/^\/place\s*(\d+)\s+(\d+)\b/i, 'place')
  const pShow = parseSingle(/^\/show\s*(\d+)\s+(\d+)\b/i, 'show')
  const parsedSingle = pWin || pPlace || pShow
  if (parsedSingle) {
    slip = parsedSingle.slip
    betLabel = parsedSingle.label
  } else {
    let m = txt.match(/^\/exacta\s+(\d+)\s*[-,/]\s*(\d+)\s+(\d+)\b/i) ||
            txt.match(/^\/exacta\s+(\d+)\s+(\d+)\s+(\d+)\b/i)
    if (m) {
      const first = parseInt(m[1], 10) - 1
      const second = parseInt(m[2], 10) - 1
      const amt = parseInt(m[3], 10)
      if (
        Number.isFinite(first) && Number.isFinite(second) && Number.isFinite(amt) &&
        amt > 0 && first >= 0 && second >= 0 &&
        first < horses.length && second < horses.length &&
        first !== second
      ) {
        slip = { type: 'exacta', firstIndex: first, secondIndex: second, amount: amt }
        betLabel = `EXACTA #${first + 1}-#${second + 1}`
      }
    }

    if (!slip) {
      m = txt.match(/^\/trifecta\s+(\d+)\s*[-,/]\s*(\d+)\s*[-,/]\s*(\d+)\s+(\d+)\b/i) ||
          txt.match(/^\/trifecta\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\b/i)
      if (m) {
        const a = parseInt(m[1], 10) - 1
        const b = parseInt(m[2], 10) - 1
        const c = parseInt(m[3], 10) - 1
        const amt = parseInt(m[4], 10)
        const uniq = new Set([a, b, c]).size === 3
        if (
          Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c) && Number.isFinite(amt) &&
          amt > 0 && a >= 0 && b >= 0 && c >= 0 &&
          a < horses.length && b < horses.length && c < horses.length &&
          uniq
        ) {
          slip = { type: 'trifecta', firstIndex: a, secondIndex: b, thirdIndex: c, amount: amt }
          betLabel = `TRIFECTA #${a + 1}-#${b + 1}-#${c + 1}`
        }
      }
    }
  }
  if (!slip) {
    await safeCall(postMessage, [{
      room: ROOM,
      message: `${nick}, invalid bet format.\n` +
        'Win: `/horse <#> <amt>` · Place: `/place <#> <amt>` · Show: `/show <#> <amt>`\n' +
        'Exacta: `/exacta <#>-<#> <amt>` · Trifecta: `/trifecta <#>-<#>-<#> <amt>`'
    }])
    return
  }

  const amt = Number(slip.amount || 0)
  const balance = await safeCall(getUserWallet, [sender])
  if (balance < amt) {
    await safeCall(postMessage, [{ room: ROOM, message: `${nick}, insufficient funds: $${balance}.` }])
    return
  }

  await safeCall(debitGameBet, [sender, amt, {
    source: 'horse_race',
    category: 'bet',
    note: betLabel
  }])
  ;(horseBets[sender] ||= []).push(slip)

  await safeCall(postMessage, [{
    room: ROOM,
    message: `${nick} bets $${amt} on **${betLabel}**!`
  }])
}

// ── Flow helpers ───────────────────────────────────────────────────────
async function openBetsPhase () {
  try {
    isAcceptingEntries = false

    const all = await safeCall(getAllHorses)
    await ensurePersistentHorseImages(all)
    const ownerHorses = all.filter(h => entered.has(h.name))

    if (ownerHorses.length === 0) {
      await safeCall(postMessage, [{ room: ROOM, message: '⚠️ No owners entered; house horses take the field!' }])
    } else {
      const entryNames = ownerHorses.map(h => `${h.emoji || ''} ${h.name}`.trim()).join(', ')
      await safeCall(postMessage, [{ room: ROOM, message: `✅ Entries closed! Participants: ${entryNames}.` }])
    }

    const need = Math.max(0, 6 - ownerHorses.length)

    // Generate fresh bot horses every race (do not pull from DB).
    const bots = []
    const existingNames = new Set(all.map(h => h.name))
    for (const h of ownerHorses) existingNames.add(h.name)

    for (let i = 0; i < need; i++) {
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

    // Build race horses and lock tote-board odds for display + settlement.
    // - h.odds (decimal) is used for simulation strength.
    // - h.oddsLabel / h.oddsFrac / h.oddsDecLocked are used for the race card + bet settlement.
    horses = [...ownerHorses, ...bots].map(h => {
      const decFair = getCurrentOdds(h)
      const locked = lockToteBoardOdds(decFair, { minProfit: 2.0 })

      // CRITICAL: Prevent “underpriced favorite” exploit.
      // Simulation strength should NEVER be stronger than the displayed odds.
      // Since lower decimal = stronger, we take the max.
      const decStrength = Math.max(locked.decFair, locked.oddsDecLocked)

      return {
        ...h,
        // used by simulation speed scaling
        odds: decStrength,

        // display + settlement
        oddsLabel: locked.oddsLabel,
        oddsFrac: locked.oddsFrac,
        oddsDecLocked: locked.oddsDecLocked
      }
    })

    if (!horses.length) {
      await safeCall(postMessage, [{ room: ROOM, message: '❌ No eligible horses. Race canceled.' }])
      cleanup()
      return
    }

    // Pick random silks for this race
    raceSilks = shuffleArray(SILKS).slice(0, horses.length)

    const entries = horses.map((h, i) => ({
      index: i,
      name: `${raceSilks[i]} ${h.name}`,
      odds: h.oddsLabel || '—'
    }))

    const card = renderRacecard(entries, { nameWidth: 24, oddsWidth: 7 })

    await safeCall(postMessage, [{
      room: ROOM,
      message: [
        '**🏇 Post parade — today’s field & odds**',
        '```',
        card,
        '```',
        `Bets open for ${BET_MS / 1000}s.`,
        'Win: /horse <#> <amt> · Place: /place <#> <amt> · Show: /show <#> <amt>',
        'Exacta: /exacta <#>-<#> <amt> · Trifecta: /trifecta <#>-<#>-<#> <amt>'
      ].join('\n')
    }])

    isBettingOpen = true

    setTimeout(() => {
      if (isBettingOpen) {
        safeCall(postMessage, [{
          room: ROOM,
          message: '⌛ Halfway to post! Bet now: /horse, /place, /show, /exacta, /trifecta.'
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
  raceSilks = []
  eligibleByName = new Map()

  // ✅ Reset TV renderer memory between races
  _lastFrame = null
  _lastLine = ''
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
      `✨ Clean **Break** — **${leader.name}** shows speed; **${second.name}** keeps tabs.`,
      `✨ They spring away — **${leader.name}** quick into stride.`
    ])
  }

  const prevOrder = rankOrder(prevState)
  const leadGap = blocks(leader.progress - second.progress, finishDistance)

  const options = []
  if (leadGap <= 1) {
    options.push(
      `🔥 ${phase}: Bunched up — anyone’s race.`,
      `🔥 ${phase}: Wall of horses — looking for room.`
    )
  }
  if (late) {
    options.push(
      `🏁 Down the **Stretch** — **${leader.name}** digs in, **${second.name}** charging!`,
      '🏁 Final strides — they’re all out!'
    )
  }
  if (prevOrder[0] !== order[0]) {
    options.push(`⚡ New leader! **${leader.name}** takes command.`)
  }
  if (!options.length) {
    options.push(`🎯 ${phase}: **${leader.name}** controls; **${second.name}** poised.`)
  }
  return pickDifferent(prevLine, options)
}

function makeFinalCommentary (raceState, winnerIdx, finishDistance) {
  const order = rankOrder(raceState)
  const winner = raceState[winnerIdx]
  const runnerUp = raceState[order[0] === winnerIdx ? order[1] : order[0]]
  const margin = blocks(winner.progress - runnerUp.progress, finishDistance)

  if (margin <= 1) return `📸 Photo finish! **${winner.name}** noses out **${runnerUp.name}** at the wire.`
  if (margin <= 3) return `✅ **${winner.name}** holds off **${runnerUp.name}** late.`
  return `💪 Dominant — **${winner.name}** powers clear in the final strides.`
}

// ── Event rendering ────────────────────────────────────────────────────
let _lastFrame = null
let _lastLine = ''

// Guard against duplicate event listeners in environments where modules may reload.
const LISTENER_GUARD_KEY = '__JAMBOT_HORSERACE_LISTENERS__'
if (!globalThis[LISTENER_GUARD_KEY]) {
  globalThis[LISTENER_GUARD_KEY] = true

  bus.on('turn', async ({ turnIndex, raceState, finishDistance }) => {
    const MIN_CELL_CHANGE = 1 / (finishDistance * BAR_CELLS)
    const prev = _lastFrame?.raceState
    const changed = raceState.some(
      (h, i) => Math.abs((h.progress ?? 0) - (prev?.[i]?.progress ?? 0)) >= MIN_CELL_CHANGE
    )
    if (!changed && (turnIndex % 2 !== 0)) return

    const displayState = raceState.map((h, i) => ({ ...h, name: `${raceSilks[i]} ${h.name}` }))
    const track = renderProgress(displayState, {
      barLength: BAR_CELLS,
      finishDistance,
      style: BAR_STYLE,
      ticksEvery: TICKS_EVERY,
      tickChar: TICK_CHAR,
      nameWidth: NAME_WIDTH
    })

    const comment = makeTurnCommentary(turnIndex, raceState, _lastFrame?.raceState, finishDistance, _lastLine)
    _lastFrame = { raceState, finishDistance }
    _lastLine = comment

    if (TV_MODE) {
      await postMessage({
        room: ROOM,
        message: [
          '```',
          ` Leg ${turnIndex + 1} of ${LEGS}`,
          track,
          '```',
          comment
        ].join('\n')
      })
    }
  })

  bus.on('raceFinished', async ({ winnerIdx, raceState, payouts, payoutDetails, ownerBonus, finishDistance }) => {
    try {
      await postGif('finish')

      await DELAY(RESULTS_PACING.preResultBeatMs)
      await safeCall(postMessage, [{ room: ROOM, message: '🏁 They hit the wire…' }])

      const displayState = raceState.map((h, i) => ({ ...h, name: `${raceSilks[i]} ${h.name}` }))
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

      if (isPhotoFinish) {
        await DELAY(RESULTS_PACING.photoFinishBeatMs)
        await safeCall(postMessage, [{ room: ROOM, message: '📸 Photo finish… waiting on the judges…' }])
      }

      let comment = makeFinalCommentary(raceState, winnerIdx, finishDistance)
      if (isPhotoFinish) comment = `✅ **${winner.name}** gets the nod over **${runnerUp.name}**!`

      await DELAY(RESULTS_PACING.officialBeatMs)

      const winnerDisplayName = displayState[winnerIdx]?.name || `${silk(winnerIdx)} ${raceState[winnerIdx]?.name || ''}`
      const winnerHorse = horses[winnerIdx]
      await safeCall(postMessage, [{
        room: ROOM,
        message: `✅ **Official:** WINNER — **${winnerDisplayName}**!`
      }])
      if (winnerHorse?.imageUrl) {
        await safeCall(postMessage, [{ room: ROOM, message: '', images: [winnerHorse.imageUrl] }])
      }

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

      const podium = rankOrder(raceState).slice(0, 3)
      const podiumLines = []
      if (podium[0] != null) {
        const i = podium[0]
        const nm = displayState[i]?.name || raceState[i]?.name || '—'
        podiumLines.push(`🥇 1st: ${nm} (#${i + 1})`)
      }
      if (podium[1] != null) {
        const i = podium[1]
        const nm = displayState[i]?.name || raceState[i]?.name || '—'
        podiumLines.push(`🥈 2nd: ${nm} (#${i + 1})`)
      }
      if (podium[2] != null) {
        const i = podium[2]
        const nm = displayState[i]?.name || raceState[i]?.name || '—'
        podiumLines.push(`🥉 3rd: ${nm} (#${i + 1})`)
      }
      if (podiumLines.length) {
        await safeCall(postMessage, [{ room: ROOM, message: podiumLines.join('\n') }])
      }

      const payoutEntries = payouts && typeof payouts === 'object'
        ? Object.entries(payouts).filter(([, amount]) => Number(amount) > 0)
        : []

      if (payoutEntries.length > 0) {
        await DELAY(RESULTS_PACING.payoutLineBeatMs)
        for (const [userId, amount] of payoutEntries) {
          const nick = await safeCall(getUserNickname, [userId]).catch(() => null)
          const name = nick?.replace(/^@/, '') || `<@uid:${userId}>`
          const details = Array.isArray(payoutDetails?.[userId]) ? payoutDetails[userId] : []
          const detailText = details.length
            ? details.slice(0, 2).map(d => `${d.bet} ($${d.stake} → $${d.payout})`).join(' · ')
            : ''
          const more = details.length > 2 ? ` · +${details.length - 2} more` : ''
          const extra = detailText ? ` on ${detailText}${more}` : ''
          await safeCall(postMessage, [{ room: ROOM, message: `💵 ${name} wins **$${amount}**${extra}` }])
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
}

// ── Misc helpers ───────────────────────────────────────────────────────
function _fmtPct (w, r) {
  const wins = Number(w || 0)
  const races = Number(r || 0)
  if (!races) return '0%'
  return Math.round((wins / races) * 100) + '%'
}
function _fmtOdds (h) {
  const decFair = getCurrentOdds(h)
  return lockToteBoardOdds(decFair, { minProfit: 2.0 }).oddsLabel
}
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

function padR (s, n) { return String(s ?? '').padEnd(n, ' ') }
function padL (s, n) { return String(s ?? '').padStart(n, ' ') }

function clampName (s, n) {
  s = String(s ?? '')
  if (s.length <= n) return padR(s, n)
  return padR(s.slice(0, Math.max(0, n - 1)) + '…', n)
}

function tierTag (tier) {
  const t = String(tier || '').toUpperCase()
  // keep short for table
  if (!t) return '—'
  if (t.length <= 7) return t
  return t.slice(0, 7)
}

function statusTag (h, hof = false) {
  const retired = !!h?.retired || Number(h?.retired) === 1
  if (retired) return hof ? '🏆 RET' : 'RET'
  return hof ? '🏆' : ''
}

function careerLeft (h) {
  const races = Number(h?.racesParticipated || 0)
  const limit = Number.isFinite(Number(h?.careerLength)) ? Number(h.careerLength) : null
  if (!limit || limit <= 0) return '—'
  return String(Math.max(0, limit - races))
}

function renderHorseTable (rows, { title = '', showOwner = false, dividerTrim = 0 } = {}) {
  // Column widths tuned for CometChat
  const W_NUM = 2
  const W_NAME = showOwner ? 18 : 22
  const W_TIER = 7
  const W_REC = 9 // "12-34"
  const W_PCT = 4 // "45%"
  const W_LEFT = 4 // races left
  const W_STAT = 6 // status / hof badge

  const header =
    `${padL('#', W_NUM)} ` +
    `${padR('Horse', W_NAME)} ` +
    `${padR('Tier', W_TIER)} ` +
    `${padR('W-S', W_REC)} ` +
    `${padR('%', W_PCT)} ` +
    `${padR('Left', W_LEFT)} ` +
    `${padR('Status', W_STAT)}` +
    (showOwner ? ` ${padR('Owner', 14)}` : '')

  const line = '-'.repeat(Math.max(0, header.length - Number(dividerTrim || 0)))

  const body = rows.map((r, idx) => {
    const h = r.horse || r
    const num = padL(String(idx + 1), W_NUM)
    const name = clampName(h.name, W_NAME)
    const tier = padR(tierTag(h.tier), W_TIER)
    const rec = padR(`${Number(h.wins || 0)}-${Number(h.racesParticipated || 0)}`, W_REC)
    const pct = padR(fmtPct(h.wins, h.racesParticipated), W_PCT)
    const left = padR(careerLeft(h), W_LEFT)
    const stat = padR(statusTag(h, !!r.hof), W_STAT)
    const owner = showOwner ? ` ${padR(String(r.ownerLabel || '—'), 14)}` : ''
    return `${num} ${name} ${tier} ${rec} ${pct} ${left} ${stat}${owner}`
  })

  const parts = []
  if (title) parts.push(title)
  parts.push(header)
  parts.push(line)
  parts.push(...body)

  return '```\n' + parts.join('\n') + '\n```'
}

export async function handleMyHorsesCommand (ctx) {
  const userId = ctx?.sender || ctx?.userId || ctx?.uid
  const nick = await getUserNickname(userId)
  const mine = await getUserHorses(userId)
  await ensurePersistentHorseImages(mine)

  if (!mine || mine.length === 0) {
    await postMessage({
      room: ROOM,
      message: `${nick}, you don’t own any horses yet. Use **/buyhorse <tier>** to get started.`
    })
    return
  }

  const tierRank = { champion: 0, elite: 1, basic: 2 }
  const tierBadge = (tier) => {
    const t = String(tier || '').toLowerCase()
    if (t === 'champion') return '🏆'
    if (t === 'elite') return '⚡'
    if (t === 'basic') return '🐎'
    return '•'
  }

  // Sort: active first, then tier, then wins, then win%
  const arranged = mine.slice().sort((a, b) => {
    const ar = (!!a.retired || Number(a.retired) === 1) ? 1 : 0
    const br = (!!b.retired || Number(b.retired) === 1) ? 1 : 0
    if (ar !== br) return ar - br

    const at = tierRank[String(a?.tier || '').toLowerCase()] ?? 9
    const bt = tierRank[String(b?.tier || '').toLowerCase()] ?? 9
    if (at !== bt) return at - bt

    const aw = Number(a?.wins || 0)
    const bw = Number(b?.wins || 0)
    if (bw !== aw) return bw - aw

    const ap = aw / Math.max(1, Number(a?.racesParticipated || 0))
    const bp = bw / Math.max(1, Number(b?.racesParticipated || 0))
    return bp - ap
  })

  const activeCount = arranged.filter(h => !(!!h.retired || Number(h.retired) === 1)).length
  const retiredCount = arranged.length - activeCount
  const championCount = arranged.filter(h => String(h?.tier || '').toLowerCase() === 'champion').length
  const eliteCount = arranged.filter(h => String(h?.tier || '').toLowerCase() === 'elite').length
  const basicCount = arranged.filter(h => String(h?.tier || '').toLowerCase() === 'basic').length

  const displayRows = arranged.map(h => ({
    ...h,
    name: `${tierBadge(h.tier)} ${String(h.name || '')}`.trim()
  }))

  const summary = [
    `${nick}'s Stable (${arranged.length})`,
    `Active ${activeCount} · Retired ${retiredCount}`,
    `Tiers: Champion ${championCount} · Elite ${eliteCount} · Basic ${basicCount}`
  ].join('\n')

  const isRetired = (h) => !!h?.retired || Number(h?.retired) === 1
  const activeRows = displayRows.filter(h => !isRetired(h))
  const retiredRows = displayRows.filter(h => isRetired(h))

  const activeTable = renderHorseTable(activeRows, {
    title: `${summary}\n\nACTIVE`,
    dividerTrim: 7
  })
  const retiredTable = renderHorseTable(retiredRows, {
    title: 'RETIRED',
    dividerTrim: 7
  })
  const footer = 'Details: /horsedetails <horse name>   Sell: /sellhorse <horse name>'

  await postMessage({
    room: ROOM,
    message: `${activeTable}\n${retiredTable}\n${footer}`
  })
}

export async function handleHorseStatsCommand (ctx) {
  const room = ctx?.room || ROOM
  const text = String(ctx?.message || '').trim()
  const nameArg = (text.match(/^\/(?:horsestats|horsedetails)\s+(.+)/i) || [])[1]

  const all = await getAllHorses()
  const horsesList = Array.isArray(all) ? all : []
  await ensurePersistentHorseImages(horsesList)

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
  if (match?.imageUrl) {
    await postMessage({ room, message: '', images: [match.imageUrl] })
  }
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

  const W_NUM = 2
  const W_NAME = 18
  const W_TIER = 7
  const W_REC = 7
  const W_PCT = 4
  const W_OWNER = 12

  const padR = (s, n) => String(s ?? '').padEnd(n, ' ')
  const padL = (s, n) => String(s ?? '').padStart(n, ' ')
  const clamp = (s, n) => {
    s = String(s ?? '')
    if (s.length <= n) return padR(s, n)
    return padR(s.slice(0, n - 1) + '…', n)
  }
  const pct = (w, s) => {
    w = Number(w || 0); s = Number(s || 0)
    if (!s) return '0%'
    return `${Math.round((w / s) * 100)}%`
  }

  const header =
    `${padL('#', W_NUM)} ` +
    `${padR('Horse', W_NAME)} ` +
    `${padR('Tier', W_TIER)} ` +
    `${padR('W-S', W_REC)} ` +
    `${padR('%', W_PCT)} ` +
    `${padR('Owner', W_OWNER)}`

  const line = '-'.repeat(header.length)

  const rows = []
  for (let i = 0; i < top.length; i++) {
    const h = top[i]
    const rec = `${Number(h?.wins || 0)}-${Number(h?.racesParticipated || 0)}`
    const ownerNick = h?.ownerId
      ? await safeCall(getUserNickname, [h.ownerId]).catch(() => null)
      : null
    const ownerLabel = (ownerNick ? String(ownerNick).replace(/^@/, '') : '—')

    rows.push(
      `${padL(String(i + 1), W_NUM)} ` +
      `${clamp(h.name, W_NAME)} ` +
      `${padR(String(h?.tier || '—').toUpperCase().slice(0, W_TIER), W_TIER)} ` +
      `${padR(rec, W_REC)} ` +
      `${padR(pct(h.wins, h.racesParticipated), W_PCT)} ` +
      `${clamp(ownerLabel, W_OWNER)}`
    )
  }

  const title = 'Top Horses (User-Owned)'
  const msg = ['```', title, header, line, ...rows, '```'].join('\n')
  await postMessage({ room: ROOM, message: msg })
}

// ── Help command ─────────────────────────────────────────────────────────
export async function handleHorseHelpCommand (ctx) {
  const room = ctx?.room || ROOM
  const helpLines = [
    '🏇 HORSE RACE COMMANDS',
    '',
    'Stable Management',
    '  /buyhorse <tier> [option#]  - browse/buy tier horses (basic, elite, champion)',
    '  /sellhorse [name]           - show sell values or sell one horse',
    '  /myhorses                   - view your stable and records',
    '',
    'Stats + Rankings',
    '  /horsedetails [name]        - horse details or global leaderboards',
    '  /horsestats [name]          - alias of /horsedetails',
    '  /tophorses                  - top user-owned horses by performance',
    '  /hof [newest|wins|winpct]   - hall of fame leaderboard',
    '  /hof <horse name>           - hall of fame plaque for one horse',
    '',
    'Race Flow',
    '  /horserace                  - start a race (opens owner entry window)',
    '  /horse <#> <amt>            - WIN bet',
    '  /place <#> <amt>            - PLACE bet (top 2)',
    '  /show <#> <amt>             - SHOW bet (top 3)',
    '  /exacta <#>-<#> <amt>       - exact top 2 in order',
    '  /trifecta <#>-<#>-<#> <amt> - exact top 3 in order',
    '  /horsehelp                  - show this help card',
    '',
    'Notes',
    '  Horses have finite careers. When a horse reaches its race limit, it retires automatically.',
    '  During entry windows, type your horse name exactly to enter the race.'
  ]
  await postMessage({ room, message: '```\n' + helpLines.join('\n') + '\n```' })
}

function fmtPct (wins, starts) {
  const w = Number(wins || 0)
  const s = Number(starts || 0)
  if (!s) return '0%'
  return `${Math.round((w / s) * 100)}%`
}

function fmtDate (iso) {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' })
  } catch {
    return String(iso || '')
  }
}

/**
 * /hof [newest|wins|winpct]
 */
export async function handleHofCommand (ctx) {
  const room = ctx?.room || ROOM
  const text = String(ctx?.message || '').trim()

  const arg = (text.match(/^\/hof\s*(.*)$/i) || [])[1]?.trim().toLowerCase()
  const sort = (arg === 'wins' || arg === 'winpct') ? arg : 'newest'

  const rows = getHofList({ limit: 10, sort })
  if (!rows || rows.length === 0) {
    await postMessage({ room, message: '```\n🏆 Horse Hall of Fame\n(no inductees yet)\n```' })
    return
  }

  const lines = rows.map((r, i) => {
    const num = String(i + 1).padStart(2, '0')
    const name = String(r.name || '').padEnd(22, ' ')
    const tier = String(r.tier || '').toUpperCase().padEnd(9, ' ')
    const rec = `${Number(r.wins || 0)}W/${Number(r.racesParticipated || 0)}S`.padEnd(9, ' ')
    const pct = fmtPct(r.wins, r.racesParticipated).padEnd(4, ' ')
    const date = fmtDate(r.inducted_at)
    return `${num}. ${name} ${tier} ${rec} ${pct}  Inducted ${date}`
  })

  const header = sort === 'wins'
    ? '🏆 Horse Hall of Fame (Top Wins)'
    : sort === 'winpct'
      ? '🏆 Horse Hall of Fame (Top Win%)'
      : '🏆 Horse Hall of Fame (Newest)'

  const msg = [
    header,
    '',
    ...lines,
    '',
    'Tip: /hof <horse name>  (plaque)'
  ].join('\n')

  await postMessage({ room, message: '```\n' + msg + '\n```' })
}

/**
 * /hof <horse name>
 */
export async function handleHofPlaqueCommand (ctx) {
  const room = ctx?.room || ROOM
  const text = String(ctx?.message || '').trim()
  const nameArg = (text.match(/^\/hof\s+(.+)/i) || [])[1]?.trim()

  // If they typed /hof wins or /hof newest, that's the list command.
  if (!nameArg || nameArg.toLowerCase() === 'wins' || nameArg.toLowerCase() === 'winpct' || nameArg.toLowerCase() === 'newest') {
    return handleHofCommand(ctx)
  }

  const row = getHofEntryByHorseName(nameArg)
  if (!row) {
    await postMessage({ room, message: `❗ **${nameArg}** is not in the Hall of Fame (or name not found).` })
    return
  }

  const owner = row?.ownerId ? `<@uid:${row.ownerId}>` : 'House'
  const starts = Number(row.racesParticipated || 0)
  const wins = Number(row.wins || 0)
  const pct = fmtPct(wins, starts)

  const plaque = [
    '🏆 HALL OF FAME PLAQUE',
    `Name:   ${row.name}`,
    `Owner:  ${owner}`,
    `Tier:   ${String(row.tier || '').toUpperCase() || '—'}`,
    `Record: ${wins} wins / ${starts} starts (${pct})`,
    `Inducted: ${fmtDate(row.inducted_at)}`,
    `Reason: ${row.reason || '—'}`
  ].join('\n')

  await postMessage({ room, message: '```\n' + plaque + '\n```' })
}
