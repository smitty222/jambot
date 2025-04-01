import { GoogleGenerativeAI } from '@google/generative-ai'

const askQuestion = async (question) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY // Use environment variable for the Gemini API key
    const genAI = new GoogleGenerativeAI(apiKey)

    // Initialize the generative model (e.g., 'gemini-1.5-flash')
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    // Log the received question
    console.log(`Received question: "${question}"`)

    // Check if the question refers to "this song" and replace if necessary (your custom logic)
    if (question.toLowerCase().includes('this song')) {
      question = replaceThisSong(question) // Your custom replace function
    }

    // Log the final question being sent to Gemini AI
    console.log(`Final question sent to Gemini: "${question}"`)

    // Get the generative content response
    const result = await model.generateContent(question)

    // Log the response from Gemini AI
    console.log(`AI Response: ${JSON.stringify(result)}`)

    // Return the response text
    return result.response.text() || 'Sorry, I could not generate a response at the moment.'
  } catch (error) {
    console.error('Error:', error)
    return 'Sorry, something went wrong trying to get a response from Gemini.'
  }
}

// Custom function to replace "this song" with current song details
const replaceThisSong = (question) => {
  if (currentSong && currentSong.artistName && currentSong.trackName) {
    const songDetails = `Artist: ${currentSong.artistName}, Track: ${currentSong.trackName}`
    const modifiedQuestion = question.replace('this song', songDetails)

    console.log(`Replaced "this song" with details: "${songDetails}"`)
    console.log(`Modified question: "${modifiedQuestion}"`)

    return modifiedQuestion
  } else {
    console.warn('No current song details available at the time of replacement.')
    return question
  }
}

// Function to update the current song state (if needed for your logic)
const currentSong = {}

// Example of how you might use this in your chat application
const chatWithBot = async (userMessage) => {
  const botResponse = await askQuestion(userMessage)
  console.log(`Bot response: ${botResponse}`)
  // Here you can handle sending the botResponse back to the chat system
}

export { askQuestion, chatWithBot }
