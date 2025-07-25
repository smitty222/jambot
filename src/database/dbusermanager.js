// src/database/dbUserManager.js
import db from './db.js'

export function loadUsersFromDb() {
  const rows = db.prepare('SELECT uuid, nickname FROM users').all()
  return rows.reduce((acc, row) => {
    acc[row.uuid] = { nickname: row.nickname }
    return acc
  }, {})
}
