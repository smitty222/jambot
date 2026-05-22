// src/games/ridethebus/rideTheBus.js
import { postMessage } from '../../libs/cometchat.js'
import { getUserWallet, debitGameBet, creditGameWin } from '../../database/dbwalletmanager.js'
import { env } from '../../config.js'

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────
const MIN_BET = env.rtbMinBet
const MAX_BET = env.rtbMaxBet
const ANSWER_MS = env.rtbAnswerSecs * 1000
const DECIDE_MS = env.rtbDecideSecs * 1000

// Payout multipliers at each stage
const MULT = { q1: 1.5, q2: 2.0, q3: 3.5, q4: 10.0 }

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

const divider = () => '━━━━━━━━━━━━━━━━━━━━━━'

// ─────────────────────────────────────────────────────────────
// State  (per-player, keyed by `${room}:${uuid}`)
// ─────────────────────────────────────────────────────────────
const GAMES = new Map()

const gameKey  = (room, uuid) => `${room}:${uuid}`
const getGame  = (room, uuid) => GAMES.get(gameKey(room, uuid))
const setGame  = (room, uuid, g) => GAMES.set(gameKey(room, uuid), g)

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

export async function startGame (uuid, nickname, room, betStr, deps = {}) {
  const post = deps.postMessage ?? postMessage

  if (getGame(room, uuid)) {
    await post({ room, message: `<@uid:${uuid}> You already have a game in progress! Answer the current question or wait for it to time out.` })
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
    await post({ room, message: `<@uid:${uuid}> Not enough coins! You have ${fmtMoney(balance)}.` })
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
  g.timer = setTimeout(() => _onAnswerTimeout(uuid, room, 'q1', deps), ANSWER_MS)

  await post({
    room,
    message: [
      '🚌 **RIDE THE BUS**',
      divider(),
      `Bet: **${fmtMoney(amount)}**`,
      '',
      `Card 1: \`${cardLabel(firstCard)}\``,
      '',
      '**Q1 — Red or Black?**',
      `\`/rtb red\`  or  \`/rtb black\`  *(${env.rtbAnswerSecs}s)*`,
    ].join('\n')
  })
}

export async function handleAnswer (uuid, nickname, room, answer, deps = {}) {
  const post = deps.postMessage ?? postMessage
  const g = getGame(room, uuid)

  if (!g) {
    await post({ room, message: `<@uid:${uuid}> No game in progress. Type \`/rtb <amount>\` to start one!` })
    return
  }

  clearTimer(g)

  const { phase } = g
  if (phase === 'q1') return _q1(g, answer, deps)
  if (phase === 'q2') return _q2(g, answer, deps)
  if (phase === 'q3') return _q3(g, answer, deps)
  if (phase === 'q4') return _q4(g, answer, deps)

  if (phase.endsWith('_decide')) {
    await post({ room, message: `<@uid:${uuid}> Type \`/rtb cashout\` or \`/rtb continue\`.` })
    g.timer = setTimeout(() => _onDecideTimeout(uuid, room, deps), DECIDE_MS)
  }
}

export async function handleDecision (uuid, nickname, room, decision, deps = {}) {
  const post = deps.postMessage ?? postMessage
  const g = getGame(room, uuid)

  if (!g) {
    await post({ room, message: `<@uid:${uuid}> No game in progress. Type \`/rtb <amount>\` to start one!` })
    return
  }

  if (!g.phase.endsWith('_decide')) {
    await post({ room, message: `<@uid:${uuid}> Answer the current question first before cashing out or continuing.` })
    return
  }

  clearTimer(g)

  if (decision === 'cashout') return _doCashout(g, deps)
  if (decision === 'continue') return _advance(g, deps)
}

// ─────────────────────────────────────────────────────────────
// Question handlers (private)
// ─────────────────────────────────────────────────────────────

async function _q1 (g, answer, deps) {
  const post = deps.postMessage ?? postMessage

  if (answer !== 'red' && answer !== 'black') {
    await post({ room: g.room, message: `<@uid:${g.uuid}> Answer with \`/rtb red\` or \`/rtb black\`.` })
    g.timer = setTimeout(() => _onAnswerTimeout(g.uuid, g.room, 'q1', deps), ANSWER_MS)
    return
  }

  const card = g.cards[0]
  const colorLabel = card.isRed ? 'Red ♥♦' : 'Black ♠♣'
  const correct = (answer === 'red') === card.isRed

  if (!correct) {
    return _doLoss(g, `\`${cardLabel(card)}\` is ${colorLabel} — you guessed **${answer}**.`, deps)
  }

  const cashout = Math.floor(g.bet * MULT.q1)
  g.phase = 'q1_decide'
  g.timer = setTimeout(() => _onDecideTimeout(g.uuid, g.room, deps), DECIDE_MS)

  await post({
    room: g.room,
    message: [
      `✅ **${answer === 'red' ? 'Red' : 'Black'}!** — \`${cardLabel(card)}\` is ${colorLabel}.`,
      divider(),
      `💰 Cash out: **${fmtMoney(cashout)}** (1.5×)`,
      `Or keep riding for **2×** or more...`,
      '',
      `\`/rtb cashout\`  or  \`/rtb continue\`  *(${env.rtbDecideSecs}s — auto-cashout on timeout)*`,
    ].join('\n')
  })
}

async function _q2 (g, answer, deps) {
  const post = deps.postMessage ?? postMessage

  if (answer !== 'higher' && answer !== 'lower') {
    await post({ room: g.room, message: `<@uid:${g.uuid}> Answer with \`/rtb higher\` or \`/rtb lower\`.` })
    g.timer = setTimeout(() => _onAnswerTimeout(g.uuid, g.room, 'q2', deps), ANSWER_MS)
    return
  }

  const newCard = g.deck.pop()
  g.cards.push(newCard)
  const base = g.cards[0]
  const result = newCard.value > base.value ? 'higher' : newCard.value < base.value ? 'lower' : 'tie'

  if (result === 'tie' || result !== answer) {
    const note = result === 'tie'
      ? `\`${cardLabel(newCard)}\` ties \`${base.rank}\` — house wins ties`
      : `\`${cardLabel(newCard)}\` is ${result} than \`${base.rank}\``
    return _doLoss(g, `${note} — you guessed **${answer}**.`, deps)
  }

  const cashout = Math.floor(g.bet * MULT.q2)
  g.phase = 'q2_decide'
  g.timer = setTimeout(() => _onDecideTimeout(g.uuid, g.room, deps), DECIDE_MS)

  await post({
    room: g.room,
    message: [
      `✅ **${answer === 'higher' ? 'Higher' : 'Lower'}!** — \`${cardLabel(newCard)}\` is ${answer} than \`${base.rank}\`.`,
      divider(),
      `Cards: \`${g.cards.map(cardLabel).join('  ')}\``,
      '',
      `💰 Cash out: **${fmtMoney(cashout)}** (2×)`,
      `Or keep riding for **3.5×** or more...`,
      '',
      `\`/rtb cashout\`  or  \`/rtb continue\`  *(${env.rtbDecideSecs}s — auto-cashout on timeout)*`,
    ].join('\n')
  })
}

async function _q3 (g, answer, deps) {
  const post = deps.postMessage ?? postMessage

  if (answer !== 'inside' && answer !== 'outside') {
    await post({ room: g.room, message: `<@uid:${g.uuid}> Answer with \`/rtb inside\` or \`/rtb outside\`.` })
    g.timer = setTimeout(() => _onAnswerTimeout(g.uuid, g.room, 'q3', deps), ANSWER_MS)
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
      ? `\`${cardLabel(newCard)}\` landed on the boundary — house wins ties`
      : `\`${cardLabel(newCard)}\` is ${result}`
    return _doLoss(g, `${note} — you guessed **${answer}**.`, deps)
  }

  const cashout = Math.floor(g.bet * MULT.q3)
  g.phase = 'q3_decide'
  g.timer = setTimeout(() => _onDecideTimeout(g.uuid, g.room, deps), DECIDE_MS)

  await post({
    room: g.room,
    message: [
      `✅ **${answer === 'inside' ? 'Inside' : 'Outside'}!** — \`${cardLabel(newCard)}\` is ${answer} the range.`,
      divider(),
      `Cards: \`${g.cards.map(cardLabel).join('  ')}\``,
      '',
      `💰 Cash out: **${fmtMoney(cashout)}** (3.5×)`,
      `🔥 One more card for **10×!**`,
      '',
      `\`/rtb cashout\`  or  \`/rtb continue\`  *(${env.rtbDecideSecs}s — auto-cashout on timeout)*`,
    ].join('\n')
  })
}

async function _q4 (g, answer, deps) {
  const post = deps.postMessage ?? postMessage
  const suitMap = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }

  if (!suitMap[answer]) {
    await post({ room: g.room, message: `<@uid:${g.uuid}> Answer with \`/rtb hearts\`, \`/rtb diamonds\`, \`/rtb clubs\`, or \`/rtb spades\`.` })
    g.timer = setTimeout(() => _onAnswerTimeout(g.uuid, g.room, 'q4', deps), ANSWER_MS)
    return
  }

  const newCard = g.deck.pop()
  g.cards.push(newCard)
  const guessed = suitMap[answer]

  if (newCard.suit !== guessed) {
    return _doLoss(g, `\`${cardLabel(newCard)}\` — it was **${newCard.suit}**, you guessed **${guessed}**.`, deps)
  }

  // SWEEP!
  const payout = Math.floor(g.bet * MULT.q4)
  const nick = g.nickname
  const uuid = g.uuid
  deleteGame(g.room, g.uuid)

  await creditGameWin(uuid, payout, nick, { source: 'ridethebus', category: 'win_sweep' })

  await post({
    room: g.room,
    message: [
      `🎉 **SWEPT THE BUS!** 🎉`,
      divider(),
      `\`${g.cards.map(cardLabel).join('  ')}\``,
      '',
      `${fmtMoney(g.bet)} × 10 = **${fmtMoney(payout)}!** 💰`,
    ].join('\n')
  })
}

