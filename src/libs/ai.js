import { createClient } from 'redis'
import fetch from 'node-fetch'
import Bard from 'bard-ai'
import { gptGet } from './openAi.js'
import { postMessage } from './cometchat.js'
import removeMd from 'remove-markdown'

globalThis.fetch = fetch

const questionPrefix = `Assume you enjoy listening to all music, but espeically ${process.env.FAVOURITE_ARTIST} and provide a succinct but casual answer to this question.`
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
  const cachedResult = await cache.get(cacheKey)
  if (cachedResult) return JSON.parse(cachedResult).content
  if (room) {
    postMessage({
      room,
      message: 'thinking...'
    })
  }
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
