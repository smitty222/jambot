import { GoogleGenerativeAI } from '@google/generative-ai'
import fetch from 'node-fetch'
import fs from 'fs'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
let currentSong = null

const askQuestion = async (question) => {
  try {
    console.log(`Received question: "${question}"`)

    // Replace "this song" with actual song info if available
    if (question.toLowerCase().includes('this song')) {
      question = replaceThisSong(question)
    }

    // Detect image-related prompt
    const isImagePrompt = /(draw|generate.*image|make.*picture|create.*image|illustrate|show.*image|show.*picture|design|render|make art|generate.*visual)/i.test(question)

    if (isImagePrompt) {
      console.log('Image request detected. Generating image...')
      const result = await generateImage(question)

      if (result.imageBase64) {
        const filePath = `./generated_${Date.now()}.png`
        fs.writeFileSync(filePath, Buffer.from(result.imageBase64, 'base64'))
        console.log(`Saved image to ${filePath}`)
        return { text: result.text, imagePath: filePath }
      } else {
        return { text: result.text }
      }
    }

    // Text-only fallback
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    console.log(`Sending prompt to Gemini: "${question}"`)
    const result = await model.generateContent(question)

    return {
      text: result.response.text() || 'Sorry, I could not generate a response.'
    }
  } catch (error) {
    console.error('AI Error:', error)
    return {
      text: 'Sorry, something went wrong trying to get a response from Gemini.'
    }
  }
}

// 🔁 Generates an image from the Gemini REST API
async function generateImage(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${GEMINI_API_KEY}`

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE']
    }
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    const data = await res.json()

    const parts = data.candidates?.[0]?.content?.parts || []
    let outputText = ''
    let base64Image = null

    for (const part of parts) {
      if (part.text) outputText += part.text
      if (part.inlineData?.mimeType?.startsWith('image/')) {
        base64Image = part.inlineData.data
      }
    }

    return {
      text: outputText || 'Here’s your image!',
      imageBase64: base64Image
    }
  } catch (error) {
    console.error('Image generation error:', error)
    return {
      text: 'Sorry, I couldn’t create an image this time.',
      imageBase64: null
    }
  }
}

// 🧠 Song-aware phrase replacement
const replaceThisSong = (question) => {
  if (currentSong?.artistName && currentSong?.trackName) {
    const songDetails = `Artist: ${currentSong.artistName}, Track: ${currentSong.trackName}`
    const modifiedQuestion = question.replace(/this song/gi, songDetails)

    console.log(`Replaced "this song" with details: "${songDetails}"`)
    return modifiedQuestion
  } else {
    console.warn('No current song details available.')
    return question
  }
}

// 📝 Set current song
const setCurrentSong = (song) => {
  currentSong = song
}

// 💬 Interface for chat system
const chatWithBot = async (userMessage) => {
  const response = await askQuestion(userMessage)
  console.log(`Bot response: ${JSON.stringify(response)}`)
  return response
}

export { askQuestion, chatWithBot, setCurrentSong }