// ─────────────────────────────────────────────────────────────
// Advance to next question
// ─────────────────────────────────────────────────────────────

async function _advance (g, deps) {
  const post = deps.postMessage ?? postMessage

  if (g.phase === 'q1_decide') {
    g.phase = 'q2'
    g.timer = setTimeout(() => _onAnswerTimeout(g.uuid, g.room, 'q2', deps), ANSWER_MS)
    await post({
      room: g.room,
      message: [
        '🚌 **RIDE THE BUS — Q2**',
        divider(),
        `Cards: \`${g.cards.map(cardLabel).join('  ')}\` → \`[???]\``,
        '',
        `**Higher or Lower than \`${g.cards[0].rank}\`?**`,
        `\`/rtb higher\`  or  \`/rtb lower\`  *(${env.rtbAnswerSecs}s)*`,
      ].join('\n')
    })
    return
  }

  if (g.phase === 'q2_decide') {
    g.phase = 'q3'
    g.timer = setTimeout(() => _onAnswerTimeout(g.uuid, g.room, 'q3', deps), ANSWER_MS)
    const [c1, c2] = g.cards
    const loRank = c1.value <= c2.value ? c1.rank : c2.rank
    const hiRank = c1.value >= c2.value ? c1.rank : c2.rank
    await post({
      room: g.room,
      message: [
        '🚌 **RIDE THE BUS — Q3**',
        divider(),
        `Cards: \`${g.cards.map(cardLabel).join('  ')}\` → \`[???]\``,
        '',
        `**Inside or Outside \`${loRank}\`–\`${hiRank}\`?**  *(inside = strictly between)*`,
        `\`/rtb inside\`  or  \`/rtb outside\`  *(${env.rtbAnswerSecs}s)*`,
      ].join('\n')
    })
    return
  }

  if (g.phase === 'q3_decide') {
    g.phase = 'q4'
    g.timer = setTimeout(() => _onAnswerTimeout(g.uuid, g.room, 'q4', deps), ANSWER_MS)
    await post({
      room: g.room,
      message: [
        '🚌 **RIDE THE BUS — Q4 (FINAL)**',
        divider(),
        `Cards: \`${g.cards.map(cardLabel).join('  ')}\` → \`[???]\``,
        '',
        `**What suit?**  *(25% chance — 10× payout!)*`,
        `\`/rtb hearts\`  \`/rtb diamonds\`  \`/rtb clubs\`  \`/rtb spades\``,
        `*(${env.rtbAnswerSecs}s)*`,
      ].join('\n')
    })
  }
}

