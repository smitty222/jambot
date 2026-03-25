// src/config.js
//
// Centralised environment configuration for JamBot.
//
// This module reads all of the environment variables used throughout the
// application, applies sensible defaults where appropriate and throws
// informative errors for any variables that are required but missing. By
// gathering your configuration in one place you make it easier to
// understand how the bot is configured, prevent runtime failures caused by
// undefined values and enable early validation during startup.

import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

// Load variables from a local .env file if present.  If no .env file is
// supplied, dotenv simply does nothing – all variables are expected to be
// provided by the hosting environment (e.g. Fly.io secrets or the shell).
dotenv.config()
loadFlyEnvFallback()

function loadFlyEnvFallback () {
  if (String(process.env.JAMBOT_DISABLE_FLY_ENV || '') === '1') return

  const flyEnvPath = path.resolve(process.cwd(), 'fly.env')
  if (!fs.existsSync(flyEnvPath)) return

  try {
    const parsed = dotenv.parse(fs.readFileSync(flyEnvPath))
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined || process.env[key] === '') {
        process.env[key] = value
      }
    }
  } catch (error) {
    console.warn('[config] Failed to load fly.env fallback:', error?.message || error)
  }
}

/**
 * Helper for reading environment variables with defaults.
 *
 * @param {string} name The name of the environment variable to read.
 * @param {Object} opts
 * @param {any} [opts.defaultValue] A fallback value if the variable is
 *   undefined.
 * @returns {string|undefined} The value of the environment variable or the
 *   supplied default.
 */
function getEnv (name, { defaultValue } = {}) {
  const raw = process.env[name]
  if (raw === undefined || raw === '') {
    return defaultValue
  }
  return raw
}

function getNumberEnv (name, defaultValue) {
  const raw = getEnv(name)
  if (raw === undefined) return defaultValue
  const value = Number(raw)
  return Number.isFinite(value) ? value : defaultValue
}

