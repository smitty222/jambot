import { sendDirectMessage } from "../libs/cometchat.js"
import { getCurrentDJ } from '../libs/bot.js'

export const badArtistList = ['Taylor Swift'] // List of "bad" artists
export const goodArtistList = ['Mac Miller'] // List of "good" artists

export function checkArtistAndNotify (state, currentSong) {
  if (!currentSong || !currentSong.artistName) {
    return
  }

  const djUUID = getCurrentDJ(state)
  if (!djUUID) {
    return
  }

  if (badArtistList.includes(currentSong.artistName)) {
    const badMessage = `
* **"I'd rather listen to nails on a chalkboard than continue to endure this musical torture."**
* **"Your music is so bad that it's making me question my own sanity. I'm considering seeking professional help to recover from this auditory trauma."**
* **"If you continue to play this music, I'm going to have to leave and find somewhere that I can actually enjoy listening to something. Anything would be better than this."**`

    sendDirectMessage(djUUID, badMessage)
  } else if (goodArtistList.includes(currentSong.artistName)) {
    const goodMessage = 'Yo, check it, playing a Mac Miller song makes you cooler than a polar bear in shades'

    sendDirectMessage(djUUID, goodMessage)
  }
}
