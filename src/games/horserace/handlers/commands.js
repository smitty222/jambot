// src/games/horserace/handlers/commands.js
// Using SOLID rail style (compact). Includes SILKS, countdown/bell, and GIFs-as-images.

import { postMessage } from '../../../libs/cometchat.js'
import { getUserWallet, removeFromUserWallet } from '../../../database/dbwalletmanager.js'
// Use the standalone nickname util instead of importing from the
// monolithic message handler. This avoids pulling in unnecessary code
// and prevents circular dependencies.
import { getUserNickname } from '../../../utils/nickname.js'
import { getAllHorses, getUserHorses } from '../../../database/dbhorses.js'
import { fetchCurrentUsers } from '../../../utils/API.js'

import { bus, safeCall } from '../service.js'
import { runRace, LEGS } from '../simulation.js'
import { getCurrentOdds, formatOdds } from '../utils/odds.js'
import { renderProgress, renderRacecard } from '../utils/progress.js'

const ROOM = process.env.ROOM_UUID

// ── Display tuning ─────────────────────────────────────────────────────
const BAR_STYLE = 'solid' // << switch to 'solid'
const BAR_CELLS = 12 // width of the solid rail
const NAME_WIDTH = 24
const TV_MODE = true
const PHOTO_SUSPENSE_MS = 2500 // pause between GIF and the photo-finish message

// solid style ticks (subtle markers inside the bar)
const TICKS_EVERY = 3
const TICK_CHAR = ':' // subtle colon inside solid rail

// (rail-only knobs kept for future toggling)
const CELL_WIDTH = 1
const GROUP_SIZE = 3

// ── SILKS (colored “jerseys”) ─────────────────────────────────────────
const SILKS = ['🟥', '🟦', '🟩', '🟨', '🟪', '🟧', '⬛', '⬜', '🟫', '🟪']
const silk = (i) => SILKS[i % SILKS.length]
function buildSilkLegend (horses) {
  return horses.map((h, i) => `${String(i + 1).padStart(2, ' ')} ${silk(i)} ${h.name}`).join('\n')
}

// ── GIFs (image posts) ────────────────────────────────────────────────
const GIFS = {
  start: [
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcmk3dnY1b3k3eHE1bHJhaGgwNzB1cTdncTNzY3FiN3hkczhmbTJscyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/SuI4fzUBQzG1H1kEtI/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcmk3dnY1b3k3eHE1bHJhaGgwNzB1cTdncTNzY3FiN3hkczhmbTJscyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/StuM9jJ3nFapMPQbdx/giphy.gif'
  ],
  finish: [
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3VpbGhmNHIzdXhwa3ZkbTF2anEybzh1aGw5b3ZlMmxmMTBsbGg4bSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/kmfOkAC6tVJL2tR0vk/giphy.gif'
  ],
  photoFinish: [
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbmg1Z2RzYm9oMjBiOXQwazkyY2hwenF4YmlsZTZkdWp0eDI0aGk0ciZlcD12MV9naWZzX3NlYXJjaCZjdD1n/iD7jBggMvtFQ5BdNpV/giphy.gif'
  ]
}
function pick (arr) { return arr[Math.floor(Math.random() * arr.length)] }
async function postGif (type, caption = '') {
  const url = pick(GIFS[type] || [])
  if (!url) return
  await postMessage({ room: ROOM, message: '', images: [url] })
  if (caption) await postMessage({ room: ROOM, message: caption })
}

// ── Race flow timing ───────────────────────────────────────────────────
const ENTRY_MS = 30_000
const BET_MS = 30_000

// ── Post-time countdown ────────────────────────────────────────────────
async function postCountdown (n = 5) {
  for (let i = n; i >= 1; i--) {
    await postMessage({ room: ROOM, message: `⏱️ Post time in ${i}…` })
    await new Promise(r => setTimeout(r, 800))
  }
  await postMessage({ room: ROOM, message: '🔔 *And they’re off!*' })
}

