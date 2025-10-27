// src/libs/queueManager.js
import db from '../database/db.js'

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
      const row = db.prepare('SELECT nickname FROM users WHERE uuid = ?').get(userId)
      if (row?.nickname) return row.nickname
    } catch (_) {}

    // Last resort: just echo UUID
    return userId
  }

  // Entire queue, oldest first
  async getQueue () {
    const rows = db.prepare(`
      SELECT userId, username, joinedAt
      FROM dj_queue
      ORDER BY id ASC
    `).all()
    return rows
  }

  // Peek at who's first in line (but do NOT remove)
  async getCurrentUser () {
    const user = db.prepare(`
      SELECT userId, username, joinedAt
      FROM dj_queue
      ORDER BY id ASC
      LIMIT 1
    `).get()
    return user || null
  }

  // Add a user if they're not already queued
  async joinQueue (userId) {
    // Are they already in queue?
    const exists = db.prepare(
      'SELECT username FROM dj_queue WHERE userId = ? LIMIT 1'
    ).get(userId)

    if (exists) {
      return {
        success: false,
        username: exists.username || 'Unknown'
      }
    }

    const username = await this.resolveUsername(userId)

    db.prepare(`
      INSERT INTO dj_queue (userId, username, joinedAt)
      VALUES (?, ?, ?)
    `).run(userId, username, new Date().toISOString())

    return {
      success: true,
      username
    }
  }

  // Remove ALL rows for a given userId
  async leaveQueue (userId) {
    const info = db.prepare(
      'DELETE FROM dj_queue WHERE userId = ?'
    ).run(userId)
    return info.changes > 0
  }

  // Advance the queue:
  // - Take the first user in line
  // - Remove them from dj_queue
  // - RETURN THAT USER (this is the one we are promoting)
  async advanceQueue () {
    const first = db.prepare(`
      SELECT id, userId, username, joinedAt
      FROM dj_queue
      ORDER BY id ASC
      LIMIT 1
    `).get()

    if (!first) {
      return null
    }

    // delete just that row (id-based delete so we don't accidentally
    // wipe duplicate entries if they somehow exist)
    db.prepare(
      'DELETE FROM dj_queue WHERE id = ?'
    ).run(first.id)

    return {
      userId: first.userId,
      username: first.username,
      joinedAt: first.joinedAt
    }
  }

  // Utility: clear queue
  async clearQueue () {
    db.prepare('DELETE FROM dj_queue').run()
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
