import { createClient } from 'redis'
import fetch from 'node-fetch'
import Bard from 'bard-ai'
import { gptGet } from './openAi.js'
import { postMessage } from './cometchat.js'
import removeMd from 'remove-markdown'

globalThis.fetch = fetch

const questionPrefix = `You are a moderator in a online DJ room named Just Jams. In this room you can play whatever music you like, but don't be mad if somebody doesn't like what you play. You chat with users in the room,listen to the music being played, and keep up the good vibes. You live in the internet. Provide a very short conversational reply`
const trackPrefix = 'Succinctly tell me about the song'

const cache = createClient({ url: `redis://${process.env.REDIS_HOST}:6379` })
cache.on('error', err => console.log('Redis Client Error', err))
await cache.connect()
let bard
try {
  bard = new Bard(process.env.BARD_COOKIE)
} catch (error) {
  console.log(error)
}

const getResponse = async (cacheKey, prefix, query, room) => {
  let result
  if (bard) {
    try {
      result = await bard.ask(`${prefix} ${query}`, { format: 'json' })
      if (result.content) {
        result.content = removeMd(result.content)
        await cache.set(cacheKey, JSON.stringify(result))
        return result.content
      }
    } catch (error) {
      console.log(error)
      if (!room) return
      return 'Sorry, something went wrong trying to get a response for you'
    }
  } else {
    // Open AI to the rescue
    return await gptGet(prefix, query)
  }
}

export const askQuestion = async (question, room) => {
  const cacheKey = `TTL:BARD:QUERY:${question.toUpperCase().trim()}`
  return await getResponse(cacheKey, questionPrefix, question, room)
}

export const getTrackFact = async (track) => {
  const cacheKey = `TTL:BARD:TRACK:${track.toUpperCase().trim()}`
  return await getResponse(cacheKey, trackPrefix, track)
}
