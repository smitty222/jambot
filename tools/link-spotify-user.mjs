import '../src/database/initdb.js'
import { upsertSpotifyUserAuth } from '../src/database/dbspotifyauth.js'

function readArg (name) {
  const idx = process.argv.indexOf(name)
  if (idx === -1) return ''
  return String(process.argv[idx + 1] || '').trim()
}

const userUuid = readArg('--user')
const spotifyUserId = readArg('--spotify-user')
const refreshToken = readArg('--refresh-token')
const accessToken = readArg('--access-token')
const scopes = readArg('--scopes')
const expiresAtRaw = readArg('--expires-at')

if (!userUuid || !refreshToken) {
  console.error('Usage: node tools/link-spotify-user.mjs --user <tt_user_uuid> --refresh-token <spotify_refresh_token> [--spotify-user <spotify_user_id>] [--access-token <spotify_access_token>] [--expires-at <epoch_ms>] [--scopes <space-delimited-scopes>]')
  process.exit(1)
}

const expiresAt = expiresAtRaw ? Number(expiresAtRaw) : null
upsertSpotifyUserAuth({
  userUuid,
  spotifyUserId,
  refreshToken,
  accessToken,
  expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
  scopes
})

console.log(`Stored Spotify auth for ${userUuid}${spotifyUserId ? ` (${spotifyUserId})` : ''}`)
