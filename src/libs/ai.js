import { BardAPI } from 'bard-api-node'
const bard = new BardAPI()

const askQuestion = async (question) => {
  try {
    const apiKey = 'AIzaSyC8efPUmAFGi1iZls_iCR9zlcP5jyPiJ6M'
    await bard.initializeChat(apiKey)
    const response = await bard.getBardResponse(question)
    return response
  } catch (error) {
    console.error('Error:', error)
    return 'Sorry, something went wrong trying to get a response for you'
  }
}
export { askQuestion }
