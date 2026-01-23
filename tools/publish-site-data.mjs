// tools/publish-site-data.mjs
import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import process from 'process'
import { getCryptoPrice } from '../src/utils/cryptoPrice.js'
import { publishDbSnapshot } from './publishSnapshot.js'

// ── Resolve API + auth ───────────────────────────────────────
const API_BASE = process.env.API_BASE
const PUBLISH_TOKEN = process.env.PUBLISH_TOKEN

// ── Resolve DB path robustly (prefer Fly volume) ─────────────
const FLY_DATA_DIR = '/data'
const RESOLVED_DB_PATH =
  process.env.DB_PATH ||
  (fs.existsSync(FLY_DATA_DIR) ? path.join(FLY_DATA_DIR, 'app.db') : path.resolve('src/data/app.db'))

// make it visible to anything we import
process.env.DB_PATH = RESOLVED_DB_PATH
console.log('[publish] Using DB_PATH =', process.env.DB_PATH)

// Ensure schema/migrations are loaded for this process too
// (IMPORTANT: path must match actual file name exactly on Linux)
await import(new URL('../src/database/initdb.js', import.meta.url))

// ── Cooldowns ────────────────────────────────────────────────
const COOLDOWN_MINUTES_DB = Number(process.env.PUBLISH_DB_EVERY_MIN || 240)
const COOLDOWN_MINUTES_COMMANDS = Number(process.env.PUBLISH_CMDS_EVERY_MIN || 240)
const COOLDOWN_MINUTES_STATS = Number(process.env.PUBLISH_STATS_EVERY_MIN || 240)
// Publish album stats more frequently to keep the website up‑to‑date.  This can
// be overridden via the PUBLISH_ALBUMS_EVERY_MIN environment variable.  A
// reasonable default of 10 minutes means that new reviews will be visible on
// the site within a short window without spamming the API.
const COOLDOWN_MINUTES_ALBUMS = Number(process.env.PUBLISH_ALBUMS_EVERY_MIN || 10)
const COOLDOWN_MINUTES_SITEDATA = Number(process.env.PUBLISH_SITEDATA_EVERY_MIN || 10)
const COOLDOWN_MINUTES_SONGS = Number(process.env.PUBLISH_SONGS_EVERY_MIN || 10)
const COOLDOWN_MINUTES_WRAPPED = Number(process.env.PUBLISH_WRAPPED_EVERY_MIN || 60)
const COOLDOWN_MINUTES_PGA = Number(process.env.PUBLISH_PGA_EVERY_MIN || 10)
// DJ wrapped limits (safe defaults)
const WRAPPED_DJ_LIMIT = Number(process.env.WRAPPED_DJ_LIMIT || 200) // how many DJs we track per year
const WRAPPED_DJ_TOP_SONGS = Number(process.env.WRAPPED_DJ_TOP_SONGS || 50) // per DJ
const WRAPPED_DJ_TOP_ARTISTS = Number(process.env.WRAPPED_DJ_TOP_ARTISTS || 50) // per DJ

// Persist state on the volume so cooldowns survive restarts
const STATE_FILE = process.env.PUBLISH_STATE_FILE ||
  (fs.existsSync(FLY_DATA_DIR) ? path.join(FLY_DATA_DIR, '.publish-state.json') : path.resolve('.publish-state.json'))

function loadState () {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) } catch { return { last: {} } }
}
function saveState (state) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)) } catch {}
}
function minutesSince (ts) {
  if (!ts) return Infinity
  const diffMs = Date.now() - new Date(ts).getTime()
  return diffMs / 60000
}

function tryReadJson (p) { try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return null } }
const commands = tryReadJson(process.env.COMMANDS_JSON || 'site/commands.public.json') || []
const commands_mod = tryReadJson(process.env.COMMANDS_MOD_JSON || 'site/commands.mod.json') || []

async function postJson (pathname, payload) {
  if (!API_BASE || !PUBLISH_TOKEN) {
    throw new Error('Missing API_BASE or PUBLISH_TOKEN')
  }
  const res = await fetch(`${API_BASE}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${PUBLISH_TOKEN}` },
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error(`${pathname} ${res.status}: ${await res.text()}`)
  return res.json()
}

// ── Publish: Craps records (public) ───────────────────────────
async function publishCrapsRecords (state) {
  if (minutesSince(state.last?.craps) < COOLDOWN_MINUTES_STATS) {
    console.log('[publish] crapsRecords skipped (cooldown)')
    return
  }

  console.log('[publish] crapsRecords snapshot from', process.env.DB_PATH)
  const db = new Database(process.env.DB_PATH, { readonly: true })

  try {
    const rows = db.prepare(`
      SELECT
  cr.maxRolls,
  cr.shooterId,
  COALESCE(
    NULLIF(TRIM(u.nickname), ''),
    NULLIF(TRIM(cr.shooterNickname), ''),
    cr.shooterId,
    '—'
  ) AS shooterNickname,
  cr.achievedAt
FROM craps_records cr
LEFT JOIN users u ON u.uuid = cr.shooterId
WHERE cr.maxRolls > 0
ORDER BY cr.maxRolls DESC

    `).all()

    await postJson('/api/publishDb', {
      tables: {
        craps_records_public: rows
      },
      public: ['craps_records_public']
    })

    state.last.craps = new Date().toISOString()
    saveState(state)

    console.log('[publish] crapsRecords published:', rows.length)
  } catch (err) {
    console.warn('[publish] crapsRecords failed:', err?.message || err)
  } finally {
    db.close()
  }
}

