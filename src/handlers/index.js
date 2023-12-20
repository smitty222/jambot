import message from './message.js'
import playedSong from './playedSong.js'
import { handleUserJoined } from './userJoined.js'
import { handleUserLeft } from './userLeft.js'

export const handlers = {
  message,
  playedSong,
  handleUserJoined,
  handleUserLeft,

}
