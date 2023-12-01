import message from './message.js'
import playedSong from './playedSong.js'
import userJoined from './userJoined.js'
import addDJCommand from './commands/addDJ';

export const handlers = {
  message,
  playedSong,
  userJoined,
  addDJ: addDJCommand
}
