// tools/publish-site-data.mjs
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import process from 'process';
import {publishDbSnapshot} from './publishSnapshot.js';

// ── Resolve API + auth ───────────────────────────────────────
const API_BASE = process.env.API_BASE;
const PUBLISH_TOKEN = process.env.PUBLISH_TOKEN;

// ── Resolve DB path robustly (prefer Fly volume) ─────────────
const FLY_DATA_DIR = '/data';
const RESOLVED_DB_PATH =
  process.env.DB_PATH
  || (fs.existsSync(FLY_DATA_DIR) ? path.join(FLY_DATA_DIR, 'app.db') : path.resolve('src/data/app.db'));

// make it visible to anything we import
process.env.DB_PATH = RESOLVED_DB_PATH;
console.log('[publish] Using DB_PATH =', process.env.DB_PATH);

// Ensure schema/migrations are loaded for this process too
// (IMPORTANT: path must match actual file name exactly on Linux)
await import(new URL('../src/database/initdb.js', import.meta.url));

// ── Cooldowns ────────────────────────────────────────────────
const COOLDOWN_MINUTES_DB       = Number(process.env.PUBLISH_DB_EVERY_MIN    || 240);
const COOLDOWN_MINUTES_COMMANDS = Number(process.env.PUBLISH_CMDS_EVERY_MIN  || 240);
const COOLDOWN_MINUTES_STATS    = Number(process.env.PUBLISH_STATS_EVERY_MIN || 240);
// Publish album stats more frequently to keep the website up‑to‑date.  This can
// be overridden via the PUBLISH_ALBUMS_EVERY_MIN environment variable.  A
// reasonable default of 10 minutes means that new reviews will be visible on
// the site within a short window without spamming the API.
const COOLDOWN_MINUTES_ALBUMS   = Number(process.env.PUBLISH_ALBUMS_EVERY_MIN || 10);
const COOLDOWN_MINUTES_SITEDATA = Number(process.env.PUBLISH_SITEDATA_EVERY_MIN || 10);
const COOLDOWN_MINUTES_SONGS = Number(process.env.PUBLISH_SONGS_EVERY_MIN || 10);
const COOLDOWN_MINUTES_WRAPPED  = Number(process.env.PUBLISH_WRAPPED_EVERY_MIN || 60);
// DJ wrapped limits (safe defaults)
const WRAPPED_DJ_LIMIT          = Number(process.env.WRAPPED_DJ_LIMIT || 200);        // how many DJs we track per year
const WRAPPED_DJ_TOP_SONGS      = Number(process.env.WRAPPED_DJ_TOP_SONGS || 50);     // per DJ
const WRAPPED_DJ_TOP_ARTISTS    = Number(process.env.WRAPPED_DJ_TOP_ARTISTS || 50);  // per DJ




// Persist state on the volume so cooldowns survive restarts
const STATE_FILE = process.env.PUBLISH_STATE_FILE
  || (fs.existsSync(FLY_DATA_DIR) ? path.join(FLY_DATA_DIR, '.publish-state.json') : path.resolve('.publish-state.json'));

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')); } catch { return { last: {} }; }
}
function saveState(state) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); } catch {}
}
function minutesSince(ts) {
  if (!ts) return Infinity;
  const diffMs = Date.now() - new Date(ts).getTime();
  return diffMs / 60000;
}

function tryReadJson(p) { try { return JSON.parse(fs.readFileSync(p,'utf-8')); } catch { return null; } }
const commands     = tryReadJson(process.env.COMMANDS_JSON     || 'site/commands.public.json') || [];
const commands_mod = tryReadJson(process.env.COMMANDS_MOD_JSON || 'site/commands.mod.json')    || [];

