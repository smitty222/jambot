import { readRecentSongs } from '../libs/bot.js'
import { searchSpotify, getTopTracksByTag, getTopChartTracks } from './API.js'
import { getTheme } from './themeManager.js';
import {themeSynonyms} from '../libs/themeSynonyms.js'
import fs from 'fs';
import path from 'path';

const blacklistPath = path.join(process.cwd(), 'src/libs/songBlacklist.json');

function loadBlacklist() {
  if (!fs.existsSync(blacklistPath)) return [];
  return JSON.parse(fs.readFileSync(blacklistPath, 'utf8'));
}

function isBlacklisted(trackName, artistName) {
  const blacklist = loadBlacklist();
  return blacklist.includes(`${artistName} - ${trackName}`);
}

function normalize(str) {
  return str.toLowerCase().replace(/[^\w\s]/gi, '').trim();
}

export async function getPopularSpotifyTrackID(minPopularity = 0, currentState = null) {
  const recentSongs = readRecentSongs();
  const recentSet = new Set(recentSongs.map(s => normalize(`${s.artistName} - ${s.trackName}`)));
  const botUUID = process.env.BOT_USER_UUID;
  const roomUUID = process.env.ROOM_UUID;

  const currentTheme = getTheme(roomUUID)?.toLowerCase() || 'just jam';
  console.log(`🎨 Current room theme: "${currentTheme}"`);

  // === SPECIAL CASE: HITS THEME ===
  if (currentTheme === 'hits') {
    console.log(`🔥 Using Last.fm top chart tracks for 'Hits' theme...`);
    const chartPool = await getTopChartTracks(50);
    const shuffledChartTracks = chartPool.sort(() => Math.random() - 0.5);
    const chartTracks = shuffledChartTracks.slice(0, 15);

    console.log(`📊 Retrieved ${chartTracks.length} chart tracks.`);

    const validTracks = [];

    for (const { artistName, trackName } of chartTracks) {
      try {
        const trackDetails = await searchSpotify(artistName, trackName);
        if (!trackDetails) {
          console.log(`❌ Spotify search failed: ${trackName} by ${artistName}`);
          continue;
        }

        const normalized = normalize(`${trackDetails.spotifyArtistName} - ${trackDetails.spotifyTrackName}`);

        if (trackDetails.popularity < minPopularity) {
          console.log(`🚫 Too low popularity: ${trackDetails.spotifyTrackName} (${trackDetails.popularity})`);
          continue;
        }
        if (recentSet.has(normalized)) {
          console.log(`🚫 Recently played: ${trackDetails.spotifyTrackName}`);
          continue;
        }
        if (isBlacklisted(trackDetails.spotifyTrackName, trackDetails.spotifyArtistName)) {
          console.log(`🚫 Blacklisted: ${trackDetails.spotifyTrackName} by ${trackDetails.spotifyArtistName}`);
          continue;
        }

        console.log(`✅ Eligible chart track: ${trackDetails.spotifyTrackName} by ${trackDetails.spotifyArtistName}`);
        validTracks.push(trackDetails);

      } catch (err) {
        console.error(`❌ Error processing chart track: ${trackName} by ${artistName}`, err);
      }
    }

    if (validTracks.length > 0) {
      const randomIndex = Math.floor(Math.random() * validTracks.length);
      const selected = validTracks[randomIndex];
      console.log(`🎲 Selected from chart: ${selected.spotifyTrackName} by ${selected.spotifyArtistName}`);
      return selected.spotifyTrackID;
    } else {
      console.log('⚠️ No valid chart tracks found. Falling back to Just Jam logic...');
    }
  }

  // === THEME-BASED TRACK SELECTION ===
  if (currentTheme !== 'just jam' && currentTheme !== 'hits') {
    const tagsToTry = themeSynonyms[currentTheme] || [currentTheme];
    console.log(`🔍 Using Last.fm tag.getTopTracks with tags: ${tagsToTry.join(', ')}`);

    for (const tag of tagsToTry) {
      const tagTracks = await getTopTracksByTag(tag, 10);
      const validTracks = [];

      console.log(`📀 Found ${tagTracks.length} tracks for tag "${tag}"`);

      for (const { artistName, trackName } of tagTracks) {
        try {
          const trackDetails = await searchSpotify(artistName, trackName);
          if (!trackDetails) {
            console.log(`❌ Spotify search failed: ${trackName} by ${artistName}`);
            continue;
          }

          const normalized = normalize(`${trackDetails.spotifyArtistName} - ${trackDetails.spotifyTrackName}`);

          if (trackDetails.popularity < minPopularity) {
            console.log(`🚫 Popularity too low: ${trackDetails.spotifyTrackName} (${trackDetails.popularity})`);
            continue;
          }
          if (recentSet.has(normalized)) {
            console.log(`🚫 Recently played: ${trackDetails.spotifyTrackName}`);
            continue;
          }
          if (isBlacklisted(trackDetails.spotifyTrackName, trackDetails.spotifyArtistName)) {
            console.log(`🚫 Blacklisted: ${trackDetails.spotifyTrackName} by ${trackDetails.spotifyArtistName}`);
            continue;
          }

          console.log(`✅ Eligible themed track: ${trackDetails.spotifyTrackName} by ${trackDetails.spotifyArtistName}`);
          validTracks.push(trackDetails);
        } catch (err) {
          console.error(`❌ Error processing tag track: ${trackName} by ${artistName}`, err);
        }
      }

      if (validTracks.length > 0) {
        const randomIndex = Math.floor(Math.random() * validTracks.length);
        const selected = validTracks[randomIndex];
        console.log(`🎲 Selected from theme: ${selected.spotifyTrackName} by ${selected.spotifyArtistName}`);
        return selected.spotifyTrackID;
      } else {
        console.log(`⚠️ No valid tracks found for tag "${tag}"`);
      }
    }

    console.log('🛑 No valid tag-based songs found. Falling back to Just Jam logic...');
  }

  // === FALLBACK: SIMILAR TRACKS FROM RECENT SONGS ===
  let currentDJCount = 1;
  if (currentState) {
    const djUUIDs = getCurrentDJUUIDs(currentState).filter(uuid => uuid !== botUUID);
    currentDJCount = djUUIDs.length || 1;
  }

  const numRecentSongsToUse = 1 * currentDJCount;
  const userPlayedSongs = recentSongs.filter(song => song.dj !== 'bot');
  const songsToUse = userPlayedSongs.slice(0, numRecentSongsToUse);

  console.log(`🎧 Using similar tracks from ${songsToUse.length} recent user-played song(s)`);

  const similarTrackSuggestions = [];
  for (const song of songsToUse) {
    if (Array.isArray(song.similarTracks)) {
      similarTrackSuggestions.push(...song.similarTracks.filter(t => t?.trackName && t?.artistName));
    }
  }

  console.log(`🎯 Found ${similarTrackSuggestions.length} raw similar tracks to consider.`);

  const validTracks = (await Promise.all(similarTrackSuggestions.map(async ({ trackName, artistName }) => {
    if (!trackName || !artistName) {
      console.log(`⚠️ Missing track or artist`);
      return null;
    }

    try {
      const trackDetails = await searchSpotify(artistName, trackName);
      if (!trackDetails) {
        console.log(`❌ Spotify search failed: ${trackName} by ${artistName}`);
        return null;
      }

      const normalized = normalize(`${trackDetails.spotifyArtistName} - ${trackDetails.spotifyTrackName}`);

      if (trackDetails.popularity < minPopularity) {
        console.log(`🚫 Popularity too low: ${trackDetails.spotifyTrackName} (${trackDetails.popularity})`);
        return null;
      }
      if (recentSet.has(normalized)) {
        console.log(`🚫 Recently played: ${trackDetails.spotifyTrackName}`);
        return null;
      }
      if (isBlacklisted(trackDetails.spotifyTrackName, trackDetails.spotifyArtistName)) {
        console.log(`🚫 Blacklisted: ${trackDetails.spotifyTrackName} by ${trackDetails.spotifyArtistName}`);
        return null;
      }

      console.log(`✅ Eligible fallback track: ${trackDetails.spotifyTrackName} by ${trackDetails.spotifyArtistName}`);
      return trackDetails;

    } catch (err) {
      console.error(`❌ Error processing fallback track: ${trackName} by ${artistName}`, err);
      return null;
    }
  }))).filter(Boolean);

  if (validTracks.length === 0) {
    console.log('❌ No valid fallback tracks found to play.');
    return null;
  }

  const randomIndex = Math.floor(Math.random() * validTracks.length);
  const selected = validTracks[randomIndex];
  console.log(`🎲 Selected from fallback: ${selected.spotifyTrackName} by ${selected.spotifyArtistName}`);
  return selected.spotifyTrackID;
}




