import { readRecentSongs } from "../libs/bot.js";
import { askQuestion } from "../libs/ai.js";
import { searchSpotify } from "./API.js";

async function getPopularSpotifyTrackID(minPopularity = 1) {
    const recentSongs = readRecentSongs();
    if (!recentSongs || recentSongs.length === 0) {
        console.log("No recent songs available.");
        return null;
    }

    // Format recent songs for AI prompt
    const songList = recentSongs.map(song => `Track: *${song.trackName}* | Artist: *${song.artistName}*`).join('\n');
    const question = `Here is a list of songs I've listened to recently:\n${songList}\n\nCan you suggest some similar songs that I may enjoy? Follow this format:\n\nTrack: <Track Name> | Artist: <Artist Name>\n\nEach suggestion should be on a new line, with no extra commentary.`;

    // Get AI response
    const aiResponse = await askQuestion(question);
    console.log("AI Response:", aiResponse);  // Log AI response for debugging

    // Use regex to extract track and artist names
    const songSuggestions = aiResponse.split("\n").map(line => {
        const match = line.match(/Track: (.+) \| Artist: (.+)/);
        return match ? { trackName: match[1].trim(), artistName: match[2].trim() } : null;
    }).filter(Boolean);

    if (songSuggestions.length === 0) {
        console.log("AI did not return valid song suggestions.");
        return null;
    }

    // Run Spotify searches in parallel
    const trackDetailsArray = (await Promise.all(
        songSuggestions.map(async ({ trackName, artistName }) => {
            if (!trackName || !artistName) return null;
            try {
                const trackDetails = await searchSpotify(artistName, trackName);
                if (trackDetails && trackDetails.popularity >= minPopularity) {
                    return trackDetails;
                }
                return null;
            } catch (error) {
                console.error(`Error fetching ${trackName} by ${artistName}:`, error);
                return null;
            }
        })
    )).filter(Boolean);

    if (trackDetailsArray.length === 0) {
        console.log("No songs met the popularity threshold.");
        return null;
    }

    console.log("Tracks that met popularity threshold:", trackDetailsArray);

    // Select the track with the highest popularity
    const selectedTrack = trackDetailsArray.reduce((prev, current) =>
        prev.popularity > current.popularity ? prev : current
    );

    console.log(`Selected Track: ${selectedTrack.spotifyTrackName} by ${selectedTrack.spotifyArtistName} (ID: ${selectedTrack.spotifyTrackID}, Popularity: ${selectedTrack.popularity})`);
    return selectedTrack.spotifyTrackID;
}

export { getPopularSpotifyTrackID };
