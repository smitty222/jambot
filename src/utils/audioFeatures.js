/*import { postMessage } from '../libs/cometchat.js'; // Adjust import paths as needed
import { fetchAudioFeatures} from './API.js';
import { addTracksToPlaylist } from './playlistUpdate.js';

let debounceTimer = null; // Timer to manage debouncing
const DEBOUNCE_DELAY = 1000; // Delay in milliseconds (1 second)


export async function checkAndPostAudioFeatures(currentSong, room) {

  // Assuming the current DJ info is available in `room.currentDj`
  if (room.currentDj?.uuid === process.env.BOT_USER_UUID) {
    console.log('Bot is currently the DJ, skipping checkAndPostAudioFeatures...');
    return; // Exit if the bot is the DJ
  }

  if (!currentSong.trackName || currentSong.trackName === 'Unknown') {
    console.log('No valid track name found, skipping...');
    return;
  }

  const {
    loudness,
    danceability,
    energy,
    valence
  } = currentSong.audioFeatures || {};

  if (loudness === undefined || danceability === undefined || energy === undefined || valence === undefined) {
    console.log('Incomplete audio features data, skipping...');
    return;
  }

  console.log('Audio features:', { loudness, danceability, energy, valence });

  let featureToPost = null;

  if (loudness > -2.0) {
    featureToPost = 'loudness';
  } else if (danceability > 0.93) {
    featureToPost = 'danceability';
  } else if (energy > 0.93) {
    featureToPost = 'energy';
  } else if (valence > 0.93) {
    featureToPost = 'valenceHappy';
  } else if (valence < 0.11) {
    featureToPost = 'valenceSad';
  }

  console.log('Feature to post:', featureToPost);

  if (featureToPost) {
    // Implement debounce logic
    if (debounceTimer) {
      clearTimeout(debounceTimer); // Clear any existing debounce timer
    }

    debounceTimer = setTimeout(async () => {
      await postMessageWithFeature(featureToPost, currentSong, room);
    }, DEBOUNCE_DELAY);
  } else {
    console.log('No feature met the criteria for posting.');
  }
}

async function postMessageWithFeature(feature, currentSong, room) {
  console.log('postMessageWithFeature called with:', { feature });

  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  const features = {
    loudness: {
      gifUrl: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZzlhdm9mZ2xnb3VqNmdxMDEyYWx1bTgyMjZ2aHJ3bmFwajY5NXVidCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/126CZqbY33wNgc/giphy.gif',
      message: `${currentSong.trackName} by ${currentSong.artistName} scored a loudness rating of ${currentSong.audioFeatures.loudness} dB on a scale of -60 to 0`
    },
    danceability: {
      gifUrl: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNGIyenJzdHZlM3Z4ZzAxdWFmNDNhMHF6cGhpZmhmc2g4eGp4NTh1eiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/JTgOyVfSRiMDmNcoj0/giphy.gif',
      message: `${currentSong.trackName} by ${currentSong.artistName} scored a danceability rating of ${currentSong.audioFeatures.danceability} on a scale of 0 to 1. Start dancing!`
    },
    energy: {
      gifUrl: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExaGQwYjFrbjNoeG9haXF5bWJxd2Y1aGY5amo0M25uNmpqNWJvamRnNSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/sfvVcEvsC6BoI/giphy.gif',
      message: `${currentSong.trackName} by ${currentSong.artistName} scored an energy rating of ${currentSong.audioFeatures.energy} on a scale of 0 to 1.`
    },
    valenceHappy: {
      gifUrl: 'https://media.giphy.com/media/CyoQdbc7FHqqTpkSPI/giphy.gif?cid=790b76114q12xnozb9iot6dvhsh7d7mwp179jxtyr6b8thrz&ep=v1_gifs_search&rid=giphy.gif&ct=g',
      message: `${currentSong.trackName} by ${currentSong.artistName} scored a valence rating of ${currentSong.audioFeatures.valence} on a scale of 0 to 1 meaning this is a very happy song!`
    },
    valenceSad: {
      gifUrl: 'https://media.giphy.com/media/yONd8hlMtvY1W/giphy.gif?cid=ecf05e47xbgk28p1ogoi4v0t2um19vhafeqpg89c93mcjkbw&ep=v1_gifs_search&rid=giphy.gif&ct=g',
      message: `${currentSong.trackName} by ${currentSong.artistName} scored a valence rating of ${currentSong.audioFeatures.valence} on a scale of 0 to 1 meaning this is a very sad song.`
    }
  };

  const { gifUrl, message } = features[feature] || {};

  if (!gifUrl || !message) {
    console.warn('Unknown feature type:', feature);
    return; // Exit if feature type is unknown
  }

  console.log('Posting message with feature:', { gifUrl, message });

  try {
    await delay(20000);
    await postMessage({ room, images: [gifUrl] });
    await postMessage({ room, message });
  } catch (error) {
    console.error('Error posting message with delay:', error);
  }
}

export async function addHappySongsToPlaylist(trackId, room) {
  try {
    const audioFeatures = await fetchAudioFeatures(trackId);
    if (audioFeatures.valence > 0.85) {
      console.log(`Track has a valence rating of ${audioFeatures.valence}. Adding to playlist.`);
      const happyPlaylistId = process.env.HAPPY_PLAYLIST_ID;
      const trackUri = `spotify:track:${trackId}`;
      const snapshotId = await addTracksToPlaylist(happyPlaylistId, [trackUri]);
      if (snapshotId) {
        console.log('Track successfully added to the happy playlist.');

        // Post a message announcing the song was added
        const message = `🎉 This track has been added to the Happy Songs playlist!`;
        await postMessage({ room, message });

        return true;
      }
    } else {
      console.log(`Track's valence rating is ${audioFeatures.valence}, which is below the threshold. Skipping...`);
    }
  } catch (error) {
    console.error('Error in addHappySongsToPlaylist:', error);
  }
  return false;
}

export async function addDanceSongsToPlaylist(trackId, room) {
  try {
    const audioFeatures = await fetchAudioFeatures(trackId);
    if (audioFeatures.danceability > 0.85) {
      console.log(`Track has a danceability rating of ${audioFeatures.danceability}. Adding to playlist.`);
      const dancePlaylistId = process.env.DANCE_PLAYLIST_ID;
      const trackUri = `spotify:track:${trackId}`;
      const snapshotId = await addTracksToPlaylist(dancePlaylistId, [trackUri]);
      if (snapshotId) {
        console.log('Track successfully added to the Dance playlist.');

        // Post a message announcing the song was added
        const message = `💃🕺 This track has been added to the Dance Songs playlist!`;
        await postMessage({ room, message });

        return true;
      }
    } else {
      console.log(`Track's Dance rating is ${audioFeatures.danceability}, which is below the threshold. Skipping...`);
    }
  } catch (error) {
    console.error('Error in addDanceSongsToPlaylist:', error);
  }
  return false;
}
*/