// ── Publish: PGA leaderboard + latest event meta (public) ────────────────
async function publishPga (state) {
  if (minutesSince(state.last?.pga) < COOLDOWN_MINUTES_PGA) {
    console.log('[publish] pga skipped (cooldown)')
    return
  }

  console.log('[publish] pga snapshot from', process.env.DB_PATH)
  const db = new Database(process.env.DB_PATH, { readonly: true })

  try {
    // Latest event we’ve seen (or finalized most recently)
    const event = db.prepare(`
      SELECT
        eventId,
        eventName,
        status,
        season,
        startDate,
        endDate,
        source,
        lastSeenAt,
        finalizedAt
      FROM pga_events
      ORDER BY
        CASE WHEN finalizedAt IS NOT NULL AND TRIM(finalizedAt) <> '' THEN 1 ELSE 0 END DESC,
        datetime(COALESCE(finalizedAt, lastSeenAt)) DESC
      LIMIT 1
    `).get()

    if (!event?.eventId) {
      // Don’t publish empty tables; just record cooldown so we don’t spam logs
      state.last.pga = new Date().toISOString()
      saveState(state)
      console.log('[publish] pga: no event found')
      return
    }

    // Top 50 leaderboard for that event (you can change this)
    const LIMIT = Number(process.env.PGA_PUBLISH_LIMIT || 50)

    const leaderboard = db.prepare(`
      SELECT
        r.eventId,
        r.athleteId,
        r.playerName,
        r.pos,
        r.toPar,
        r.status,
        r.thru,
        r.sortOrder,
        r.movement,
        r.earnings,
        r.cupPoints,
        r.r1, r.r2, r.r3, r.r4,
        r.updatedAt
      FROM pga_event_results r
      WHERE r.eventId = ?
      ORDER BY
        COALESCE(r.sortOrder, 999999) ASC,
        r.playerName ASC
      LIMIT ?
    `).all(event.eventId, LIMIT)

    // A small "summary" object the site can render easily
    const summary = {
      eventId: event.eventId,
      eventName: event.eventName,
      status: event.status,
      finalized: !!(event.finalizedAt && String(event.finalizedAt).trim()),
      finalizedAt: event.finalizedAt || null,
      lastSeenAt: event.lastSeenAt || null,
      updatedAt: new Date().toISOString(),
      count: leaderboard.length
    }

    await postJson('/api/publishDb', {
      tables: {
        pga_event_public: event,
        pga_leaderboard_public: leaderboard,
        pga_summary_public: summary
      },
      public: ['pga_event_public', 'pga_leaderboard_public', 'pga_summary_public']
    })

    state.last.pga = summary.updatedAt
    saveState(state)

    console.log('[publish] pga published:', event.eventName, 'rows:', leaderboard.length)
  } catch (err) {
    console.warn('[publish] pga failed:', err?.message || err)
  } finally {
    db.close()
  }
}


// ── Publish: Horse Hall of Fame (public) ──────────────────────
async function publishHorseHallOfFame (state) {
  if (minutesSince(state.last?.horseHof) < COOLDOWN_MINUTES_STATS) {
    console.log('[publish] horseHof skipped (cooldown)')
    return
  }

  console.log('[publish] horseHof snapshot from', process.env.DB_PATH)
  const db = new Database(process.env.DB_PATH, { readonly: true })

  try {
    const LIMIT = Number(process.env.HORSE_HOF_LIMIT || 50)

    // Match dbhorsehof.js defaults/behavior:
    // - exclude bots/house by default (ownerId must be present)
    // - must be retired
    // - win% must meet threshold
    const MIN_WIN_PCT = (() => {
      const raw = Number(process.env.HORSE_HOF_MIN_WIN_PCT ?? 0.35)
      return Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0.35
    })()

    const rows = db.prepare(`
      SELECT
        h.id,
        h.name,
        h.emoji,
        h.tier,
        h.ownerId,
        COALESCE(NULLIF(TRIM(u.nickname), ''), NULLIF(TRIM(h.nickname), ''), NULLIF(TRIM(h.owner), ''), 'Unknown') AS ownerName,
        h.wins,
        h.racesParticipated AS races,
        ROUND(CASE WHEN COALESCE(h.racesParticipated, 0) > 0
          THEN (CAST(h.wins AS REAL) / CAST(h.racesParticipated AS REAL)) * 100
          ELSE 0 END, 1) AS winRatePct,
        h.retired,
        hh.inducted_at AS inductedAt,
        hh.reason
      FROM horse_hof hh
      JOIN horses h ON h.id = hh.horse_id
      LEFT JOIN users u ON u.uuid = h.ownerId
      WHERE
        -- Exclude House/Bots: ownerId must exist (matches isOwnerHorse + INCLUDE_BOTS=false)
        h.ownerId IS NOT NULL AND TRIM(h.ownerId) <> ''

        -- Must be retired (matches qualifies())
        AND COALESCE(h.retired, 0) = 1

        -- Must meet win% threshold (matches qualifies())
        AND (CASE WHEN COALESCE(h.racesParticipated, 0) > 0
          THEN (CAST(h.wins AS REAL) / CAST(h.racesParticipated AS REAL))
          ELSE 0 END) >= ?

      ORDER BY datetime(hh.inducted_at) DESC, h.wins DESC
      LIMIT ?
    `).all(MIN_WIN_PCT, LIMIT)

    await postJson('/api/publishDb', {
      tables: { horses_hof_public: rows },
      public: ['horses_hof_public']
    })

    state.last.horseHof = new Date().toISOString()
    saveState(state)
    console.log('[publish] horseHof published:', rows.length)
  } catch (err) {
    console.warn('[publish] horseHof failed:', err?.message || err)
  } finally {
    db.close()
  }
}

