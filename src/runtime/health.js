export function getHealthStatus ({
  db,
  connected = false,
  uptime = 0
}) {
  const okDb = Boolean(db?.available)

  return {
    ok: okDb,
    connected: Boolean(connected),
    uptime
  }
}
