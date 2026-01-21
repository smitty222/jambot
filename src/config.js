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

import dotenv from 'dotenv'

// Load variables from a local .env file if present.  If no .env file is
// supplied, dotenv simply does nothing – all variables are expected to be
// provided by the hosting environment (e.g. Fly.io secrets or the shell).
dotenv.config()

/**
 * Helper for reading environment variables with optional validation.
 *
 * @param {string} name The name of the environment variable to read.
 * @param {Object} opts
 * @param {boolean} [opts.required=false] Whether this variable is mandatory.
 * @param {any} [opts.defaultValue] A fallback value if the variable is
 *   undefined. This value is ignored if `required` is true and the
 *   environment variable is missing.
 * @returns {string|undefined} The value of the environment variable or the
 *   supplied default.
 * @throws If the variable is required and missing.
 */
function getEnv (name, { required = false, defaultValue } = {}) {
  const raw = process.env[name]
  if (raw === undefined || raw === '') {
    if (required) {
      throw new Error(`Configuration error: required env var ${name} is not set`)
    }
    return defaultValue
  }
  return raw
}

// Define your configuration keys here. Keep this list organised by area
// (chat, room, AI, Spotify, etc.) so it's easy to see what's required.
export const env = {
  // Chat/CometChat configuration
  chatApiKey: getEnv('CHAT_API_KEY', { required: true }),
  chatToken: getEnv('CHAT_TOKEN', { required: true }),
  chatUserId: getEnv('CHAT_USER_ID', { required: true }),
  chatReplyId: getEnv('CHAT_REPLY_ID'),
  chatAvatarId: getEnv('CHAT_AVATAR_ID', { defaultValue: 'lovable-pixel' }),
  chatName: getEnv('CHAT_NAME', { defaultValue: 'Allen' }),
  chatColour: getEnv('CHAT_COLOUR'),

  // Room/bot configuration
  roomUuid: getEnv('ROOM_UUID', { required: true }),
  botUserUuid: getEnv('BOT_USER_UUID'),
  ttlUserToken: getEnv('TTL_USER_TOKEN', { required: true }),
  tokenRole: getEnv('TOKEN_ROLE'),

  // API keys / third party services
  geminiApiKey: getEnv('GEMINI_API_KEY'),
  openaiApiKey: getEnv('OPENAI_API_KEY'),
  bardCookie: getEnv('BARD_COOKIE'),
  geniusToken: getEnv('GENIUS_TOKEN'),
  oddsApiKey: getEnv('ODDS_API_KEY'),

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
  publishToken: getEnv('PUBLISH_TOKEN'),
  publishStateFile: getEnv('PUBLISH_STATE_FILE'),
  apiBase: getEnv('API_BASE'),

  // Logging
  logLevel: getEnv('LOG_LEVEL', { defaultValue: process.env.NODE_ENV === 'production' ? 'info' : 'debug' }),
  logFile: getEnv('LOG_FILE'),
  logToFile: getEnv('LOG_TO_FILE'),

  // Misc features
  allUsersIds: getEnv('ALLEN_USER_IDS'),
  dmAllowList: getEnv('DM_ALLOW_LIST'),
  themeForce: getEnv('FORCE_ALBUM_THEME')
}

/**
 * Runs validation on all required environment variables. If a required
 * variable is missing, the above getEnv helper will already throw. This
 * function simply exists so you can import and call it from your entry
 * point to perform the checks during startup.
 */
export function validateConfig () {
  // Accessing each property will trigger getEnv and throw if required
  void env.chatApiKey
  void env.chatToken
  void env.chatUserId
  void env.roomUuid
  void env.ttlUserToken
  return true
}