// Career limit heuristics (used by /myhorses)
const TIER_RETIRE_LIMIT = { champion: 50, elite: 40, pro: 30, rookie: 25, amateur: 20, default: 25 }
function careerLimitFor (h) {
  if (Number.isFinite(h?.careerLimit)) return h.careerLimit
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
  // reset
  isAcceptingEntries = true
  isBettingOpen = false
  entered.clear()
  horses = []
  horseBets = {}

  await safeCall(postMessage, [{
    room: ROOM,
    message: `🏁 HORSE RACE STARTING! Type your horse’s exact name in the next ${ENTRY_MS / 1000}s to enter.`
  }])

  // show available online owner horses by tier
  const all = await safeCall(getAllHorses)
  const activeIds = await safeCall(fetchCurrentUsers).catch(() => [])
  const avail = all.filter(h => activeIds.includes(h.ownerId) && !h.retired && h.ownerId !== 'allen')

  if (avail.length) {
    const byTier = avail.reduce((acc, h) => {
      const t = h.tier || 'Unrated';
      (acc[t] ||= []).push(h)
      return acc
    }, {})
    const tiers = Object.keys(byTier).sort()
    const lines = []
    for (const t of tiers) {
      lines.push(`**${t}**`)
      for (const h of byTier[t]) {
        const nick = await safeCall(getUserNickname, [h.ownerId]).catch(() => '@owner')
        lines.push(`- ${h.emoji || '🐎'} ${h.name} (by ${nick?.replace(/^@/, '') || 'Unknown'})`)
      }
    }
    await safeCall(postMessage, [{ room: ROOM, message: `🏇 Available horses by tier:\n${lines.join('\n')}` }])
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

  await safeCall(removeFromUserWallet, [sender, amt]);
  (horseBets[sender] ||= []).push({ horseIndex: idx, amount: amt })

  const h = horses[idx]
  await safeCall(postMessage, [{
    room: ROOM,
    message: `${nick} bets $${amt} on #${idx + 1} **${h.name}**! 🐎`
  }])
}

// ── Flow helpers ───────────────────────────────────────────────────────
async function openBetsPhase () {
  try {
    isAcceptingEntries = false

    // Choose racers: entered owner horses + fill with bots to up to 6
    const all = await safeCall(getAllHorses)
    const ownerHorses = all.filter(h => entered.has(h.name))
    const need = Math.max(0, 6 - ownerHorses.length)
    const bots = all
      .filter(h => (!h.ownerId || h.ownerId === 'allen') && !h.retired)
      .sort((a, b) => (b.baseOdds || 0) - (a.baseOdds || 0))
      .slice(0, need)

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
      name: `${silk(i)} ${h.name}`, // 👈 silk inline
      odds: formatOdds(h.odds, 'fraction')
    }))

    // widen name column slightly for emoji + name
    const card = renderRacecard(entries, { nameWidth: 24, oddsWidth: 6 })

    await safeCall(postMessage, [{
      room: ROOM,
      message: [
        '**🎺 Post parade — today’s field & odds**',
        '```',
        card,
        '```',
    `Place bets with \`/horse[number] [amount]\` in the next ${BET_MS / 1000}s.`
      ].join('\n')
    }])

    isBettingOpen = true
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
      `🎙️ Clean **Break** — **${leader.name}** shows speed; **${second.name}** keeps tabs.`,
      `🎙️ They spring away — **${leader.name}** quick into stride.`
    ])
  }

  const prevOrder = rankOrder(prevState)
  const leadGap = blocks(leader.progress - second.progress, finishDistance)

  const options = []
  if (leadGap <= 1) {
    options.push(
      `🎙️ ${phase}: Bunched up — anyone’s race.`,
      `🎙️ ${phase}: Wall of horses — looking for room.`
    )
  }
  if (late) {
    options.push(
      `🎙️ Down the **Stretch** — **${leader.name}** digs in, **${second.name}** charging!`,
      `🎙️ Final furlong — **${leader.name}** under pressure!`
    )
  }
  if (prevOrder[0] !== order[0]) {
    options.push(`🎙️ New leader! **${leader.name}** takes command.`)
  }
  if (!options.length) {
    options.push(`🎙️ ${phase}: **${leader.name}** controls; **${second.name}** poised.`)
  }
  return pickDifferent(prevLine, options)
}

function makeFinalCommentary (raceState, winnerIdx, finishDistance) {
  const order = rankOrder(raceState)
  const winner = raceState[winnerIdx]
  const runnerUp = raceState[order[0] === winnerIdx ? order[1] : order[0]]
  const margin = blocks(winner.progress - runnerUp.progress, finishDistance)

  if (margin <= 1) return `📸 Photo finish! **${winner.name}** noses out **${runnerUp.name}** at the wire.`
  if (margin <= 3) return `🏁 **${winner.name}** holds off **${runnerUp.name}** late.`
  return `🏁 Dominant — **${winner.name}** powers clear in the final strides.`
}

