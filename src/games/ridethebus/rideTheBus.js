// src/games/ridethebus/rideTheBus.js
import { postMessage } from '../../libs/openchat.js'
import { getUserWallet, debitGameBet, creditGameWin } from '../../database/dbwalletmanager.js'
import { env } from '../../config.js'

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────
const MIN_BET = env.rtbMinBet
const MAX_BET = env.rtbMaxBet
const ANSWER_MS = env.rtbAnswerSecs * 1000

// Cash-out multipliers per phase (based on # of correct answers so far)
const CASHOUT_MULT = { q2: 1.5, q3: 2.0, q4: 3.5 }

// Punishment mode: fraction of stake returned per correct answer (Q1–Q4)
// All 4 correct = 0.25+0.25+0.25+0.50 = 1.25× stake returned (net +25% profit)
const PUNISH_RECOVERY = [0.25, 0.25, 0.25, 0.50]
const PUNISH_PHASE_IDX = { q1: 0, q2: 1, q3: 2, q4: 3 }

// ─────────────────────────────────────────────────────────────
// Deck
// ─────────────────────────────────────────────────────────────
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A']
const SUITS = ['♠','♥','♦','♣']
const RANK_VALUES = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]))
const RED_SUITS = new Set(['♥','♦'])

function buildDeck () {
  const deck = []
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      deck.push({ rank, suit, value: RANK_VALUES[rank], isRed: RED_SUITS.has(suit) })
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

const cardLabel = c => `${c.rank}${c.suit}`

function fmtMoney (n) {
  const num = Number(n)
  if (!Number.isFinite(num)) return '$0'
  return `$${Math.abs(num).toLocaleString()}`
}

// 4-slot card track — reveals only cards dealt so far
function track (cards) {
  return [0, 1, 2, 3].map(i => cards[i] ? `[${cardLabel(cards[i])}]` : `[ ? ]`).join('  ')
}

// ─────────────────────────────────────────────────────────────
// State  (per-player, keyed by `${room}:${uuid}`)
// ─────────────────────────────────────────────────────────────
const GAMES = new Map()

const gameKey = (room, uuid) => `${room}:${uuid}`
const getGame = (room, uuid) => GAMES.get(gameKey(room, uuid))
const setGame = (room, uuid, g) => GAMES.set(gameKey(room, uuid), g)

function deleteGame (room, uuid) {
  const g = getGame(room, uuid)
  if (g?.timer) clearTimeout(g.timer)
  GAMES.delete(gameKey(room, uuid))
}

function clearTimer (g) {
  if (g?.timer) { clearTimeout(g.timer); g.timer = null }
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export function getActivePhase (room, uuid) {
  return getGame(room, uuid)?.phase ?? null
}

export async function startPunishmentGame (uuid, nickname, room, deps = {}) {
  const post = deps.postMessage ?? postMessage

  if (getGame(room, uuid)) {
    await post({ room, message: `<@uid:${uuid}> 🚌 You already have a ride in progress! Finish it first.` })
    return
  }

  const balance = Number(await getUserWallet(uuid))
  const raw = Math.floor(balance * (env.rtbPunishPct / 100))
  const stake = Math.max(env.rtbPunishMin, raw)

  if (balance < env.rtbPunishMin) {
    await post({ room, message: `<@uid:${uuid}> 🚌 Not enough coins to ride the punishment bus (need at least ${fmtMoney(env.rtbPunishMin)}).` })
    return
  }

  const ok = await debitGameBet(uuid, stake, { source: 'ridethebus', category: 'punishment_stake' })
  if (!ok) {
    await post({ room, message: `<@uid:${uuid}> Couldn't stake the punishment bet. Try again.` })
    return
  }

  const deck = buildDeck()
  const firstCard = deck.pop()
  const nick = String(nickname ?? '').replace(/<@uid:[^>]+>/g, '').replace(/^@+/, '').trim()

  const g = { uuid, nickname: nick, room, bet: stake, phase: 'q1', cards: [firstCard], deck, timer: null, mode: 'punishment', stakeRecovered: 0 }
  setGame(room, uuid, g)
  g.timer = setTimeout(() => _onTimeout(uuid, room, 'q1', deps), ANSWER_MS)

  await post({
    room,
    message: [
      `🚌💀  **PUNISHMENT BUS**  —  you're going for a ride!`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `💸  **${fmtMoney(stake)}** on the line  *(${env.rtbPunishPct}% of your bankroll)*`,
      ``,
      `Answer all 4 and you'll get **125%** back  (+${fmtMoney(Math.floor(stake * 0.25))} profit)`,
      `Each correct answer returns part of your stake — miss one and lose the rest`,
      ``,
      `🃏  \`${track([])}\``,
      ``,
      `🔴🖤  **Stop 1 of 4  —  RED or BLACK?**`,
      `\`/red\`  ·  \`/black\``,
      `⏱ ${env.rtbAnswerSecs}s`,
    ].join('\n')
  })
}

export async function startGame (uuid, nickname, room, betStr, deps = {}) {
  const post = deps.postMessage ?? postMessage

  if (getGame(room, uuid)) {
    const g = getGame(room, uuid)
    if (g.mode === 'punishment') {
      await post({ room, message: `<@uid:${uuid}> 🚌 You're on the punishment bus! Finish your ride first.` })
    } else {
      await post({ room, message: `<@uid:${uuid}> 🚌 You already have a ride in progress! Answer the current question or type \`/cashout\` to bail.` })
    }
    return
  }

  const amount = parseInt(betStr, 10)
  if (!Number.isFinite(amount) || amount <= 0) {
    await post({ room, message: `<@uid:${uuid}> Usage: \`/rtb <amount>\` — e.g. \`/rtb 500\`` })
    return
  }
  if (amount < MIN_BET) {
    await post({ room, message: `<@uid:${uuid}> Minimum bet is ${fmtMoney(MIN_BET)}.` })
    return
  }
  if (amount > MAX_BET) {
    await post({ room, message: `<@uid:${uuid}> Maximum bet is ${fmtMoney(MAX_BET)}.` })
    return
  }

  const balance = await getUserWallet(uuid)
  if (Number(balance) < amount) {
    await post({ room, message: `<@uid:${uuid}> 💸 Not enough coins! Balance: ${fmtMoney(balance)}.` })
    return
  }

  const ok = await debitGameBet(uuid, amount, { source: 'ridethebus', category: 'bet' })
  if (!ok) {
    await post({ room, message: `<@uid:${uuid}> Couldn't place your bet. Please try again.` })
    return
  }

  const deck = buildDeck()
  const firstCard = deck.pop()
  const nick = String(nickname ?? '').replace(/<@uid:[^>]+>/g, '').replace(/^@+/, '').trim()

  const g = { uuid, nickname: nick, room, bet: amount, phase: 'q1', cards: [firstCard], deck, timer: null }
  setGame(room, uuid, g)
  g.timer = setTimeout(() => _onTimeout(uuid, room, 'q1', deps), ANSWER_MS)

  await post({
    room,
    message: [
      `🚌💨  **RIDE THE BUS**  —  all aboard!`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `💵  Betting: **${fmtMoney(amount)}**`,
      ``,
      `🃏  \`${track([])}\``,
      ``,
      `🔴🖤  **Stop 1 of 4  —  RED or BLACK?**`,
      `\`/red\`  ·  \`/black\``,
      `⏱ ${env.rtbAnswerSecs}s`,
    ].join('\n')
  })
}

export async function handleAnswer (uuid, nickname, room, answer, deps = {}) {
  const post = deps.postMessage ?? postMessage
  const g = getGame(room, uuid)

  if (!g) {
    await post({ room, message: `<@uid:${uuid}> No ride in progress. Type \`/rtb <amount>\` to start one!` })
    return
  }

  clearTimer(g)

  const { phase } = g
  if (phase === 'q1') return _q1(g, answer, deps)
  if (phase === 'q2') return _q2(g, answer, deps)
  if (phase === 'q3') return _q3(g, answer, deps)
  if (phase === 'q4') return _q4(g, answer, deps)
}

export async function handleCashout (uuid, nickname, room, deps = {}) {
  const post = deps.postMessage ?? postMessage
  const g = getGame(room, uuid)

  if (!g) {
    await post({ room, message: `<@uid:${uuid}> No ride in progress. Type \`/rtb <amount>\` to start one!` })
    return
  }

  if (g.mode === 'punishment') {
    await post({ room, message: `<@uid:${uuid}> 🚌 No bailing on the punishment bus. Ride it out!` })
    return
  }

  const mult = CASHOUT_MULT[g.phase]
  if (!mult) {
    await post({ room, message: `<@uid:${uuid}> 🚌 Answer the first question before you can cash out!` })
    return
  }

  clearTimer(g)
  return _doCashout(g, deps)
}

// ─────────────────────────────────────────────────────────────
// Question handlers
// ─────────────────────────────────────────────────────────────

async function _q1 (g, answer, deps) {
  const post = deps.postMessage ?? postMessage

  if (answer !== 'red' && answer !== 'black') {
    await post({ room: g.room, message: `<@uid:${g.uuid}> 🔴🖤 Answer with \`/red\` or \`/black\`.` })
    g.timer = setTimeout(() => _onTimeout(g.uuid, g.room, 'q1', deps), ANSWER_MS)
    return
  }

  const card = g.cards[0]
  const isRed = card.isRed
  const colorWord = isRed ? 'RED' : 'BLACK'
  const colorEmoji = isRed ? '🔴' : '🖤'
  const correct = (answer === 'red') === isRed

  if (!correct) {
    const wrongColor = isRed ? 'Red' : 'Black'
    return _doLoss(g, `It's **${cardLabel(card)}**  —  ${colorEmoji} ${wrongColor}`, deps)
  }

  // ✅ Correct — auto-advance to Q2
  g.phase = 'q2'
  g.timer = setTimeout(() => _onTimeout(g.uuid, g.room, 'q2', deps), ANSWER_MS)

  if (g.mode === 'punishment') {
    const recovered = Math.floor(g.bet * PUNISH_RECOVERY[0])
    g.stakeRecovered += recovered
    await creditGameWin(g.uuid, recovered, g.nickname, { source: 'ridethebus', category: 'punishment_recovery' })
    const remaining = g.bet - g.stakeRecovered
    await post({
      room: g.room,
      message: [
        `${colorEmoji} **${colorWord}!**  The card was \`${cardLabel(card)}\`  ✅`,
        `💰 +${fmtMoney(recovered)} returned  ·  ${fmtMoney(remaining)} still on the line`,
        ``,
        `🃏  \`${track(g.cards)}\``,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `📈  **Stop 2 of 4  —  HIGHER or LOWER than ${g.cards[0].rank}?**`,
        `\`/higher\`  ·  \`/lower\``,
        `⏱ ${env.rtbAnswerSecs}s`,
      ].join('\n')
    })
    return
  }

  const cashout = Math.floor(g.bet * CASHOUT_MULT.q2)
  await post({
    room: g.room,
    message: [
      `${colorEmoji} **${colorWord}!**  The card was \`${cardLabel(card)}\`  ✅`,
      ``,
      `🃏  \`${track(g.cards)}\``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `📈  **Stop 2 of 4  —  HIGHER or LOWER than ${g.cards[0].rank}?**`,
      `\`/higher\`  ·  \`/lower\``,
      `💰 \`/cashout\` → ${fmtMoney(cashout)}  ·  ⏱ ${env.rtbAnswerSecs}s`,
    ].join('\n')
  })
}

async function _q2 (g, answer, deps) {
  const post = deps.postMessage ?? postMessage

  if (answer !== 'higher' && answer !== 'lower') {
    await post({ room: g.room, message: `<@uid:${g.uuid}> 📈 Answer with \`/higher\` or \`/lower\`.` })
    g.timer = setTimeout(() => _onTimeout(g.uuid, g.room, 'q2', deps), ANSWER_MS)
    return
  }

  const newCard = g.deck.pop()
  g.cards.push(newCard)
  const base = g.cards[0]
  const result = newCard.value > base.value ? 'higher' : newCard.value < base.value ? 'lower' : 'tie'

  if (result === 'tie' || result !== answer) {
    const note = result === 'tie'
      ? `**${cardLabel(newCard)}** matched the ${base.rank}  —  house wins ties`
      : `**${cardLabel(newCard)}** is ${result} than ${base.rank}`
    return _doLoss(g, note, deps)
  }

  // ✅ Correct — auto-advance to Q3
  g.phase = 'q3'
  g.timer = setTimeout(() => _onTimeout(g.uuid, g.room, 'q3', deps), ANSWER_MS)
  const dirEmoji = answer === 'higher' ? '⬆️' : '⬇️'
  const [c1, c2] = g.cards
  const loRank = c1.value <= c2.value ? c1.rank : c2.rank
  const hiRank = c1.value >= c2.value ? c1.rank : c2.rank

  if (g.mode === 'punishment') {
    const recovered = Math.floor(g.bet * PUNISH_RECOVERY[1])
    g.stakeRecovered += recovered
    await creditGameWin(g.uuid, recovered, g.nickname, { source: 'ridethebus', category: 'punishment_recovery' })
    const remaining = g.bet - g.stakeRecovered
    await post({
      room: g.room,
      message: [
        `${dirEmoji} **${answer.toUpperCase()}!**  \`${cardLabel(newCard)}\` vs ${base.rank}  ✅`,
        `💰 +${fmtMoney(recovered)} returned  ·  ${fmtMoney(remaining)} still on the line`,
        ``,
        `🃏  \`${track(g.cards)}\``,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `📊  **Stop 3 of 4  —  INSIDE or OUTSIDE?**`,
        `Between **${loRank}** and **${hiRank}**  *(ties go to the house)*`,
        `\`/inside\`  ·  \`/outside\``,
        `⏱ ${env.rtbAnswerSecs}s`,
      ].join('\n')
    })
    return
  }

  const cashout = Math.floor(g.bet * CASHOUT_MULT.q3)
  await post({
    room: g.room,
    message: [
      `${dirEmoji} **${answer.toUpperCase()}!**  \`${cardLabel(newCard)}\` vs ${base.rank}  ✅`,
      ``,
      `🃏  \`${track(g.cards)}\``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `📊  **Stop 3 of 4  —  INSIDE or OUTSIDE?**`,
      `Between **${loRank}** and **${hiRank}**  *(ties go to the house)*`,
      `\`/inside\`  ·  \`/outside\``,
      `💰 \`/cashout\` → ${fmtMoney(cashout)}  ·  ⏱ ${env.rtbAnswerSecs}s`,
    ].join('\n')
  })
}

async function _q3 (g, answer, deps) {
  const post = deps.postMessage ?? postMessage

  if (answer !== 'inside' && answer !== 'outside') {
    await post({ room: g.room, message: `<@uid:${g.uuid}> 📊 Answer with \`/inside\` or \`/outside\`.` })
    g.timer = setTimeout(() => _onTimeout(g.uuid, g.room, 'q3', deps), ANSWER_MS)
    return
  }

  const newCard = g.deck.pop()
  g.cards.push(newCard)
  const [c1, c2] = g.cards
  const lo = Math.min(c1.value, c2.value)
  const hi = Math.max(c1.value, c2.value)

  let result
  if (newCard.value > lo && newCard.value < hi) result = 'inside'
  else if (newCard.value === lo || newCard.value === hi) result = 'tie'
  else result = 'outside'

  if (result === 'tie' || result !== answer) {
    const note = result === 'tie'
      ? `**${cardLabel(newCard)}** hit the boundary  —  house wins ties`
      : `**${cardLabel(newCard)}** is ${result}`
    return _doLoss(g, note, deps)
  }

  // ✅ Correct — auto-advance to Q4
  g.phase = 'q4'
  g.timer = setTimeout(() => _onTimeout(g.uuid, g.room, 'q4', deps), ANSWER_MS)

  if (g.mode === 'punishment') {
    const recovered = Math.floor(g.bet * PUNISH_RECOVERY[2])
    g.stakeRecovered += recovered
    await creditGameWin(g.uuid, recovered, g.nickname, { source: 'ridethebus', category: 'punishment_recovery' })
    const remaining = g.bet - g.stakeRecovered
    const winAmount = Math.floor(g.bet * PUNISH_RECOVERY[3])
    await post({
      room: g.room,
      message: [
        `✅  **${answer.toUpperCase()}!**  \`${cardLabel(newCard)}\`  —  one stop left! 🔥`,
        `💰 +${fmtMoney(recovered)} returned  ·  ${fmtMoney(remaining)} still on the line`,
        ``,
        `🃏  \`${track(g.cards)}\``,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `🎯  **FINAL STOP  —  GUESS THE SUIT!**`,
        `Nail it and get the last ${fmtMoney(remaining)} back  **+${fmtMoney(winAmount - remaining)} profit** 🤑`,
        `♥ \`/hearts\`   ♦ \`/diamonds\`   ♣ \`/clubs\`   ♠ \`/spades\``,
        `⏱ ${env.rtbAnswerSecs}s`,
      ].join('\n')
    })
    return
  }

  const cashout = Math.floor(g.bet * CASHOUT_MULT.q4)
  await post({
    room: g.room,
    message: [
      `✅  **${answer.toUpperCase()}!**  \`${cardLabel(newCard)}\`  —  you're on fire! 🔥`,
      ``,
      `🃏  \`${track(g.cards)}\``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `🎯  **FINAL STOP  —  GUESS THE SUIT!**`,
      `25% shot at **10×** your bet 🤑`,
      `♥ \`/hearts\`   ♦ \`/diamonds\`   ♣ \`/clubs\`   ♠ \`/spades\``,
      `💰 \`/cashout\` → ${fmtMoney(cashout)}  ·  ⏱ ${env.rtbAnswerSecs}s`,
    ].join('\n')
  })
}

async function _q4 (g, answer, deps) {
  const post = deps.postMessage ?? postMessage
  const suitMap = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }

  if (!suitMap[answer]) {
    await post({ room: g.room, message: `<@uid:${g.uuid}> 🎯 Answer with \`/hearts\`, \`/diamonds\`, \`/clubs\`, or \`/spades\`.` })
    g.timer = setTimeout(() => _onTimeout(g.uuid, g.room, 'q4', deps), ANSWER_MS)
    return
  }

  const newCard = g.deck.pop()
  g.cards.push(newCard)
  const guessed = suitMap[answer]

  if (newCard.suit !== guessed) {
    return _doLoss(g, `**${cardLabel(newCard)}**  —  you guessed ${guessed}`, deps)
  }

  const uuid = g.uuid
  const nick = g.nickname
  const bet = g.bet
  const cards = [...g.cards]
  const room = g.room

  if (g.mode === 'punishment') {
    const finalRecovery = Math.floor(bet * PUNISH_RECOVERY[3])
    const totalReturned = g.stakeRecovered + finalRecovery
    const profit = totalReturned - bet
    deleteGame(room, uuid)
    await creditGameWin(uuid, finalRecovery, nick, { source: 'ridethebus', category: 'punishment_recovery' })
    await post({
      room,
      message: [
        `🎉🚌🎉  **SURVIVED THE PUNISHMENT BUS!**  🎉🚌🎉`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `🃏  \`${track(cards)}\``,
        ``,
        `💰  Got **${fmtMoney(totalReturned)}** back on a **${fmtMoney(bet)}** stake`,
        `📈  Net: **+${fmtMoney(profit)}**  —  punishment paid off! 😤`,
      ].join('\n')
    })
    return
  }

  // 🎉 SWEEP!
  const payout = Math.floor(bet * 10)
  deleteGame(room, uuid)

  await creditGameWin(uuid, payout, nick, { source: 'ridethebus', category: 'win_sweep' })

  await post({
    room,
    message: [
      `🎉🚌🎉  **SWEPT THE BUS!**  🎉🚌🎉`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `🃏  \`${track(cards)}\``,
      ``,
      `💥  **${fmtMoney(bet)} × 10 = ${fmtMoney(payout)}!**`,
      ``,
      `legendary ride 🔥  type \`/rtb <amount>\` to go again!`,
    ].join('\n')
  })
}

// ─────────────────────────────────────────────────────────────
// Cashout / Loss
// ─────────────────────────────────────────────────────────────

async function _doCashout (g, deps) {
  const post = deps.postMessage ?? postMessage
  const mult = CASHOUT_MULT[g.phase]
  const payout = Math.floor(g.bet * mult)
  const profit = payout - g.bet
  const uuid = g.uuid
  const nick = g.nickname
  const bet = g.bet
  const cards = [...g.cards]
  const room = g.room
  deleteGame(room, uuid)

  await creditGameWin(uuid, payout, nick, { source: 'ridethebus', category: 'win_cashout' })

  await post({
    room,
    message: [
      `💰  **CASHED OUT!**  smart move 😏`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `🃏  \`${track(cards)}\``,
      ``,
      `**${fmtMoney(bet)} → ${fmtMoney(payout)}**  *(+${fmtMoney(profit)} · ${mult}×)*`,
      ``,
      `type \`/rtb <amount>\` to ride again!`,
    ].join('\n')
  })
}

async function _doLoss (g, reason, deps) {
  const post = deps.postMessage ?? postMessage
  const cards = [...g.cards]
  const mention = `<@uid:${g.uuid}>`
  const bet = g.bet
  const room = g.room
  const isPunishment = g.mode === 'punishment'
  const netLoss = isPunishment ? bet - g.stakeRecovered : bet
  deleteGame(room, g.uuid)

  if (isPunishment) {
    await post({
      room,
      message: [
        `💀  **WRONG!**  ${reason}`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `🃏  \`${track(cards)}\``,
        ``,
        `${mention}  forfeited the remaining **${fmtMoney(netLoss)}**  😬`,
        g.stakeRecovered > 0 ? `*(recovered ${fmtMoney(g.stakeRecovered)} before failing)*` : ``,
      ].filter(Boolean).join('\n')
    })
    return
  }

  await post({
    room,
    message: [
      `💀  **WRONG!**  ${reason}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `🃏  \`${track(cards)}\``,
      ``,
      `${mention}  lost **${fmtMoney(bet)}**  😬`,
      ``,
      `tough luck · type \`/rtb <amount>\` to try again!`,
    ].join('\n')
  })
}

// ─────────────────────────────────────────────────────────────
// Timeout
// ─────────────────────────────────────────────────────────────

async function _onTimeout (uuid, room, phase, deps) {
  const post = deps.postMessage ?? postMessage
  const g = getGame(room, uuid)
  if (!g || g.phase !== phase) return

  const bet = g.bet
  const isPunishment = g.mode === 'punishment'
  const netLoss = isPunishment ? bet - g.stakeRecovered : bet
  deleteGame(room, uuid)

  if (isPunishment) {
    await post({
      room,
      message: [
        `⏱💨  **TIME'S UP!**`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `<@uid:${uuid}> fell asleep on the punishment bus 🚌😴`,
        ``,
        `Forfeited: **${fmtMoney(netLoss)}**`,
        g.stakeRecovered > 0 ? `*(recovered ${fmtMoney(g.stakeRecovered)} before timing out)*` : ``,
      ].filter(Boolean).join('\n')
    })
    return
  }

  await post({
    room,
    message: [
      `⏱💨  **TIME'S UP!**`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `<@uid:${uuid}> fell asleep at the wheel 🚌😴`,
      ``,
      `Lost: **${fmtMoney(bet)}**`,
      `type \`/rtb <amount>\` to try again!`,
    ].join('\n')
  })
}