// ── Publish: User-owned horses (public) ───────────────────────
async function publishUserOwnedHorses (state) {
  if (minutesSince(state.last?.userHorses) < COOLDOWN_MINUTES_STATS) {
    console.log('[publish] userHorses skipped (cooldown)')
    return
  }

  console.log('[publish] userHorses snapshot from', process.env.DB_PATH)
  const db = new Database(process.env.DB_PATH, { readonly: true })

  try {
    const LIMIT = Number(process.env.USER_HORSES_LIMIT || 1000)

    const rows = db.prepare(`
      SELECT
        h.id,
        h.name,
        h.emoji,
        h.tier,
        h.price,
        h.baseOdds,
        h.volatility,
        h.ownerId,
        COALESCE(NULLIF(TRIM(u.nickname), ''), NULLIF(TRIM(h.nickname), ''), NULLIF(TRIM(h.owner), ''), 'Unknown') AS ownerName,
        h.wins,
        h.racesParticipated AS races,
        ROUND(CASE WHEN COALESCE(h.racesParticipated, 0) > 0
          THEN (CAST(h.wins AS REAL) / CAST(h.racesParticipated AS REAL)) * 100
          ELSE 0 END, 1) AS winRatePct,
        CASE WHEN COALESCE(h.retired, 0) = 1 THEN 'retired' ELSE 'active' END AS status,

        -- helpful: whether they are inducted into HoF
        CASE WHEN hh.horse_id IS NOT NULL THEN 1 ELSE 0 END AS inducted,
        hh.inducted_at AS inductedAt
      FROM horses h
      LEFT JOIN users u ON u.uuid = h.ownerId
      LEFT JOIN horse_hof hh ON hh.horse_id = h.id
      WHERE
        -- ignore house/bot horses: must have an ownerId
        h.ownerId IS NOT NULL AND TRIM(h.ownerId) <> ''
      ORDER BY
        status ASC,          -- active first
        inducted DESC,       -- inductees bubble up
        h.wins DESC,
        h.racesParticipated DESC,
        h.name ASC
      LIMIT ?
    `).all(LIMIT)

    await postJson('/api/publishDb', {
      tables: { user_horses_public: rows },
      public: ['user_horses_public']
    })

    state.last.userHorses = new Date().toISOString()
    saveState(state)
    console.log('[publish] userHorses published:', rows.length)
  } catch (err) {
    console.warn('[publish] userHorses failed:', err?.message || err)
  } finally {
    db.close()
  }
}

// ── Publish: Lottery winners (public) ─────────────────────────
async function publishLotteryWinners (state) {
  // Reuse the games/stats cooldown or make a dedicated one if you prefer
  if (minutesSince(state.last?.lotteryWinners) < COOLDOWN_MINUTES_STATS) {
    console.log('[publish] lotteryWinners skipped (cooldown)')
    return
  }

  console.log('[publish] lotteryWinners snapshot from', process.env.DB_PATH)
  const db = new Database(process.env.DB_PATH, { readonly: true })

  try {
    const rows = db.prepare(`
      SELECT
        lw.id,
        lw.userId,
        lw.winningNumber,
        lw.amountWon,
        lw.timestamp,

        -- ✅ Prefer CURRENT users.nickname first (so joins/renames fix the site)
        COALESCE(
          NULLIF(TRIM(u.nickname), ''),

          -- If lw.displayName is just a UUID fallback, ignore it
          CASE
            WHEN lw.displayName IS NULL THEN NULL
            WHEN TRIM(lw.displayName) = '' THEN NULL
            WHEN TRIM(lw.displayName) = TRIM(lw.userId) THEN NULL
            ELSE TRIM(lw.displayName)
          END,

          NULLIF(TRIM(lw.nickname), ''),

          -- Final fallback: show userId rather than "unknown"
          lw.userId
        ) AS displayName

      FROM lottery_winners lw
      LEFT JOIN users u
        ON u.uuid = lw.userId
      ORDER BY
        datetime(lw.timestamp) DESC, lw.id DESC
    `).all()

    await postJson('/api/publishDb', {
      tables: { lottery_winners_public: rows },
      public: ['lottery_winners_public']
    })

    state.last.lotteryWinners = new Date().toISOString()
    saveState(state)

    console.log('[publish] lotteryWinners published:', rows.length)
  } catch (err) {
    console.warn('[publish] lotteryWinners failed:', err?.message || err)
  } finally {
    db.close()
  }
}

