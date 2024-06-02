import { BardAPI } from 'bard-api-node'
import { songInfoForAI } from '../utils/API.js';
const bard = new BardAPI()

const askQuestion = async (question) => {
  // Check if the question is about the currently playing song
  if (question.includes('!currentsong')) {
    try {
      // Fetch the song info for AI
      const { songName, artistName } = await songInfoForAI();
      console.log('Fetched song data:', songName, artistName); // Debugging log

      // Return song details
      return `Currently playing: ${songName} by ${artistName}`;
    } catch (error) {
      console.error('Error fetching song info for AI:', error.message);
      return 'Sorry, I could not fetch the currently playing song at the moment.';
    }
  }

  // Default case: use BardAPI to answer the question
  try {
    const apiKey = process.env.BARD_API_KEY; // Use environment variable for the API key
    await bard.initializeChat(apiKey);
    const response = await bard.getBardResponse(question);
    return response;
  } catch (error) {
    console.error('Error:', error);
    return 'Sorry, something went wrong trying to get a response for you';
  }
};


export { askQuestion }
