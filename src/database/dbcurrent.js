import db from './db.js'

const UPSERT_SQL = `
  INSERT INTO current_state (
    id,
    songId, trackName, spotifyTrackId, spotifyUrl,
    artistName, albumName, releaseDate, albumType,
    trackNumber, totalTracks, songDuration,
    albumArt, popularity, previewUrl, isrc, albumID,
    albumAlbumID, albumNameField, albumArtistName,
    albumReleaseDate, albumArtField, albumTypeField, albumIsrc
  ) VALUES (
    1,  @songId, @trackName, @spotifyTrackId, @spotifyUrl,
        @artistName, @albumName, @releaseDate, @albumType,
        @trackNumber, @totalTracks, @songDuration,
        @albumArt, @popularity, @previewUrl, @isrc, @albumID,
        @albumAlbumID, @albumNameField, @albumArtistName,
        @albumReleaseDate, @albumArtField, @albumTypeField, @albumIsrc
  )
  ON CONFLICT(id) DO UPDATE SET
    songId          = excluded.songId,
    trackName       = excluded.trackName,
    spotifyTrackId  = excluded.spotifyTrackId,
    spotifyUrl      = excluded.spotifyUrl,
    artistName      = excluded.artistName,
    albumName       = excluded.albumName,
    releaseDate     = excluded.releaseDate,
    albumType       = excluded.albumType,
    trackNumber     = excluded.trackNumber,
    totalTracks     = excluded.totalTracks,
    songDuration    = excluded.songDuration,
    albumArt        = excluded.albumArt,
    popularity      = excluded.popularity,
    previewUrl      = excluded.previewUrl,
    isrc            = excluded.isrc,
    albumID         = excluded.albumID,
    albumAlbumID    = excluded.albumAlbumID,
    albumNameField  = excluded.albumNameField,
    albumArtistName = excluded.albumArtistName,
    albumReleaseDate= excluded.albumReleaseDate,
    albumArtField   = excluded.albumArtField,
    albumTypeField  = excluded.albumTypeField,
    albumIsrc       = excluded.albumIsrc
`

export function saveCurrentState ({ currentSong, currentAlbum }) {
  const stmt = db.prepare(UPSERT_SQL)
  stmt.run({
    songId: currentSong.songId,
    trackName: currentSong.trackName,
    spotifyTrackId: currentSong.spotifyTrackId,
    spotifyUrl: currentSong.spotifyUrl,
    artistName: currentSong.artistName,
    albumName: currentSong.albumName,
    releaseDate: currentSong.releaseDate,
    albumType: currentSong.albumType,
    trackNumber: currentSong.trackNumber,
    totalTracks: currentSong.totalTracks,
    songDuration: currentSong.songDuration,
    albumArt: currentSong.albumArt,
    popularity: currentSong.popularity,
    previewUrl: currentSong.previewUrl,
    isrc: currentSong.isrc,
    albumID: currentSong.albumID,

    // album fields (rename to avoid collision)
    albumAlbumID: currentAlbum.albumID,
    albumNameField: currentAlbum.albumName,
    albumArtistName: currentAlbum.artistName,
    albumReleaseDate: currentAlbum.releaseDate,
    albumArtField: currentAlbum.albumArt,
    albumTypeField: currentAlbum.albumType,
    albumIsrc: currentAlbum.isrc
  })
}

// src/database/dbcurrent.js
export function getCurrentState () {
  return db
    .prepare('SELECT * FROM current_state WHERE id = 1')
    .get()
}