// ── Publish: Career leaders (lifetime_net) ─────────────────────
async function publishCareerLeaders (state) {
  if (minutesSince(state.last?.career) < COOLDOWN_MINUTES_STATS) {
    console.log('[publish] career skipped (cooldown)')
    return
  }

  console.log('[publish] career snapshot from', process.env.DB_PATH)
  const db = new Database(process.env.DB_PATH, { readonly: true })

  try {
    // IMPORTANT: schema is users.lifetime_net (snake_case)
    // We publish it as lifetimeNet (camelCase) for the site.
    const rows = db.prepare(`
      SELECT
        u.uuid,
        COALESCE(NULLIF(TRIM(u.nickname), ''), u.uuid, 'Unknown') AS nickname,
        COALESCE(u.balance, 0) AS balance,
        COALESCE(u.lifetime_net, 0) AS lifetimeNet
      FROM users u
      WHERE COALESCE(u.lifetime_net, 0) != 0
      ORDER BY lifetimeNet DESC
      LIMIT 1000
    `).all()

    const topGainer = rows.length ? rows[0] : null

    // compute loser explicitly (most negative)
    let topLoser = null
    if (rows.length) {
      topLoser = rows.reduce((min, r) =>
        (min == null || Number(r.lifetimeNet) < Number(min.lifetimeNet)) ? r : min
      , null)
    }

    await postJson('/api/publishDb', {
      tables: {
        career_leaderboard_public: rows,
        // Keep this as an object; your worker should store it fine.
        career_extremes_public: { topGainer, topLoser }
      },
      public: ['career_leaderboard_public', 'career_extremes_public']
    })

    state.last.career = new Date().toISOString()
    saveState(state)

    console.log('[publish] career published:', rows.length)
  } catch (err) {
    console.warn('[publish] career failed:', err?.message || err)
  } finally {
    db.close()
  }
}

// ── Publish: Crypto investing performance (public) ────────────
//
// Computes per-user P/L from crypto_trades:
// - Realized P/L: from SELLs vs average cost at the time of sale
// - Unrealized P/L: current holdings vs cost basis (uses CoinGecko spot price)
//
// Publishes:
// - crypto_leaderboard_public: [{ uuid, nickname, totalPnl, realizedPnl, unrealizedPnl, ... }]
// - crypto_extremes_public: { topWinner, topLoser, updatedAt }
async function publishCryptoPerformance (state) {
  if (minutesSince(state.last?.cryptoPerf) < COOLDOWN_MINUTES_STATS) {
    console.log('[publish] cryptoPerf skipped (cooldown)')
    return
  }

  console.log('[publish] cryptoPerf snapshot from', process.env.DB_PATH)
  const db = new Database(process.env.DB_PATH, { readonly: true })

  try {
    // Pull all trades + nickname (safe fallback to uuid)
    const trades = db.prepare(`
      SELECT
        t.userId AS userId,
        t.coinId AS coinId,
        UPPER(TRIM(COALESCE(p.symbol, ''))) AS symbol,
        UPPER(TRIM(t.side)) AS side,
        COALESCE(t.quantity, 0) AS quantity,
        COALESCE(t.priceUsd, 0) AS priceUsd,
        COALESCE(t.timestamp, '') AS timestamp,
        COALESCE(NULLIF(TRIM(u.nickname), ''), t.userId, 'Unknown') AS nickname
      FROM crypto_trades t
      LEFT JOIN users u ON u.uuid = t.userId
      LEFT JOIN crypto_positions p
        ON p.userId = t.userId AND p.coinId = t.coinId
      WHERE t.userId IS NOT NULL AND TRIM(t.userId) <> ''
        AND t.coinId IS NOT NULL AND TRIM(t.coinId) <> ''
      ORDER BY
        t.userId ASC,
        t.coinId ASC,
        t.timestamp ASC,
        t.id ASC
    `).all()

    if (!Array.isArray(trades) || trades.length === 0) {
      await postJson('/api/publishDb', {
        tables: {
          crypto_leaderboard_public: [],
          crypto_extremes_public: { topWinner: null, topLoser: null, updatedAt: new Date().toISOString() }
        },
        public: ['crypto_leaderboard_public', 'crypto_extremes_public']
      })

      state.last.cryptoPerf = new Date().toISOString()
      saveState(state)
      console.log('[publish] cryptoPerf published: 0 trades')
      return
    }

    // State: user -> coin -> { qty, costBasisUsd, realizedPnlUsd, buysUsd, sellsUsd }
    const perUser = new Map()

    function getUserState (userId, nickname) {
      let u = perUser.get(userId)
      if (!u) {
        u = {
          userId,
          nickname: nickname || userId || 'Unknown',
          coins: new Map()
        }
        perUser.set(userId, u)
      } else if (nickname && u.nickname === u.userId) {
        // upgrade nickname if we only had uuid fallback
        u.nickname = nickname
      }
      return u
    }

    function getCoinState (u, coinId, symbol) {
      let c = u.coins.get(coinId)
      if (!c) {
        c = {
          coinId,
          symbol: (symbol || '').toLowerCase(),
          qty: 0,
          costBasisUsd: 0,
          realizedPnlUsd: 0,
          buysUsd: 0,
          sellsUsd: 0
        }
        u.coins.set(coinId, c)
      } else if (symbol && !c.symbol) {
        c.symbol = String(symbol).toLowerCase()
      }
      return c
    }

    for (const t of trades) {
      const userId = String(t.userId || '').trim()
      const coinId = String(t.coinId || '').trim()
      if (!userId || !coinId) continue

      const nickname = String(t.nickname || userId)
      const side = String(t.side || '').toUpperCase()
      const qty = Number(t.quantity || 0)
      const px = Number(t.priceUsd || 0)

      if (!Number.isFinite(qty) || qty <= 0) continue
      if (!Number.isFinite(px) || px <= 0) continue
      if (side !== 'BUY' && side !== 'SELL') continue

      const u = getUserState(userId, nickname)
      const c = getCoinState(u, coinId, t.symbol)

      if (side === 'BUY') {
        const spend = qty * px
        c.qty += qty
        c.costBasisUsd += spend
        c.buysUsd += spend
      } else {
        // SELL: realized P/L based on avg cost at time of sale
        if (c.qty <= 1e-12) continue

        const sellQty = Math.min(qty, c.qty)
        const proceeds = sellQty * px

        const avgCost = c.qty > 0 ? (c.costBasisUsd / c.qty) : 0
        const costRemoved = sellQty * avgCost

        c.qty -= sellQty
        c.costBasisUsd = Math.max(0, c.costBasisUsd - costRemoved)

        c.realizedPnlUsd += (proceeds - costRemoved)
        c.sellsUsd += proceeds
      }
    }

    // Collect coinIds we need prices for (anything with qty > 0 somewhere)
    const coinIdsToPrice = new Set()
    for (const u of perUser.values()) {
      for (const c of u.coins.values()) {
        if (c.qty > 1e-12) coinIdsToPrice.add(c.coinId)
      }
    }

    // Fetch prices (bounded / safe)
    const priceMap = {}
    for (const coinId of coinIdsToPrice) {
      try {
        // getCryptoPrice throws on failure; default to 0 on error
        const p = await getCryptoPrice(coinId)
        priceMap[coinId] = Number(p) || 0
      } catch {
        priceMap[coinId] = 0
      }
    }

    // Build output rows
    const rows = []
    for (const u of perUser.values()) {
      let realized = 0
      let unrealized = 0
      let holdingsValue = 0
      let costBasis = 0
      let totalBuys = 0
      let totalSells = 0
      let positions = 0

      for (const c of u.coins.values()) {
        realized += Number(c.realizedPnlUsd || 0)
        totalBuys += Number(c.buysUsd || 0)
        totalSells += Number(c.sellsUsd || 0)

        if (c.qty > 1e-12) {
          positions += 1
          const price = Number(priceMap[c.coinId] || 0)
          const value = c.qty * price
          holdingsValue += value
          costBasis += Number(c.costBasisUsd || 0)
          unrealized += (value - Number(c.costBasisUsd || 0))
        }
      }

      const totalPnl = realized + unrealized

      // Ignore people with no activity
      if (Math.abs(totalBuys) < 0.01 && Math.abs(totalSells) < 0.01 && Math.abs(totalPnl) < 0.01) continue

      rows.push({
        uuid: u.userId,
        nickname: u.nickname || u.userId || 'Unknown',
        totalPnl: Number(totalPnl.toFixed(2)),
        realizedPnl: Number(realized.toFixed(2)),
        unrealizedPnl: Number(unrealized.toFixed(2)),
        holdingsValue: Number(holdingsValue.toFixed(2)),
        costBasis: Number(costBasis.toFixed(2)),
        totalBuys: Number(totalBuys.toFixed(2)),
        totalSells: Number(totalSells.toFixed(2)),
        openPositions: positions
      })
    }

    // Sort by total P/L
    rows.sort((a, b) => Number(b.totalPnl || 0) - Number(a.totalPnl || 0))

    const topWinner = rows.length ? rows.reduce((max, r) =>
      (max == null || Number(r.totalPnl) > Number(max.totalPnl)) ? r : max
    , null) : null

    const topLoser = rows.length ? rows.reduce((min, r) =>
      (min == null || Number(r.totalPnl) < Number(min.totalPnl)) ? r : min
    , null) : null

    const updatedAt = new Date().toISOString()

    await postJson('/api/publishDb', {
      tables: {
        crypto_leaderboard_public: rows,
        crypto_extremes_public: { topWinner, topLoser, updatedAt }
      },
      public: ['crypto_leaderboard_public', 'crypto_extremes_public']
    })

    state.last.cryptoPerf = updatedAt
    saveState(state)

    console.log('[publish] cryptoPerf published:', rows.length, 'users; priced', coinIdsToPrice.size, 'coins')
  } catch (err) {
    console.warn('[publish] cryptoPerf failed:', err?.message || err)
  } finally {
    db.close()
  }
}