// ── Event rendering ────────────────────────────────────────────────────
let _lastFrame = null
let _lastLine = ''

bus.on('turn', async ({ turnIndex, raceState, finishDistance }) => {
  const label = `🏁 Leg ${turnIndex + 1} of ${LEGS}`

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
    nameWidth: NAME_WIDTH,
    // solid-only options
    ticksEvery: TICKS_EVERY,
    tickChar: TICK_CHAR,
    // rail knobs (ignored by solid)
    cellWidth: CELL_WIDTH,
    groupSize: GROUP_SIZE
  })

  let line = ''
  if (TV_MODE) {
    try {
      line = makeTurnCommentary(
        turnIndex,
        raceState,
        _lastFrame?.raceState || null,
        finishDistance,
        _lastLine
      )
      _lastLine = line || _lastLine
    } catch {}
  }

  _lastFrame = { turnIndex, raceState }

  await postMessage({
    room: ROOM,
    message: ['```', label, track, '```', line ? `\n${line}` : ''].join('\n')
  })
})


bus.on('raceFinished', async ({ winnerIdx, raceState, payouts, ownerBonus, finishDistance }) => {
  const header = '🏆 Final Results'

  // Show silks in the final board
  const displayState = raceState.map((h, i) => ({ ...h, name: `${silk(i)} ${h.name}` }))

  const track = renderProgress(displayState, {
    barLength: BAR_CELLS,
    finishDistance,
    winnerIndex: winnerIdx,
    style: BAR_STYLE,
    nameWidth: NAME_WIDTH,
    ticksEvery: TICKS_EVERY,
    tickChar: TICK_CHAR,
    cellWidth: CELL_WIDTH,
    groupSize: GROUP_SIZE
  })

  const winner = raceState[winnerIdx]

  // Compute margin to decide if it's a photo finish
  const order = rankOrder(raceState)
  const runnerUp = raceState[order[0] === winnerIdx ? order[1] : order[0]]
  const marginCells = blocks(raceState[winnerIdx].progress - runnerUp.progress, finishDistance)
  const isPhotoFinish = marginCells <= 1

  // 1) Post the final board first (no commentary line yet — we’ll time it)
  await postMessage({
    room: ROOM,
    message: ['```', header, track, '```'].join('\n')
  })

  // 2) Suspense flow
  if (isPhotoFinish) {
    // GIF first…
    await postGif('photoFinish')

    // …then a short suspense delay…
    await new Promise(r => setTimeout(r, PHOTO_SUSPENSE_MS))

    // …then the reveal line
    const finaleLine = makeFinalCommentary(raceState, winnerIdx, finishDistance) // "📸 Photo finish! ..."
    if (finaleLine) {
      await postMessage({ room: ROOM, message: finaleLine })
    }
  } else {
    // Non-photo: commentary first, then finish GIF
    const finaleLine = makeFinalCommentary(raceState, winnerIdx, finishDistance)
    if (finaleLine) {
      await postMessage({ room: ROOM, message: finaleLine })
    }
    await postGif('finish')
  }

  // 3) Payouts (unchanged)
  const payoutsLines = Object.keys(payouts || {}).length
    ? Object.entries(payouts).map(([uid, amt]) => `• <@uid:${uid}> +$${amt}`).join('\n')
    : '• No winning tickets. The house thanks you.'

  const ownerLine = ownerBonus
    ? `\n🏇 Owner bonus: <@uid:${ownerBonus.ownerId}> +$${ownerBonus.amount}`
    : ''

  await postMessage({
    room: ROOM,
    message: `🥇 Winner: #${winnerIdx + 1} **${winner.name}**\n\n💰 Payouts:\n${payoutsLines}${ownerLine}`
  })

  _lastFrame = null
  _lastLine = ''
})