async function postJson(pathname, payload) {
  if (!API_BASE || !PUBLISH_TOKEN) {
    throw new Error('Missing API_BASE or PUBLISH_TOKEN');
  }
  const res = await fetch(`${API_BASE}${pathname}`, {
    method: 'POST',
    headers: { 'content-type':'application/json', 'authorization': `Bearer ${PUBLISH_TOKEN}` },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`${pathname} ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Publish: Album review stats ────────────────────────────────
// The public site shows a list of reviewed albums.  Historically this data
// has been published from within the Turntable bot using ad‑hoc scripts, so
// it wasn’t obvious when new reviews stopped appearing.  To make the
// publishing explicit and reproducible, we derive two simple datasets from
// the local SQLite database:
//   • album_stats_public: one row per album with its name, artist, artwork and
//     average rating (id is preserved to merge with review counts)
//   • album_review_counts_public: one row per albumId with the number of
//     reviews it has received
// These tables mirror the schema expected by site/app.js.  Both tables are
// uploaded via /api/publishDb with the `public` flag so that they become
// accessible under /api/db/album_stats_public and
// /api/db/album_review_counts_public.  A configurable cooldown prevents
// excessive updates.
async function publishAlbumStats (state) {
  // Respect configured cooldowns
  if (minutesSince(state.last?.albumStats) < COOLDOWN_MINUTES_ALBUMS) {
    console.log('[publish] albumStats skipped (cooldown)');
    return;
  }

  console.log('[publish] albumStats snapshot from', process.env.DB_PATH);
  const db = new Database(process.env.DB_PATH, { readonly: true });
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
    `).all();

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
    `).all();

    // Post both tables to the worker.  We declare them public so the
    // Cloudflare worker stores them under the "db:" namespace (mirrored to
    // mod as well).  See worker/worker.js for details on handling /api/publishDb.
    await postJson('/api/publishDb', {
      tables: {
        album_stats_public: albumStats,
        album_review_counts_public: reviewCounts
      },
      public: ['album_stats_public', 'album_review_counts_public']
    });

    // Record timestamp so we respect the cooldown on the next run
    state.last.albumStats = new Date().toISOString();
    saveState(state);
    console.log('[publish] albumStats published:', albumStats.length,
                'albums and', reviewCounts.length, 'review counts');
  } catch (err) {
    console.warn('[publish] albumStats failed:', err?.message || err);
  } finally {
    db.close();
  }
}

// ── Publish: Commands ────────────────────────────────────────
async function publishCommands(state) {
  if (!commands.length && !commands_mod.length) return;
  if (minutesSince(state.last?.commands) < COOLDOWN_MINUTES_COMMANDS) {
    console.log('[publish] commands skipped (cooldown)'); return;
  }
  const nextHash = JSON.stringify([commands, commands_mod]);
  if (state.last?.commandsHash === nextHash) {
    console.log('[publish] commands unchanged; skipped');
    state.last.commands = new Date().toISOString(); saveState(state); return;
  }
  console.log('[publish] commands');
  await postJson('/api/publishCommands', { commands, commands_mod });
  state.last.commands = new Date().toISOString();
  state.last.commandsHash = nextHash; saveState(state);
}

// ── Publish: Per-table DB mirrors ────────────────────────────
async function publishDb(state) {
  if (minutesSince(state.last?.db) < COOLDOWN_MINUTES_DB) {
    console.log('[publish] db skipped (cooldown)'); return;
  }
  console.log('[publish] db snapshots from', process.env.DB_PATH);
  const db = new Database(process.env.DB_PATH, { readonly: true });
  try {
    await publishDbSnapshot({
      db,
      havePublishConfig: () => true,
      logger: console,
      postJson: async (pathname, payload) => postJson(pathname, payload)
    });
    state.last.db = new Date().toISOString(); saveState(state);
  } finally { db.close(); }
}

// ── Publish: Stats (placeholder) ─────────────────────────────
async function publishStats(state) {
  if (minutesSince(state.last?.stats) < COOLDOWN_MINUTES_STATS) {
    console.log('[publish] stats skipped (cooldown)'); return;
  }
  const now = new Date().toISOString();
  try {
    await postJson('/api/publishStats', { totals: { updatedAt: now }, topSongs: [], topAlbums: [] });
    state.last.stats = now; saveState(state);
  } catch (e) { console.warn('[publish] stats failed:', e?.message || e); }
}

// ── Publish: siteData snapshot ───────────────────────────────
function fill1toN(list, n, toKey = x => x.number, toVal = x => x.count) {
  const map = new Map(list.map(x => [Number(toKey(x)), Number(toVal(x)) || 0]));
  const out = []; for (let i = 1; i <= n; i++) out.push({ number: i, count: map.get(i) ?? 0 }); return out;
}
async function publishSiteData(state) {
  if (minutesSince(state.last?.siteData) < COOLDOWN_MINUTES_SITEDATA) {
    console.log('[publish] siteData skipped (cooldown)'); return;
  }
  console.log('[publish] siteData snapshot from', process.env.DB_PATH);
  const db = new Database(process.env.DB_PATH, { readonly: true });
  try {
    const lotteryRows = db.prepare(`SELECT number, count FROM lottery_stats ORDER BY number ASC`).all();
    const lotteryStats = fill1toN(lotteryRows || [], 99, r => r.number, r => r.count);
    const snapshot = {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      lottery: { stats: lotteryStats }
    };
    await postJson('/api/siteData', snapshot);
    state.last.siteData = snapshot.updatedAt; saveState(state);
  } finally { db.close(); }
}
async function publishTopSongs (state) {
  if (minutesSince(state.last?.topSongs) < COOLDOWN_MINUTES_SONGS) {
    console.log('[publish] topSongs skipped (cooldown)');
    return;
  }

  console.log('[publish] topSongs snapshot from', process.env.DB_PATH);
  const db = new Database(process.env.DB_PATH, { readonly: true });

  try {
    // We publish a blended dataset so new songs always appear even if they
    // have low plays. Keep total payload capped for safety.
    const MAX_ROWS = Number(process.env.TOP_SONGS_LIMIT || 15000);
    const TOP_PLAYS_N = Number(process.env.TOP_SONGS_TOP_PLAYS_N || 3500);
    const RECENT_N = Number(process.env.TOP_SONGS_RECENT_N || 2500);

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
    `;

    // Bucket 1: top by plays
    const topByPlays = db.prepare(`
      ${baseSelect}
      ORDER BY plays DESC, lastPlayed DESC
      LIMIT ?
    `).all(TOP_PLAYS_N);

    // Bucket 2: most recent (ensures new songs appear)
    const mostRecent = db.prepare(`
      ${baseSelect}
      ORDER BY
        CASE WHEN lastPlayed IS NULL OR TRIM(lastPlayed) = '' THEN 0 ELSE 1 END DESC,
        lastPlayed DESC
      LIMIT ?
    `).all(RECENT_N);

    // Deduplicate by normalized (title|artist) key; keep the "best" record.
    // If a song appears in both buckets, prefer higher plays, then more recent.
    const keyOf = (r) => `${String(r.title || '').trim().toLowerCase()}|${String(r.artist || '').trim().toLowerCase()}`;
    const toTime = (x) => {
      if (!x) return 0;
      const t = new Date(x).getTime();
      return Number.isFinite(t) ? t : 0;
    };

    const map = new Map();
    for (const r of [...topByPlays, ...mostRecent]) {
      const k = keyOf(r);
      if (!k || k === '|' ) continue;

      const prev = map.get(k);
      if (!prev) { map.set(k, r); continue; }

      const rPlays = Number(r.plays || 0);
      const pPlays = Number(prev.plays || 0);
      const rT = toTime(r.lastPlayed);
      const pT = toTime(prev.lastPlayed);

      // keep whichever seems more "authoritative"
      if (rPlays > pPlays) map.set(k, r);
      else if (rPlays === pPlays && rT > pT) map.set(k, r);
    }

    let rows = Array.from(map.values());

    // Final cap: sort by plays desc, then recency desc (stable output)
    rows.sort((a, b) => {
      const ap = Number(a.plays || 0), bp = Number(b.plays || 0);
      if (bp !== ap) return bp - ap;
      return toTime(b.lastPlayed) - toTime(a.lastPlayed);
    });

    if (rows.length > MAX_ROWS) rows = rows.slice(0, MAX_ROWS);

    await postJson('/api/publishDb', {
      tables: { top_songs: rows },
      public: ['top_songs']
    });

    state.last.topSongs = new Date().toISOString();
    saveState(state);

    console.log('[publish] topSongs published:', rows.length, 'rows',
      `(topByPlays=${topByPlays.length}, recent=${mostRecent.length})`);
  } catch (err) {
    console.warn('[publish] topSongs failed:', err?.message || err);
  } finally {
    db.close();
  }
}
async function publishWrapped2026 (state) {
  if (minutesSince(state.last?.wrapped2026) < COOLDOWN_MINUTES_WRAPPED) {
    console.log('[publish] wrapped2026 skipped (cooldown)');
    return;
  }

  console.log('[publish] wrapped2026 snapshot from', process.env.DB_PATH);
  const db = new Database(process.env.DB_PATH, { readonly: true });

  try {
    // Date window for 2026
    const START = '2026-01-01';
    const END   = '2027-01-01';

    // Room-level Wrapped limits
    const LIMIT_SONGS   = Number(process.env.WRAPPED_TOP_SONGS_LIMIT || 200);
    const LIMIT_ARTISTS = Number(process.env.WRAPPED_TOP_ARTISTS_LIMIT || 200);
    const LIMIT_DJS     = Number(process.env.WRAPPED_TOP_DJS_LIMIT || 100);

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
    `).all(START, END, LIMIT_SONGS);

    const topArtists = db.prepare(`
      SELECT
        artistName AS artist,
        COUNT(*) AS plays
      FROM song_plays
      WHERE playedAt >= ? AND playedAt < ?
      GROUP BY artistName
      ORDER BY plays DESC
      LIMIT ?
    `).all(START, END, LIMIT_ARTISTS);

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
    `).all(START, END, LIMIT_DJS);

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
    `).all(START, END, WRAPPED_DJ_LIMIT);

    // 2) Per-DJ top songs + top artists (bounded per DJ)
    // We only compute these for DJs included in djTotals to keep payload bounded.
    const djTopSongs = [];
    const djTopArtists = [];

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
    `);

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
    `);

    for (const dj of djTotals) {
      const djUuid = dj.djUuid;

      // If we don't have a djUuid (only nickname fallback), we can’t reliably filter
      // per DJ without collisions. We still include totals, but skip top lists.
      if (!djUuid || String(djUuid).trim() === '') continue;

      const songs = topSongsStmt.all(START, END, djUuid, WRAPPED_DJ_TOP_SONGS);
      for (const r of songs) {
        djTopSongs.push({
          djUuid,
          dj: dj.dj,
          title: r.title,
          artist: r.artist,
          plays: r.plays
        });
      }

      const artists = topArtistsStmt.all(START, END, djUuid, WRAPPED_DJ_TOP_ARTISTS);
      for (const r of artists) {
        djTopArtists.push({
          djUuid,
          dj: dj.dj,
          artist: r.artist,
          plays: r.plays
        });
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
    });

    state.last.wrapped2026 = new Date().toISOString();
    saveState(state);

    console.log('[publish] wrapped2026 published:',
      topSongs.length, 'room songs,',
      topArtists.length, 'room artists,',
      topDjs.length, 'room djs;',
      djTotals.length, 'dj totals,',
      djTopSongs.length, 'dj song rows,',
      djTopArtists.length, 'dj artist rows'
    );
  } catch (err) {
    console.warn('[publish] wrapped2026 failed:', err?.message || err);
  } finally {
    db.close();
  }
}





// ── Main ─────────────────────────────────────────────────────
const main = async () => {
  const state = loadState();
  await publishCommands(state);
  await publishDb(state);
  await publishTopSongs(state);
  await publishStats(state);
  await publishSiteData(state);
  // Publish album review statistics after other tasks.  This runs on its own
  // cooldown separate from the overall site snapshot to avoid undue load.
  await publishAlbumStats(state);
  await publishWrapped2026(state);

  console.log('[publish] done');
};

main().catch(err => { console.error('[publish] ERROR:', err); process.exit(1); });
