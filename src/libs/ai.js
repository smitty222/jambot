import { BardAPI } from 'bard-api-node'
const bard = new BardAPI()

// State variable to store the current song details
let currentSong = {}

// Function to update the current song state
const updateCurrentSong = (songDetails) => {
  currentSong = songDetails
  console.log(`Updated current song: ${JSON.stringify(currentSong)}`)
}

// Function to replace "this song" in the question with the current song's details
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

// Function to ask a question to the Bard API
const askQuestion = async (question) => {
  try {
    const apiKey = process.env.BARD_API_KEY // Use environment variable for the API key
    await bard.initializeChat(apiKey)

    // Log the received question
    console.log(`Original question: "${question}"`)

    // Check if the question references "this song"
    if (question.toLowerCase().includes('this song')) {
      question = replaceThisSong(question)
    }

    // Log the final question sent to Bard
    console.log(`Final question sent to AI: "${question}"`)

    // Get a response from Bard
    const response = await bard.getBardResponse(question)
    console.log(`AI Response: ${JSON.stringify(response)}`)

    return response?.text || 'Sorry, I could not generate a response at the moment.'
  } catch (error) {
    console.error('Error:', error)
    return 'Sorry, something went wrong trying to get a response for you'
  }
}

// Export the functions
export { askQuestion, updateCurrentSong }