async function publishAlbumStats (state) {
  // Respect configured cooldowns
  if (minutesSince(state.last?.albumStats) < COOLDOWN_MINUTES_ALBUMS) {
    console.log('[publish] albumStats skipped (cooldown)')
    return
  }

  console.log('[publish] albumStats snapshot from', process.env.DB_PATH)
  const db = new Database(process.env.DB_PATH, { readonly: true })
  try {
    // Extract core album stats needed by the website.  We select only the
    // columns that the frontend consumes.  Keep column names consistent with
    // existing API (id, albumName, albumArt, artistName, averageReview).
    const albumStats = db.prepare(`
      SELECT id,
             albumName,
             albumArt,
             artistName,
             averageReview
        FROM album_stats
       ORDER BY id ASC
    `).all()

    // Compute review counts per albumId.  The public site’s album tab
    // expects each entry to expose its identifier under `albumId` (or `id` or
    // `album_id`) and the count under `count` (or `reviews`/`c`).  Using
    // `albumId` here ensures that getAlbumReviewCounts() in site/app.js
    // recognizes the values.  SQLite will return a numeric count.
    const reviewCounts = db.prepare(`
      SELECT albumId AS albumId,
             COUNT(*) AS count
        FROM album_reviews
       GROUP BY albumId
       ORDER BY albumId ASC
    `).all()

    // Post both tables to the worker.  We declare them public so the
    // Cloudflare worker stores them under the "db:" namespace (mirrored to
    // mod as well).  See worker/worker.js for details on handling /api/publishDb.
    await postJson('/api/publishDb', {
      tables: {
        album_stats_public: albumStats,
        album_review_counts_public: reviewCounts
      },
      public: ['album_stats_public', 'album_review_counts_public']
    })

    // Record timestamp so we respect the cooldown on the next run
    state.last.albumStats = new Date().toISOString()
    saveState(state)
    console.log('[publish] albumStats published:', albumStats.length,
      'albums and', reviewCounts.length, 'review counts')
  } catch (err) {
    console.warn('[publish] albumStats failed:', err?.message || err)
  } finally {
    db.close()
  }
}