// Define your configuration keys here. Keep this list organised by area
// (chat, room, AI, Spotify, etc.) so it's easy to see what's required.
export const env = {
  // Runtime
  nodeEnv: getEnv('NODE_ENV', { defaultValue: 'development' }),
  port: getNumberEnv('PORT', 8080),

  // Chat/CometChat configuration
  chatApiKey: getEnv('CHAT_API_KEY'),
  chatToken: getEnv('CHAT_TOKEN'),
  chatUserId: getEnv('CHAT_USER_ID'),
  chatReplyId: getEnv('CHAT_REPLY_ID'),
  chatAvatarId: getEnv('CHAT_AVATAR_ID', { defaultValue: 'lovable-pixel' }),
  chatName: getEnv('CHAT_NAME', { defaultValue: 'Allen' }),
  chatColour: getEnv('CHAT_COLOUR'),
  chatTtAppId: getEnv('CHAT_TT_APP_ID'),
  chatAuthKey: getEnv('CHAT_AUTH_KEY'),

  // Room/bot configuration
  roomUuid: getEnv('ROOM_UUID'),
  roomSlug: getEnv('ROOM_SLUG', { defaultValue: 'just-jams' }),
  joinRoom: getEnv('JOIN_ROOM'),
  botUserUuid: getEnv('BOT_USER_UUID'),
  ttlUserToken: getEnv('TTL_USER_TOKEN'),
  tokenRole: getEnv('TOKEN_ROLE'),
  spotifyCredentials: getEnv('SPOTIFY_CREDENTIALS'),

  // Bot tuning
  botSeenTtlMs: getNumberEnv('BOT_SEEN_TTL_MS', 10 * 60 * 1000),
  botSeenMax: getNumberEnv('BOT_SEEN_MAX', 5000),
  botDmMaxMerged: getNumberEnv('BOT_DM_MAX_MERGED', 400),
  botPollYieldEvery: getNumberEnv('BOT_POLL_YIELD_EVERY', 50),
  botStartupGraceS: getNumberEnv('BOT_STARTUP_GRACE_S', 60),
  pollBaseMs: getNumberEnv('POLL_BASE_MS', 450),
  pollBackoffStepMs: getNumberEnv('POLL_BACKOFF_STEP_MS', 250),
  pollMaxBackoffSteps: getNumberEnv('POLL_MAX_BACKOFF_STEPS', 8),

  // API keys / third party services
  geminiApiKey: getEnv('GEMINI_API_KEY'),
  openaiApiKey: getEnv('OPENAI_API_KEY'),
  bardCookie: getEnv('BARD_COOKIE'),
  geniusToken: getEnv('GENIUS_TOKEN'),
  oddsApiKey: getEnv('ODDS_API_KEY'),
  lastfmApiKey: getEnv('LASTFM_API_KEY'),
  redirectUri: getEnv('REDIRECT_URI'),
  ttPublicApiBase: getEnv('TT_PUBLIC_API_BASE', { defaultValue: 'https://api.prod.tt.fm' }),

  // Spotify credentials
  spotifyClientId: getEnv('SPOTIFY_CLIENT_ID'),
  spotifyClientSecret: getEnv('SPOTIFY_CLIENT_SECRET'),
  spotifyRefreshToken: getEnv('SPOTIFY_REFRESH_TOKEN'),
  spotifyAccessToken: getEnv('SPOTIFY_ACCESS_TOKEN'),
  defaultPlaylistId: getEnv('DEFAULT_PLAYLIST_ID'),

  // Database configuration
  dbPath: getEnv('DB_PATH', { defaultValue: './data/app.db' }),
  dbFile: getEnv('DB_FILE'),

  // Site publishing & scheduler
  enableSitePublishCron: getEnv('ENABLE_SITE_PUBLISH_CRON'),
  publishCron: getEnv('PUBLISH_CRON'),
  publishTz: getEnv('PUBLISH_TZ'),
  publishScript: getEnv('PUBLISH_SCRIPT'),
  publishRunOnBoot: getEnv('PUBLISH_RUN_ON_BOOT'),
  sportsSettlementCron: getEnv('SPORTS_SETTLEMENT_CRON', { defaultValue: '0 6 * * *' }),
  ncaabSettlementEnabled: getEnv('NCAAB_SETTLEMENT_ENABLED', { defaultValue: '1' }),
  ncaabSettlementCron: getEnv('NCAAB_SETTLEMENT_CRON', { defaultValue: '*/10 * * * *' }),
  sportsSettlementTz: getEnv('SPORTS_SETTLEMENT_TZ', { defaultValue: 'America/New_York' }),
  sportsSettlementRunOnBoot: getEnv('SPORTS_SETTLEMENT_RUN_ON_BOOT'),
  marchMadnessUpdatesEnabled: getEnv('MARCH_MADNESS_UPDATES_ENABLED', { defaultValue: '1' }),
  marchMadnessUpdatesCron: getEnv('MARCH_MADNESS_UPDATES_CRON', { defaultValue: '*/10 * * * *' }),
  marchMadnessUpdatesTz: getEnv('MARCH_MADNESS_UPDATES_TZ', { defaultValue: 'America/New_York' }),
  marchMadnessUpdatesRunOnBoot: getEnv('MARCH_MADNESS_UPDATES_RUN_ON_BOOT'),
  publishToken: getEnv('PUBLISH_TOKEN'),
  publishStateFile: getEnv('PUBLISH_STATE_FILE'),
  apiBase: getEnv('API_BASE'),
  dmCursorFile: getEnv('DM_CURSOR_FILE'),
  lastMessageFile: getEnv('LAST_MESSAGE_FILE'),
  discoverPlaylistIds: getEnv('DISCOVER_PLAYLIST_IDS'),
  nicknameTtlMs: getNumberEnv('NICKNAME_TTL_MS', 6 * 60 * 60 * 1000),
  ianUserToken: getEnv('IAN_USER_TOKEN'),
  smittyUserToken: getEnv('SMITTY_USER_TOKEN'),
  camUserToken: getEnv('CAM_USER_TOKEN'),
  gabUserToken: getEnv('GAB_USER_TOKEN'),
  alexUserToken: getEnv('ALEX_USER_TOKEN'),

  // Craps tuning
  crapsMinBet: getNumberEnv('CRAPS_MIN_BET', 5),
  crapsMaxBet: getNumberEnv('CRAPS_MAX_BET', 10000),
  crapsJoinSecs: getNumberEnv('CRAPS_JOIN_SECS', 30),
  crapsBetSecs: getNumberEnv('CRAPS_BET_SECS', 30),
  crapsRollSecs: getNumberEnv('CRAPS_ROLL_SECS', 45),
  crapsPointBetSecs: getNumberEnv('CRAPS_POINT_BET_SECS', 45),

  // F1 tuning
  f1EntryFeeStarter: getNumberEnv('F1_ENTRY_FEE_STARTER', 1500),
  f1EntryFeePro: getNumberEnv('F1_ENTRY_FEE_PRO', 2100),
  f1EntryFeeHyper: getNumberEnv('F1_ENTRY_FEE_HYPER', 3400),
  f1EntryFeeLegendary: getNumberEnv('F1_ENTRY_FEE_LEGENDARY', 7200),
  f1RaceEntryFeeRookie: getNumberEnv('F1_RACE_ENTRY_FEE_ROOKIE', 1000),
  f1RaceEntryFeeOpen: getNumberEnv('F1_RACE_ENTRY_FEE_OPEN', 2500),
  f1RaceEntryFeeElite: getNumberEnv('F1_RACE_ENTRY_FEE_ELITE', 5000),
  f1HouseRakePct: getNumberEnv('F1_HOUSE_RAKE_PCT', 10),
  f1PurseFloorRookie: getNumberEnv('F1_PURSE_FLOOR_ROOKIE', 9000),
  f1PurseFloorOpen: getNumberEnv('F1_PURSE_FLOOR_OPEN', 22500),
  f1PurseFloorElite: getNumberEnv('F1_PURSE_FLOOR_ELITE', 45000),
  f1DragPurseFloorStarter: getNumberEnv('F1_DRAG_PURSE_FLOOR_STARTER', 250),
  f1DragPurseFloorPro: getNumberEnv('F1_DRAG_PURSE_FLOOR_PRO', 500),
  f1DragPurseFloorHyper: getNumberEnv('F1_DRAG_PURSE_FLOOR_HYPER', 900),
  f1DragPurseFloorLegendary: getNumberEnv('F1_DRAG_PURSE_FLOOR_LEGENDARY', 1400),
  f1PoleBonus: getNumberEnv('F1_POLE_BONUS', 250),
  f1FastestLapBonus: getNumberEnv('F1_FASTEST_LAP_BONUS', 400),
  f1TeamCreateFee: getNumberEnv('F1_TEAM_CREATE_FEE', 12500),
  f1TeamRerollFee: getNumberEnv('F1_TEAM_REROLL_FEE', 6500),
  f1CarRenameFee: getNumberEnv('F1_CAR_RENAME_FEE', 6500),
  f1RepairCostPerPointStarter: getNumberEnv('F1_REPAIR_COST_PER_POINT_STARTER', 30),
  f1RepairCostPerPointPro: getNumberEnv('F1_REPAIR_COST_PER_POINT_PRO', 44),
  f1RepairCostPerPointHyper: getNumberEnv('F1_REPAIR_COST_PER_POINT_HYPER', 68),
  f1RepairCostPerPointLegendary: getNumberEnv('F1_REPAIR_COST_PER_POINT_LEGENDARY', 95),
  f1GarageUpkeepPerExtraStarter: getNumberEnv('F1_GARAGE_UPKEEP_PER_EXTRA_STARTER', 200),
  f1GarageUpkeepPerExtraPro: getNumberEnv('F1_GARAGE_UPKEEP_PER_EXTRA_PRO', 400),
  f1GarageUpkeepPerExtraHyper: getNumberEnv('F1_GARAGE_UPKEEP_PER_EXTRA_HYPER', 750),
  f1GarageUpkeepPerExtraLegendary: getNumberEnv('F1_GARAGE_UPKEEP_PER_EXTRA_LEGENDARY', 1250),
  f1BetMin: getNumberEnv('F1_BET_MIN', 25),
  f1BetMax: getNumberEnv('F1_BET_MAX', 10000),
  f1OddsEdgePct: getNumberEnv('F1_ODDS_EDGE_PCT', 15),
  f1BetMarketMultStarter: getNumberEnv('F1_BET_MARKET_MULT_STARTER', 1.00),
  f1BetMarketMultPro: getNumberEnv('F1_BET_MARKET_MULT_PRO', 1.03),
  f1BetMarketMultHyper: getNumberEnv('F1_BET_MARKET_MULT_HYPER', 1.12),
  f1BetMarketMultLegendary: getNumberEnv('F1_BET_MARKET_MULT_LEGENDARY', 1.30),
  f1EliteStatDeltaHyper: getNumberEnv('F1_ELITE_STAT_DELTA_HYPER', 1),
  f1EliteStatDeltaLegendary: getNumberEnv('F1_ELITE_STAT_DELTA_LEGENDARY', -2),
  f1CarImageBaseUrl: getEnv('F1_CAR_IMAGE_BASE_URL', {
    defaultValue: 'https://raw.githubusercontent.com/smitty222/jambot/main/src/games/f1race/assets/cars'
  }),

  // Logging
  logLevel: getEnv('LOG_LEVEL', { defaultValue: getEnv('NODE_ENV', { defaultValue: 'development' }) === 'production' ? 'info' : 'debug' }),
  logFile: getEnv('LOG_FILE'),
  logToFile: getEnv('LOG_TO_FILE'),

  // Misc features
  allUsersIds: getEnv('ALLEN_USER_IDS'),
  dmAllowList: getEnv('DM_ALLOW_LIST'),
  themeForce: getEnv('FORCE_ALBUM_THEME'),

  // Error reporting
  sentryDsn: getEnv('SENTRY_DSN', { defaultValue: null })
}

const REQUIRED_ENV_VARS = [
  ['CHAT_API_KEY', env.chatApiKey],
  ['CHAT_TOKEN', env.chatToken],
  ['CHAT_USER_ID', env.chatUserId],
  ['ROOM_UUID', env.roomUuid],
  ['TTL_USER_TOKEN', env.ttlUserToken]
]

/**
 * Runs validation on the required runtime environment variables. Importing
 * this module stays safe in tests; the application entry point calls this
 * function to enforce production/runtime requirements before boot.
 */
export function validateConfig () {
  const missing = REQUIRED_ENV_VARS
    .filter(([, value]) => value === undefined || value === '')
    .map(([name]) => name)

  if (missing.length > 0) {
    throw new Error(`Configuration error: required env var${missing.length > 1 ? 's' : ''} ${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} not set`)
  }

  return true
}
