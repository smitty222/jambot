import db from './db.js'
import { sanitizeNickname, formatMention } from '../utils/names.js'

// Utility to determine if a column exists on a table
function hasColumn (table, name) {
  const cols = db.prepare('PRAGMA table_info(' + table + ')').all()
  return cols.some(c => c.name === name)
}

// Ensure the necessary columns exist before attempting to update data. If
// columns are missing we add them with sensible defaults. This script
// mirrors the migrations found in initdb.js but is safe to run
// independently on an existing database.
function ensureSchema () {
  if (!hasColumn('users', 'displayname')) {
    db.exec("ALTER TABLE users ADD COLUMN displayname TEXT NOT NULL DEFAULT '';")
    // Initialise displayname with the old nickname value
    db.exec("UPDATE users SET displayname = nickname WHERE displayname = '' OR displayname IS NULL;")
    console.log('Added users.displayname and backfilled values')
  }
  if (!hasColumn('lottery_winners', 'displayName')) {
    db.exec("ALTER TABLE lottery_winners ADD COLUMN displayName TEXT NOT NULL DEFAULT '';")
    db.exec("UPDATE lottery_winners SET displayName = nickname WHERE displayName = '' OR displayName IS NULL;")
    console.log('Added lottery_winners.displayName and backfilled values')
  }
  if (!hasColumn('lottery_winners', 'nickname')) {
    db.exec("ALTER TABLE lottery_winners ADD COLUMN nickname TEXT NOT NULL DEFAULT '';")
    console.log('Added lottery_winners.nickname column')
  }
  if (!hasColumn('craps_records', 'shooterDisplayName')) {
    db.exec('ALTER TABLE craps_records ADD COLUMN shooterDisplayName TEXT;')
    db.exec("UPDATE craps_records SET shooterDisplayName = shooterNickname WHERE shooterDisplayName IS NULL OR shooterDisplayName = '';")
    console.log('Added craps_records.shooterDisplayName and backfilled values')
  }
  if (!hasColumn('craps_records', 'shooterNickname')) {
    db.exec('ALTER TABLE craps_records ADD COLUMN shooterNickname TEXT;')
    console.log('Added craps_records.shooterNickname column')
  }
}

function updateUsers () {
  const rows = db.prepare('SELECT uuid, nickname, displayname FROM users').all()
  for (const row of rows) {
    const uuid = row.uuid
    // Determine a cleaned display name. If the existing displayname is
    // empty we sanitise the current nickname. The sanitize helper will
    // strip mention wrappers and return an empty string when
    // encountering a mention token.
    const currentDisplay = row.displayname?.toString().trim()
    const currentNick = row.nickname?.toString().trim()
    let clean = ''
    if (currentDisplay && currentDisplay.length > 0) {
      // displayname already populated, keep as is
      clean = currentDisplay
    } else {
      clean = sanitizeNickname(currentNick)
    }
    // Fallback to UUID when no clean nickname exists
    const displayName = clean || uuid
    // Always set nickname to the mention format
    const mention = formatMention(uuid)
    db.prepare('UPDATE users SET nickname = ?, displayname = ? WHERE uuid = ?').run(mention, displayName, uuid)
  }
  console.log(`Updated ${rows.length} users with mention and displayname`)
}

function updateLotteryWinners () {
  const rows = db.prepare('SELECT id, userId, nickname, displayName FROM lottery_winners').all()
  for (const row of rows) {
    const id = row.id
    const userId = row.userId
    // Sanitize the current displayName or nickname
    const currentDisplay = row.displayName?.toString().trim()
    const currentNick = row.nickname?.toString().trim()
    let clean = ''
    if (currentDisplay && currentDisplay.length > 0) {
      clean = sanitizeNickname(currentDisplay)
    } else {
      clean = sanitizeNickname(currentNick)
    }
    const displayName = clean || userId
    const mention = formatMention(userId)
    db.prepare('UPDATE lottery_winners SET nickname = ?, displayName = ? WHERE id = ?').run(mention, displayName, id)
  }
  console.log(`Updated ${rows.length} lottery_winners with mention and displayName`)
}

function updateCrapsRecords () {
  const rows = db.prepare('SELECT roomId, shooterId, shooterNickname, shooterDisplayName FROM craps_records').all()
  for (const row of rows) {
    const roomId = row.roomId
    const shooterId = row.shooterId
    const currentDisplay = row.shooterDisplayName?.toString().trim()
    const currentNick = row.shooterNickname?.toString().trim()
    let clean = ''
    if (currentDisplay && currentDisplay.length > 0) {
      clean = sanitizeNickname(currentDisplay)
    } else {
      clean = sanitizeNickname(currentNick)
    }
    const displayName = clean || shooterId
    const mention = formatMention(shooterId)
    db.prepare('UPDATE craps_records SET shooterNickname = ?, shooterDisplayName = ? WHERE roomId = ?').run(mention, displayName, roomId)
  }
  console.log(`Updated ${rows.length} craps_records with mention and shooterDisplayName`)
}

function runUpdate () {
  ensureSchema()
  updateUsers()
  updateLotteryWinners()
  updateCrapsRecords()
  console.log('Nickname/displayName migration complete.')
}

runUpdate()
