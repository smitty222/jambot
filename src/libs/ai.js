import { BardAPI } from 'bard-api-node'
const bard = new BardAPI()

const askQuestion = async (question) => {
  try {
    const apiKey = process.env.BARD_API_KEY // Use environment variable for the API key
    await bard.initializeChat(apiKey)
    const response = await bard.getBardResponse(question)
    return response
  } catch (error) {
    console.error('Error:', error)
    return 'Sorry, something went wrong trying to get a response for you'
  }
}

export { askQuestion }
