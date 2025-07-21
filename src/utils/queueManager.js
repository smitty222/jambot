import fsPromises from 'fs/promises'
import fs from 'fs'

export class QueueManager {
  constructor(queueFilePath, getUsernameFn = null) {
    this.queueFile = queueFilePath
    this.getUserNickname = getUsernameFn
  }

  async loadQueue() {
    try {
      if (!fs.existsSync(this.queueFile)) return { queue: [], currentIndex: 0 }

      const contents = await fsPromises.readFile(this.queueFile, 'utf-8')
      if (!contents.trim()) return { queue: [], currentIndex: 0 }

      return JSON.parse(contents)
    } catch (err) {
      console.error(`Failed to load queue from ${this.queueFile}:`, err)
      return { queue: [], currentIndex: 0 }
    }
  }

  async saveQueue(data) {
    try {
      await fsPromises.writeFile(this.queueFile, JSON.stringify(data, null, 2), 'utf8')
    } catch (err) {
      console.error(`Failed to save queue to ${this.queueFile}:`, err)
    }
  }

  async joinQueue(userId) {
    const data = await this.loadQueue()
    if (data.queue.find(u => u.userId === userId)) {
      const existing = data.queue.find(u => u.userId === userId)
      return { success: false, username: existing?.username || 'Unknown' }
    }

    let username = userId
    if (this.getUserNickname) {
      username = await this.getUserNickname(userId)
    }

    data.queue.push({ userId, username, joinedAt: new Date().toISOString() })
    await this.saveQueue(data)
    return { success: true, username }
  }

  async leaveQueue(userId) {
    const data = await this.loadQueue()
    const index = data.queue.findIndex(u => u.userId === userId)
    if (index === -1) return false
    data.queue.splice(index, 1)
    if (data.currentIndex >= data.queue.length) data.currentIndex = 0
    await this.saveQueue(data)
    return true
  }

  async getQueue() {
    const data = await this.loadQueue()
    return data.queue || []
  }

  async getCurrentUser() {
    const data = await this.loadQueue()
    return data.queue[data.currentIndex] || null
  }

  async advanceQueue() {
    const data = await this.loadQueue()
    if (data.queue.length === 0) return null
    data.currentIndex = (data.currentIndex + 1) % data.queue.length
    await this.saveQueue(data)
    return data.queue[data.currentIndex]
  }

  async clearQueue() {
    await this.saveQueue({ queue: [], currentIndex: 0 })
  }

  async isUserNext(userId) {
    const data = await this.loadQueue()
    return data.queue[data.currentIndex]?.userId === userId
  }

  async removeIfNotNext(userId) {
    const isNext = await this.isUserNext(userId)
    if (!isNext) {
      await this.leaveQueue(userId)
    }
    return isNext
  }
}
