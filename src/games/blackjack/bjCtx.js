// src/games/blackjack/bjCtx.js
export function parseTableFlag (message) {
  const m = /\B--table(?:=|\s+)([A-Za-z0-9:_-]{1,40})/i.exec(message || '')
  return m ? m[1] : null
}

export function bjCtxFromPayload (payload, fallbackRoomUuid) {
  const room = payload.room || fallbackRoomUuid || process.env.ROOM_UUID
  const flagId = parseTableFlag(payload.message || '')
  const tableId = flagId || room // default = one table per room
  const tag = `[BJ ${String(tableId).slice(-4).toUpperCase()}]`
  return { tableId, room, tag }
}