// ── Publish: Album Queue (public) ────────────────────────────
async function publishAlbumQueue (state) {
  if (minutesSince(state.last?.albumQueue) < COOLDOWN_MINUTES_ALBUMS) {
    console.log('[publish] albumQueue skipped (cooldown)')
    return
  }

  console.log('[publish] albumQueue snapshot from', process.env.DB_PATH)
  const db = new Database(process.env.DB_PATH, { readonly: true })

  try {
    const LIMIT = Number(process.env.ALBUM_QUEUE_LIMIT || 50)

    const rows = db.prepare(`
      SELECT
        id,
        spotifyAlbumId,
        spotifyUrl,
        albumName,
        artistName,
        releaseDate,
        trackCount,
        albumArt,
        submittedByUserId,
        submittedByNickname,
        status,
        createdAt,
        updatedAt
      FROM album_queue
      WHERE COALESCE(status, 'queued') = 'queued'
      ORDER BY datetime(createdAt) ASC, id ASC
      LIMIT ?
    `).all(LIMIT)

    await postJson('/api/publishDb', {
      tables: { album_queue_public: rows },
      public: ['album_queue_public']
    })

    state.last.albumQueue = new Date().toISOString()
    saveState(state)

    console.log('[publish] albumQueue published:', rows.length)
  } catch (err) {
    console.warn('[publish] albumQueue failed:', err?.message || err)
  } finally {
    db.close()
  }
}


// ── Publish: Commands ────────────────────────────────────────
async function publishCommands (state) {
  if (!commands.length && !commands_mod.length) return
  if (minutesSince(state.last?.commands) < COOLDOWN_MINUTES_COMMANDS) {
    console.log('[publish] commands skipped (cooldown)'); return
  }
  const nextHash = JSON.stringify([commands, commands_mod])
  if (state.last?.commandsHash === nextHash) {
    console.log('[publish] commands unchanged; skipped')
    state.last.commands = new Date().toISOString(); saveState(state); return
  }
  console.log('[publish] commands')
  await postJson('/api/publishCommands', { commands, commands_mod })
  state.last.commands = new Date().toISOString()
  state.last.commandsHash = nextHash; saveState(state)
}

// ── Publish: Per-table DB mirrors ────────────────────────────
async function publishDb (state) {
  if (minutesSince(state.last?.db) < COOLDOWN_MINUTES_DB) {
    console.log('[publish] db skipped (cooldown)'); return
  }
  console.log('[publish] db snapshots from', process.env.DB_PATH)
  const db = new Database(process.env.DB_PATH, { readonly: true })
  try {
    await publishDbSnapshot({
      db,
      havePublishConfig: () => true,
      logger: console,
      postJson: async (pathname, payload) => postJson(pathname, payload)
    })
    state.last.db = new Date().toISOString(); saveState(state)
  } finally { db.close() }
}

// ── Publish: Stats (placeholder) ─────────────────────────────
async function publishStats (state) {
  if (minutesSince(state.last?.stats) < COOLDOWN_MINUTES_STATS) {
    console.log('[publish] stats skipped (cooldown)'); return
  }
  const now = new Date().toISOString()
  try {
    await postJson('/api/publishStats', { totals: { updatedAt: now }, topSongs: [], topAlbums: [] })
    state.last.stats = now; saveState(state)
  } catch (e) { console.warn('[publish] stats failed:', e?.message || e) }
}

