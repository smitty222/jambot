import { BardAPI } from 'bard-api-node'

// Initialize BardAPI object
const bard = new BardAPI()

const askQuestion = async (question) => {
  try {
    // Set your API key here
    const apiKey = 'AIzaSyC8efPUmAFGi1iZls_iCR9zlcP5jyPiJ6M'
    // Initialize chat with API key
    await bard.initializeChat(apiKey)
    // Send a query to Bard
    const response = await bard.getBardResponse(question)
    return response
  } catch (error) {
    console.error('Error:', error)
    return 'Sorry, something went wrong trying to get a response for you'
  }
}

export { askQuestion }
