const noopStatement = {
  get () { return undefined },
  all () { return [] },
  run () { return { changes: 0, lastInsertRowid: 0 } },
  iterate () { return [][Symbol.iterator]() },
  pluck () { return this },
  raw () { return this },
  bind () { return this }
}

function ensureSlotsSchemaStatement (db, sql, label) {
  try {
    db.prepare(sql).run()
  } catch (e) {
    console.error(`[Slots] Failed ensuring ${label}:`, e)
  }
}

function prepareSlotStatement (db, sql, label) {
  try {
    return db.prepare(sql)
  } catch (e) {
    console.error(`[Slots] Failed preparing ${label}:`, e)
    return noopStatement
  }
}

export function createSlotsPersistence (db, jackpotSeed) {
  ensureSlotsSchemaStatement(db, `
    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `, 'app_settings')

  ensureSlotsSchemaStatement(db, `
    CREATE TABLE IF NOT EXISTS slot_collections (
      userUUID  TEXT PRIMARY KEY,
      data      TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `, 'slot_collections')

  ensureSlotsSchemaStatement(db, `
    CREATE TABLE IF NOT EXISTS slot_bonus_sessions (
      userUUID  TEXT PRIMARY KEY,
      data      TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `, 'slot_bonus_sessions')

  ensureSlotsSchemaStatement(db, `
    CREATE TABLE IF NOT EXISTS slot_feature_sessions (
      userUUID  TEXT PRIMARY KEY,
      data      TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `, 'slot_feature_sessions')

  ensureSlotsSchemaStatement(db, `
    CREATE TABLE IF NOT EXISTS slot_jackpot_contributions (
      userUUID               TEXT PRIMARY KEY,
      lifetimeContributed    REAL NOT NULL DEFAULT 0,
      effectiveContributed   REAL NOT NULL DEFAULT 0,
      updatedAt              TEXT NOT NULL
    )
  `, 'slot_jackpot_contributions')

  ensureSlotsSchemaStatement(db, `
    CREATE TABLE IF NOT EXISTS jackpot (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      progressiveJackpot REAL DEFAULT 100
    )
  `, 'jackpot')

  ensureSlotsSchemaStatement(db, `
    INSERT OR IGNORE INTO jackpot (id, progressiveJackpot)
    VALUES (1, ${Number(jackpotSeed) || 100})
  `, 'jackpot seed')

  return {
    readSetting: prepareSlotStatement(db, 'SELECT value FROM app_settings WHERE key = ?', 'readSetting'),
    writeSetting: prepareSlotStatement(db, `
      INSERT INTO app_settings(key, value)
      VALUES(?, ?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value
    `, 'writeSetting'),
    clearCollections: prepareSlotStatement(db, 'DELETE FROM slot_collections', 'clearCollections'),
    recordJackpotContribution: prepareSlotStatement(db, `
      INSERT INTO slot_jackpot_contributions (userUUID, lifetimeContributed, effectiveContributed, updatedAt)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(userUUID) DO UPDATE SET
        lifetimeContributed = lifetimeContributed + excluded.lifetimeContributed,
        effectiveContributed = effectiveContributed + excluded.effectiveContributed,
        updatedAt = excluded.updatedAt
    `, 'recordJackpotContribution'),
    scaleEffectiveContributions: prepareSlotStatement(db, `
      UPDATE slot_jackpot_contributions
      SET effectiveContributed = effectiveContributed * ?,
          updatedAt = ?
    `, 'scaleEffectiveContributions'),
    getUserJackpotContribution: prepareSlotStatement(db, `
      SELECT lifetimeContributed, effectiveContributed
      FROM slot_jackpot_contributions
      WHERE userUUID = ?
    `, 'getUserJackpotContribution'),
    getJackpotContributionTotals: prepareSlotStatement(db, `
      SELECT COALESCE(SUM(effectiveContributed), 0) AS totalEffective
      FROM slot_jackpot_contributions
    `, 'getJackpotContributionTotals'),
    getJackpotValue: prepareSlotStatement(db, 'SELECT progressiveJackpot FROM jackpot WHERE id = 1', 'getJackpotValue'),
    updateJackpotValue: prepareSlotStatement(db, 'UPDATE jackpot SET progressiveJackpot = ? WHERE id = 1', 'updateJackpotValue'),
    getBonusSession: prepareSlotStatement(db, 'SELECT data FROM slot_bonus_sessions WHERE userUUID = ?', 'getBonusSession'),
    saveBonusSession: prepareSlotStatement(db, `
      INSERT INTO slot_bonus_sessions(userUUID, data, updatedAt)
      VALUES(?, ?, ?)
      ON CONFLICT(userUUID) DO UPDATE SET data=excluded.data, updatedAt=excluded.updatedAt
    `, 'saveBonusSession'),
    clearBonusSession: prepareSlotStatement(db, 'DELETE FROM slot_bonus_sessions WHERE userUUID = ?', 'clearBonusSession'),
    getFeatureSession: prepareSlotStatement(db, 'SELECT data FROM slot_feature_sessions WHERE userUUID = ?', 'getFeatureSession'),
    saveFeatureSession: prepareSlotStatement(db, `
      INSERT INTO slot_feature_sessions(userUUID, data, updatedAt)
      VALUES(?, ?, ?)
      ON CONFLICT(userUUID) DO UPDATE SET data=excluded.data, updatedAt=excluded.updatedAt
    `, 'saveFeatureSession'),
    clearFeatureSession: prepareSlotStatement(db, 'DELETE FROM slot_feature_sessions WHERE userUUID = ?', 'clearFeatureSession'),
    getUserCollection: prepareSlotStatement(db, 'SELECT data FROM slot_collections WHERE userUUID = ?', 'getUserCollection'),
    saveUserCollection: prepareSlotStatement(db, `
      INSERT INTO slot_collections(userUUID, data, updatedAt)
      VALUES(?, ?, ?)
      ON CONFLICT(userUUID) DO UPDATE SET data=excluded.data, updatedAt=excluded.updatedAt
    `, 'saveUserCollection')
  }
}
