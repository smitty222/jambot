import { postMessage } from '../libs/cometchat.js';
import { getTrackFact } from '../libs/ai.js';

let merchCount = 0;
let songDetailCount = 0;

export default async (payload, room) => {
  console.log('songDetailCount:', songDetailCount);
  console.log('ANNOUNCE_SONG_DETAILS_COUNT:', process.env.ANNOUNCE_SONG_DETAILS_COUNT);

  if (++songDetailCount > process.env.ANNOUNCE_SONG_DETAILS_COUNT) {
    songDetailCount = 0;

    if (payload?.nowPlaying?.song?.artistName?.toLowerCase().includes(process.env.FAVOURITE_ARTIST.toLowerCase())) {
      const reply = await getTrackFact(`${payload.nowPlaying.song.trackName} by ${payload.nowPlaying.song.artistName}`);
      let messageSuffix = '';

      console.log('merchCount:', merchCount);
      console.log('MERCH_MESSAGE_RANDOM_SONG_COUNT:', process.env.MERCH_MESSAGE_RANDOM_SONG_COUNT);
      console.log('Random Message Condition Met:', Math.floor(Math.random() * 2) === 1);

      if (++merchCount > process.env.MERCH_MESSAGE_RANDOM_SONG_COUNT) {
        merchCount = 0;

        if (Math.floor(Math.random() * 2) === 1) {
          messageSuffix = process.env.MERCH_MESSAGE_RANDOM;
        }
      }

      if (reply?.length > 0) {
        await postMessage({
          room,
          message: `Great song. Let me tell you a little about it! ${messageSuffix}`
        });

        const responses = reply.split('\n');
        for (const item of responses) {
          const response = item.trim();
          if (response.length > 0) {
            await postMessage({
              room,
              message: response
            });
          }
        }
      }
    }
  }
};