// ── Publish: siteData snapshot ───────────────────────────────
function fill1toN (list, n, toKey = x => x.number, toVal = x => x.count) {
  const map = new Map(list.map(x => [Number(toKey(x)), Number(toVal(x)) || 0]))
  const out = []; for (let i = 1; i <= n; i++) out.push({ number: i, count: map.get(i) ?? 0 }); return out
}
async function publishSiteData (state) {
  if (minutesSince(state.last?.siteData) < COOLDOWN_MINUTES_SITEDATA) {
    console.log('[publish] siteData skipped (cooldown)'); return
  }
  console.log('[publish] siteData snapshot from', process.env.DB_PATH)
  const db = new Database(process.env.DB_PATH, { readonly: true })
  try {
    const lotteryRows = db.prepare('SELECT number, count FROM lottery_stats ORDER BY number ASC').all()
    const lotteryStats = fill1toN(lotteryRows || [], 99, r => r.number, r => r.count)
    const snapshot = {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      lottery: { stats: lotteryStats }
    }
    await postJson('/api/siteData', snapshot)
    state.last.siteData = snapshot.updatedAt; saveState(state)
  } finally { db.close() }
}
async function publishTopSongs (state) {
  if (minutesSince(state.last?.topSongs) < COOLDOWN_MINUTES_SONGS) {
    console.log('[publish] topSongs skipped (cooldown)')
    return
  }

  console.log('[publish] topSongs snapshot from', process.env.DB_PATH)
  const db = new Database(process.env.DB_PATH, { readonly: true })

  try {
    // We publish a blended dataset so new songs always appear even if they
    // have low plays. Keep total payload capped for safety.
    const MAX_ROWS = Number(process.env.TOP_SONGS_LIMIT || 15000)
    const TOP_PLAYS_N = Number(process.env.TOP_SONGS_TOP_PLAYS_N || 3500)
    const RECENT_N = Number(process.env.TOP_SONGS_RECENT_N || 2500)

    const baseSelect = `
      SELECT
        COALESCE(trackName, '')       AS title,
        COALESCE(artistName, '')      AS artist,
        COALESCE(playCount, 0)        AS plays,
        COALESCE(averageReview, NULL) AS avg,
        COALESCE(likes, 0)            AS likes,
        COALESCE(dislikes, 0)         AS dislikes,
        COALESCE(stars, 0)            AS stars,
        COALESCE(lastPlayed, NULL)    AS lastPlayed
      FROM room_stats
      WHERE trackName IS NOT NULL
        AND TRIM(trackName) <> ''
        AND LOWER(TRIM(trackName)) <> 'unknown'
    `

    // Bucket 1: top by plays
    const topByPlays = db.prepare(`
      ${baseSelect}
      ORDER BY plays DESC, lastPlayed DESC
      LIMIT ?
    `).all(TOP_PLAYS_N)

    // Bucket 2: most recent (ensures new songs appear)
    const mostRecent = db.prepare(`
      ${baseSelect}
      ORDER BY
        CASE WHEN lastPlayed IS NULL OR TRIM(lastPlayed) = '' THEN 0 ELSE 1 END DESC,
        lastPlayed DESC
      LIMIT ?
    `).all(RECENT_N)

    // Deduplicate by normalized (title|artist) key; keep the "best" record.
    // If a song appears in both buckets, prefer higher plays, then more recent.
    const keyOf = (r) => `${String(r.title || '').trim().toLowerCase()}|${String(r.artist || '').trim().toLowerCase()}`
    const toTime = (x) => {
      if (!x) return 0
      const t = new Date(x).getTime()
      return Number.isFinite(t) ? t : 0
    }

    const map = new Map()
    for (const r of [...topByPlays, ...mostRecent]) {
      const k = keyOf(r)
      if (!k || k === '|') continue

      const prev = map.get(k)
      if (!prev) { map.set(k, r); continue }

      const rPlays = Number(r.plays || 0)
      const pPlays = Number(prev.plays || 0)
      const rT = toTime(r.lastPlayed)
      const pT = toTime(prev.lastPlayed)

      // keep whichever seems more "authoritative"
      if (rPlays > pPlays) map.set(k, r)
      else if (rPlays === pPlays && rT > pT) map.set(k, r)
    }

    let rows = Array.from(map.values())

    // Final cap: sort by plays desc, then recency desc (stable output)
    rows.sort((a, b) => {
      const ap = Number(a.plays || 0); const bp = Number(b.plays || 0)
      if (bp !== ap) return bp - ap
      return toTime(b.lastPlayed) - toTime(a.lastPlayed)
    })

    if (rows.length > MAX_ROWS) rows = rows.slice(0, MAX_ROWS)

    await postJson('/api/publishDb', {
      tables: { top_songs: rows },
      public: ['top_songs']
    })

    state.last.topSongs = new Date().toISOString()
    saveState(state)

    console.log('[publish] topSongs published:', rows.length, 'rows',
      `(topByPlays=${topByPlays.length}, recent=${mostRecent.length})`)
  } catch (err) {
    console.warn('[publish] topSongs failed:', err?.message || err)
  } finally {
    db.close()
  }
}
async function publishWrapped2026 (state) {
  if (minutesSince(state.last?.wrapped2026) < COOLDOWN_MINUTES_WRAPPED) {
    console.log('[publish] wrapped2026 skipped (cooldown)')
    return
  }

  console.log('[publish] wrapped2026 snapshot from', process.env.DB_PATH)
  const db = new Database(process.env.DB_PATH, { readonly: true })

  try {
    // Date window for 2026
    const START = '2026-01-01'
    const END = '2027-01-01'

    // Room-level Wrapped limits
    const LIMIT_SONGS = Number(process.env.WRAPPED_TOP_SONGS_LIMIT || 200)
    const LIMIT_ARTISTS = Number(process.env.WRAPPED_TOP_ARTISTS_LIMIT || 200)
    const LIMIT_DJS = Number(process.env.WRAPPED_TOP_DJS_LIMIT || 100)

    // ─────────────────────────────────────────────────────────────
    // Room Wrapped (existing)
    // ─────────────────────────────────────────────────────────────
    const topSongs = db.prepare(`
      SELECT
        trackName AS title,
        artistName AS artist,
        COUNT(*) AS plays
      FROM song_plays
      WHERE playedAt >= ? AND playedAt < ?
      GROUP BY trackName, artistName
      ORDER BY plays DESC
      LIMIT ?
    `).all(START, END, LIMIT_SONGS)

    const topArtists = db.prepare(`
      SELECT
        artistName AS artist,
        COUNT(*) AS plays
      FROM song_plays
      WHERE playedAt >= ? AND playedAt < ?
      GROUP BY artistName
      ORDER BY plays DESC
      LIMIT ?
    `).all(START, END, LIMIT_ARTISTS)

    // Top DJs (room-level): prefer users.nickname when djUuid exists
    const topDjs = db.prepare(`
      SELECT
        COALESCE(sp.djUuid, NULL) AS djUuid,
        COALESCE(
          NULLIF(TRIM(u.nickname), ''),
          NULLIF(TRIM(sp.djNickname), ''),
          'unknown'
        ) AS dj,
        COUNT(*) AS plays
      FROM song_plays sp
      LEFT JOIN users u
        ON u.uuid = sp.djUuid
      WHERE sp.playedAt >= ? AND sp.playedAt < ?
      GROUP BY
        CASE
          WHEN sp.djUuid IS NOT NULL AND TRIM(sp.djUuid) <> '' THEN sp.djUuid
          ELSE COALESCE(NULLIF(TRIM(sp.djNickname), ''), 'unknown')
        END
      ORDER BY plays DESC
      LIMIT ?
    `).all(START, END, LIMIT_DJS)

    // ─────────────────────────────────────────────────────────────
    // DJ Wrapped (new)
    // ─────────────────────────────────────────────────────────────
    // 1) Per-DJ totals (use djUuid where possible; fallback to nickname)
    const djTotals = db.prepare(`
      SELECT
        COALESCE(sp.djUuid, NULL) AS djUuid,
        COALESCE(
          NULLIF(TRIM(u.nickname), ''),
          NULLIF(TRIM(sp.djNickname), ''),
          'unknown'
        ) AS dj,
        COUNT(*) AS plays,
        COUNT(DISTINCT LOWER(TRIM(sp.trackName)) || '|' || LOWER(TRIM(sp.artistName))) AS uniqueSongs,
        COUNT(DISTINCT LOWER(TRIM(sp.artistName))) AS uniqueArtists
      FROM song_plays sp
      LEFT JOIN users u
        ON u.uuid = sp.djUuid
      WHERE sp.playedAt >= ? AND sp.playedAt < ?
      GROUP BY
        CASE
          WHEN sp.djUuid IS NOT NULL AND TRIM(sp.djUuid) <> '' THEN sp.djUuid
          ELSE COALESCE(NULLIF(TRIM(sp.djNickname), ''), 'unknown')
        END
      ORDER BY plays DESC
      LIMIT ?
    `).all(START, END, WRAPPED_DJ_LIMIT)

    // 2) Per-DJ top songs + top artists (bounded per DJ)
    // We only compute these for DJs included in djTotals to keep payload bounded.
    const djTopSongs = []
    const djTopArtists = []

    const topSongsStmt = db.prepare(`
      SELECT
        sp.trackName AS title,
        sp.artistName AS artist,
        COUNT(*) AS plays
      FROM song_plays sp
      WHERE sp.playedAt >= ? AND sp.playedAt < ?
        AND sp.djUuid = ?
      GROUP BY sp.trackName, sp.artistName
      ORDER BY plays DESC
      LIMIT ?
    `)

    const topArtistsStmt = db.prepare(`
      SELECT
        sp.artistName AS artist,
        COUNT(*) AS plays
      FROM song_plays sp
      WHERE sp.playedAt >= ? AND sp.playedAt < ?
        AND sp.djUuid = ?
      GROUP BY sp.artistName
      ORDER BY plays DESC
      LIMIT ?
    `)

    for (const dj of djTotals) {
      const djUuid = dj.djUuid

      // If we don't have a djUuid (only nickname fallback), we can’t reliably filter
      // per DJ without collisions. We still include totals, but skip top lists.
      if (!djUuid || String(djUuid).trim() === '') continue

      const songs = topSongsStmt.all(START, END, djUuid, WRAPPED_DJ_TOP_SONGS)
      for (const r of songs) {
        djTopSongs.push({
          djUuid,
          dj: dj.dj,
          title: r.title,
          artist: r.artist,
          plays: r.plays
        })
      }

      const artists = topArtistsStmt.all(START, END, djUuid, WRAPPED_DJ_TOP_ARTISTS)
      for (const r of artists) {
        djTopArtists.push({
          djUuid,
          dj: dj.dj,
          artist: r.artist,
          plays: r.plays
        })
      }
    }

    await postJson('/api/publishDb', {
      tables: {
        // room wrapped (existing)
        wrapped_2026_top_songs: topSongs,
        wrapped_2026_top_artists: topArtists,
        wrapped_2026_top_djs: topDjs,

        // dj wrapped (new)
        wrapped_2026_dj_totals: djTotals,
        wrapped_2026_dj_top_songs: djTopSongs,
        wrapped_2026_dj_top_artists: djTopArtists
      },
      public: [
        'wrapped_2026_top_songs',
        'wrapped_2026_top_artists',
        'wrapped_2026_top_djs',

        'wrapped_2026_dj_totals',
        'wrapped_2026_dj_top_songs',
        'wrapped_2026_dj_top_artists'
      ]
    })

    state.last.wrapped2026 = new Date().toISOString()
    saveState(state)

    console.log('[publish] wrapped2026 published:',
      topSongs.length, 'room songs,',
      topArtists.length, 'room artists,',
      topDjs.length, 'room djs;',
      djTotals.length, 'dj totals,',
      djTopSongs.length, 'dj song rows,',
      djTopArtists.length, 'dj artist rows'
    )
  } catch (err) {
    console.warn('[publish] wrapped2026 failed:', err?.message || err)
  } finally {
    db.close()
  }
}

// ── Main ─────────────────────────────────────────────────────
const main = async () => {
  const state = loadState()
  await publishCommands(state)
  await publishDb(state)
  await publishTopSongs(state)
  await publishStats(state)
  await publishSiteData(state)
  await publishCareerLeaders(state)
  await publishCryptoPerformance(state)
  await publishAlbumStats(state)
  await publishWrapped2026(state)
  await publishPga(state)
  await publishLotteryWinners(state)
  await publishCrapsRecords(state)
  await publishHorseHallOfFame(state)
  await publishHorseHallOfFame(state)
  await publishUserOwnedHorses(state)
  await publishAlbumQueue(state)
  console.log('[publish] done')
}

main().catch(err => { console.error('[publish] ERROR:', err); process.exit(1) })
