// src/libs/queueManager.js
import db from '../database/db.js'

// No imports from message.js — avoids circular deps
export class QueueManager {
  constructor (getUsernameFn = null) {
    this.getUserNickname =
      typeof getUsernameFn === 'function' ? getUsernameFn : null
  }

  async resolveUsername (userId) {
    // Try injected resolver
    if (this.getUserNickname) {
      try {
        const name = await this.getUserNickname(userId)
        if (name) return name
      } catch (_) {}
    }
    // Fallback: try users table if it exists
    try {
      const row = db.prepare('SELECT nickname FROM users WHERE uuid = ?').get(userId)
      if (row?.nickname) return row.nickname
    } catch (_) {}
    // Last resort: echo the id
    return userId
  }

  async loadQueue () {
    const queue = db.prepare(`
      SELECT userId, username, joinedAt
      FROM dj_queue
      ORDER BY id ASC
    `).all()
    return { queue, currentIndex: 0 }
  }

  async saveQueue () {
    // Not needed with DB-backed queue
  }

  async joinQueue (userId) {
    const exists = db.prepare('SELECT 1 FROM dj_queue WHERE userId = ?').get(userId)
    if (exists) {
      const user = db.prepare('SELECT username FROM dj_queue WHERE userId = ?').get(userId)
      return { success: false, username: user?.username || 'Unknown' }
    }

    const username = await this.resolveUsername(userId)

    db.prepare(`
      INSERT INTO dj_queue (userId, username, joinedAt)
      VALUES (?, ?, ?)
    `).run(userId, username, new Date().toISOString())

    return { success: true, username }
  }

  async leaveQueue (userId) {
    const info = db.prepare('DELETE FROM dj_queue WHERE userId = ?').run(userId)
    return info.changes > 0
  }

  async getQueue () {
    const queue = db.prepare(`
      SELECT userId, username, joinedAt
      FROM dj_queue
      ORDER BY id ASC
    `).all()
    return queue
  }

  async getCurrentUser () {
    const user = db.prepare(`
      SELECT userId, username, joinedAt
      FROM dj_queue
      ORDER BY id ASC
      LIMIT 1
    `).get()
    return user || null
  }

  async advanceQueue () {
    const current = await this.getCurrentUser()
    if (!current) return null
    await this.leaveQueue(current.userId)
    return await this.getCurrentUser()
  }

  async clearQueue () {
    db.prepare('DELETE FROM dj_queue').run()
  }

  async isUserNext (userId) {
    const current = await this.getCurrentUser()
    return current?.userId === userId
  }

  async removeIfNotNext (userId) {
    const isNext = await this.isUserNext(userId)
    if (!isNext) {
      await this.leaveQueue(userId)
    }
    return isNext
  }
}