// ── Extra commands (help / stats / top / myhorses) ────────────────────
export async function handleHorseHelpCommand (ctx) {
  const help = [
    '🐎 **Horse Race Commands**',
    '',
    '• `/horserace` — open entries, run a race',
    '• `/enter <horse name>` — enter one of your horses',
    '• `/bet <#lane> <amount>` — place a bet on a lane (after entries close)',
    '• `/myhorses` — list your stable with records and current odds',
    '• `/horsestats [horse name]` — overall leaderboard or a specific horse’s stats',
    '• `/tophorses` — top horses by total wins',
    '',
    'TIPS: Owner horses race more often; odds tighten for in-form horses.'
  ].join('\n')
  await postMessage({ room: ROOM, message: help })
}

function _fmtPct (w, r) {
  const wins = Number(w || 0); const races = Number(r || 0)
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
  return `${tag} ${h.name}${retired}${tier} — Odds ${_fmtOdds(h)} · Races ${races} · Wins ${wins} (${pct})`
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
    const aw = Number(a?.wins || 0); const bw = Number(b?.wins || 0)
    if (bw !== aw) return bw - aw
    const ap = (Number(a?.wins || 0) / Math.max(1, Number(a?.racesParticipated || 0)))
    const bp = (Number(b?.wins || 0) / Math.max(1, Number(b?.racesParticipated || 0)))
    return bp - ap
  })
  const lines = arranged.map((h, i) => _fmtLine(h, i))
  const header = `🐴 **${nick}’s Stable** (${arranged.length})`
  const body = ['```', header, ...lines, '```'].join('\n')
  await postMessage({ room: ROOM, message: body })
}

export async function handleHorseStatsCommand (ctx) {
  const room = ctx?.room || ROOM
  const text = String(ctx?.message || '').trim()
  const nameArg = (text.match(/^\/horsestats\s+(.+)/i) || [])[1]

  const all = await getAllHorses()
  const horses = Array.isArray(all) ? all : []

  if (!nameArg) {
    // Leaderboards
    const topWins = horses.slice()
      .sort((a, b) => Number(b?.wins || 0) - Number(a?.wins || 0))
      .slice(0, 10)

    const topPct = horses.slice()
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
      '📊 **Horse Stats**',
      '',
      '🏆 Top Wins',
      ...linesWins,
      '',
      '📈 Best Win% (min 5 starts)',
      ...linesPct
    ].join('\n')

    await postMessage({ room, message: '```\n' + msg + '\n```' })
    return
  }

  // Specific horse lookup (case-insensitive, supports partial)
  const needle = nameArg.toLowerCase()
  const match = horses.find(h => String(h?.name || '').toLowerCase() === needle) ||
             horses.find(h => String(h?.name || '').toLowerCase().includes(needle))

  if (!match) {
    await postMessage({ room, message: `❗ Couldn’t find a horse named **${nameArg}**.` })
    return
  }

  const races = Number(match?.racesParticipated || 0)
  const wins = Number(match?.wins || 0)
  const pct = _fmtPct(wins, races)
  const owner = match?.ownerId ? `<@uid:${match.ownerId}>` : 'House'

  const details = [
    `📄 **${match.name}**` + (match.retired ? ' (retired)' : ''),
    `Owner: ${owner}`,
    `Tier: ${String(match?.tier || '').toUpperCase() || '—'}`,
    `Odds (current): ${_fmtOdds(match)}`,
    `Record: ${wins} wins from ${races} starts (${pct})`,
    `Career limit: ${match?.careerLimit ?? '—'}`, // safe fallback; remove or replace if you later add a real calculator
    `Base odds: ${match?.baseOdds ?? '—'} · Volatility: ${match?.volatility ?? '—'}`
  ].join('\n')

  await postMessage({ room, message: '```\n' + details + '\n```' })
}

export async function handleTopHorsesCommand (ctx) {
  const room = ctx?.room || ROOM
  const all = await getAllHorses()
  const horses = Array.isArray(all) ? all : []

  // Allen / house filters
  const allenIds = String(process.env.ALLEN_USER_IDS || process.env.CHAT_USER_ID || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  // Only user-owned horses (must have ownerId) and not owned by Allen/bot
  const userHorses = horses.filter(h => {
    const owner = h?.ownerId
    if (!owner) return false // exclude house/no-owner
    return !allenIds.includes(String(owner))
  })

  if (userHorses.length === 0) {
    await postMessage({ room, message: '```\\nNo user-owned horses found yet.\\n```' })
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
  const msg = ['🏅 **Top Horses (user-owned only)**', ...lines].join('\n')
  await postMessage({ room, message: '```\\n' + msg + '\\n```' })
}