// ─────────────────────────────────────────────────────────────
// Cashout / Loss helpers
// ─────────────────────────────────────────────────────────────

async function _doCashout (g, deps) {
  const post = deps.postMessage ?? postMessage
  const multMap = { q1_decide: MULT.q1, q2_decide: MULT.q2, q3_decide: MULT.q3 }
  const payout = Math.floor(g.bet * multMap[g.phase])
  const profit = payout - g.bet
  const nick = g.nickname
  const uuid = g.uuid
  deleteGame(g.room, g.uuid)

  await creditGameWin(uuid, payout, nick, { source: 'ridethebus', category: 'win_cashout' })

  await post({
    room: g.room,
    message: [
      `💰 **Cashed out!**`,
      divider(),
      `\`${g.cards.map(cardLabel).join('  ')}\``,
      '',
      `Won: **${fmtMoney(payout)}** (+${fmtMoney(profit)})`,
    ].join('\n')
  })
}

async function _doLoss (g, reason, deps) {
  const post = deps.postMessage ?? postMessage
  const cards = g.cards.map(cardLabel).join('  ')
  const mention = `<@uid:${g.uuid}>`
  deleteGame(g.room, g.uuid)

  await post({
    room: g.room,
    message: [
      `❌ **Wrong!** — ${reason}`,
      divider(),
      `\`${cards}\``,
      '',
      `${mention} Lost: **${fmtMoney(g.bet)}**`,
      `Type \`/rtb <amount>\` to try again.`,
    ].join('\n')
  })
}

// ─────────────────────────────────────────────────────────────
// Timeout handlers
// ─────────────────────────────────────────────────────────────

async function _onAnswerTimeout (uuid, room, phase, deps) {
  const post = deps.postMessage ?? postMessage
  const g = getGame(room, uuid)
  if (!g || g.phase !== phase) return

  const bet = g.bet
  deleteGame(room, uuid)

  await post({
    room,
    message: [
      `⏱ **Time's up!**`,
      divider(),
      `<@uid:${uuid}> Took too long — lost **${fmtMoney(bet)}**.`,
      `Type \`/rtb <amount>\` to try again.`,
    ].join('\n')
  })
}

async function _onDecideTimeout (uuid, room, deps) {
  const g = getGame(room, uuid)
  if (!g || !g.phase.endsWith('_decide')) return
  await _doCashout(g, deps)
}
