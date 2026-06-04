// src/libs/queueManager.js
import db from '../database/db.js'

// ── Prepared statements (compiled once at module load) ────────────────────────
const stmtGetNickname = db.prepare('SELECT nickname FROM users WHERE uuid = ?')
const stmtGetQueue = db.prepare('SELECT userId, username, joinedAt FROM dj_queue ORDER BY id ASC')
const stmtGetFirst = db.prepare('SELECT userId, username, joinedAt FROM dj_queue ORDER BY id ASC LIMIT 1')
const stmtGetFirstFull = db.prepare('SELECT id, userId, username, joinedAt FROM dj_queue ORDER BY id ASC LIMIT 1')
const stmtInsertQueue = db.prepare('INSERT OR IGNORE INTO dj_queue (userId, username, joinedAt) VALUES (?, ?, ?)')
const stmtGetQueueUser = db.prepare('SELECT username FROM dj_queue WHERE userId = ? LIMIT 1')
const stmtDeleteUser = db.prepare('DELETE FROM dj_queue WHERE userId = ?')
const stmtDeleteById = db.prepare('DELETE FROM dj_queue WHERE id = ?')
const stmtClearQueue = db.prepare('DELETE FROM dj_queue')

// QueueManager manages the DJ queue stored in the dj_queue table.
// It exposes helpers to inspect, join, advance, and leave.

export class QueueManager {
  constructor (getUsernameFn = null) {
    this.getUserNickname =
      typeof getUsernameFn === 'function' ? getUsernameFn : null
  }

  async resolveUsername (userId) {
    // Prefer injected resolver (nickname logic from getUserNickname)
    if (this.getUserNickname) {
      try {
        const name = await this.getUserNickname(userId)
        if (name) return name
      } catch (_) {}
    }

    // Fallback to DB users table
    try {
      const row = stmtGetNickname.get(userId)
      if (row?.nickname) return row.nickname
    } catch (_) {}

    // Last resort: just echo UUID
    return userId
  }

  // Entire queue, oldest first
  async getQueue () {
    return stmtGetQueue.all()
  }

  // Peek at who's first in line (but do NOT remove)
  async getCurrentUser () {
    return stmtGetFirst.get() || null
  }

  // Add a user if they're not already queued
  async joinQueue (userId) {
    const username = await this.resolveUsername(userId)

    const info = stmtInsertQueue.run(userId, username, new Date().toISOString())
    const inserted = stmtGetQueueUser.get(userId)

    if (info.changes === 0) {
      return {
        success: false,
        username: inserted?.username || username
      }
    }

    return {
      success: true,
      username: inserted?.username || username
    }
  }

  // Remove ALL rows for a given userId
  async leaveQueue (userId) {
    const info = stmtDeleteUser.run(userId)
    return info.changes > 0
  }

  // Advance the queue:
  // - Take the first user in line
  // - Remove them from dj_queue
  // - RETURN THAT USER (this is the one we are promoting)
  async advanceQueue () {
    const first = stmtGetFirstFull.get()

    if (!first) {
      return null
    }

    // delete just that row (id-based delete so we don't accidentally
    // wipe duplicate entries if they somehow exist)
    stmtDeleteById.run(first.id)

    return {
      userId: first.userId,
      username: first.username,
      joinedAt: first.joinedAt
    }
  }

  // Utility: clear queue
  async clearQueue () {
    stmtClearQueue.run()
  }

  // Is this user currently first?
  async isUserNext (userId) {
    const current = await this.getCurrentUser()
    return current?.userId === userId
  }

  // If this user is not first anymore, boot them from the queue
  async removeIfNotNext (userId) {
    const stillNext = await this.isUserNext(userId)
    if (!stillNext) {
      await this.leaveQueue(userId)
    }
    return stillNext
  }

  // (optional) loadQueue() and saveQueue() not needed with DB,
  // so I'm leaving them out in this cleaned version.
}
