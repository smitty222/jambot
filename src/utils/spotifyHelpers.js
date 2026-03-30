export function extractSpotifyAlbumId (input) {
  const s = String(input || '').trim()
  if (/^[A-Za-z0-9]{15,30}$/.test(s)) return s
  const m1 = s.match(/open\.spotify\.com\/album\/([A-Za-z0-9]{15,30})/i)
  if (m1?.[1]) return m1[1]
  const m2 = s.match(/spotify:album:([A-Za-z0-9]{15,30})/i)
  if (m2?.[1]) return m2[1]
  return null
}

export function extractSpotifyPlaylistId (input) {
  const s = String(input || '').trim()
  if (/^[A-Za-z0-9]{15,30}$/.test(s)) return s
  const m1 = s.match(/open\.spotify\.com\/playlist\/([A-Za-z0-9]{15,30})/i)
  if (m1?.[1]) return m1[1]
  const m2 = s.match(/spotify:playlist:([A-Za-z0-9]{15,30})/i)
  if (m2?.[1]) return m2[1]
  return null
}
