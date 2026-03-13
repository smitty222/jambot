export function getHealthStatus ({
  db,
  connected = false,
  uptime = 0,
  startupGraceSeconds = 0
}) {
  const okDb = Boolean(db?.available)
  const withinStartupGrace = Number(uptime) < Number(startupGraceSeconds || 0)
  const ready = okDb && (Boolean(connected) || withinStartupGrace)

  return {
    ok: ready,
    db: okDb,
    connected: Boolean(connected),
    uptime,
    startupGraceSeconds: Number(startupGraceSeconds || 0)
  }
}
