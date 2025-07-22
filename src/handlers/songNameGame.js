import { postMessage } from '../libs/Cometchat/messageSender.js'; // adjust path if needed
import { getCurrentDJUUIDs } from '../libs/bot.js';
import { getUserNickname } from './roulette.js';


export function parseDurationToMs(duration) {
  if (typeof duration === 'number') {
    // Assuming already in seconds
    return duration * 1000;
  }
  if (typeof duration === 'string') {
    // Expect format "MM:SS" or "H:MM:SS"
    const parts = duration.split(':').map(Number);
    if (parts.length === 2) {
      // MM:SS
      const [minutes, seconds] = parts;
      return (minutes * 60 + seconds) * 1000;
    } else if (parts.length === 3) {
      // H:MM:SS
      const [hours, minutes, seconds] = parts;
      return ((hours * 3600) + (minutes * 60) + seconds) * 1000;
    }
  }
  // If unknown format, fallback
  return 0;
}


// Helper to pick a random letter A-Z
function getRandomLetter() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  return letters[Math.floor(Math.random() * letters.length)]
}

// Announce a random letter to the room
export async function announceRandomLetter(room, state) {
  const letter = getRandomLetter()
  const djUUIDs = getCurrentDJUUIDs(state)

  let targetName = 'the next DJ'

  if (djUUIDs.length > 1) {
    const secondDJ = djUUIDs[1]
    const nickname = await getUserNickname(secondDJ)
    targetName = `@${nickname}`
  }

  await postMessage({
    room,
    message: `🎵 Letter Challenge!\n${targetName}, your song should start with the letter *${letter}*!`
  })
}

let letterChallengeTimer = null; // Store the timer ID so you can clear it if needed

function scheduleLetterChallenge() {
  if (letterChallengeTimer) {
    clearTimeout(letterChallengeTimer);
    letterChallengeTimer = null;
  }

  if (!this.currentSong || typeof this.currentSong.challengeStartMs !== 'number') {
    console.log('No valid challengeStartMs to schedule letter challenge.');
    return;
  }

  letterChallengeTimer = setTimeout(async () => {
    await announceRandomLetter(this.roomUUID, this.state)  // <-- pass state
    letterChallengeTimer = null
  }, this.currentSong.challengeStartMs);
}



export { scheduleLetterChallenge }
