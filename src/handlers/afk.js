import { DeleteQueueSong } from "../utils/API.js"; // Adjust the path as needed

// afkHandler.js

const userTokens = {
    '072b0bb3-518e-4422-97fd-13dc53e8ae7e': process.env.IAN_USER_TOKEN,
    '92302b7d-ae5e-466f-975b-d3fee461f13f': process.env.CAM_USER_TOKEN,
    '210141ad-6b01-4665-84dc-e47ea7c27dcb': process.env.SMITTY_USER_TOKEN,
    // Add more UUIDs and tokens as needed
  };
  
  let afkStatus = {};
  
  // Function to check if a user is AFK authorized
  export function isUserAfkAuthorized(userId) {
    return Boolean(userTokens[userId]);
  }
  
  // Function to remove the current song from AFK users
  export async function removeCurrentSongFromAfkUsers(crateSongUuid) {
    for (const [userId, isAfk] of Object.entries(afkStatus)) {
      if (isAfk) {
        const userToken = userTokens[userId]; // Get the user's token for authorization
        if (userToken) {
          try {
            await DeleteQueueSong(crateSongUuid, userToken); // Call the delete function
            console.log(`Deleted song with UUID ${crateSongUuid} from ${userId}'s queue because they are AFK.`);
          } catch (error) {
            console.error(`Failed to delete song from ${userId}'s queue: ${error.message}`);
          }
        }
      }
    }
  }
  
  // Function to update AFK status
  export function updateAfkStatus(userId, isAfk) {
    afkStatus[userId] = isAfk;
    console.log(`User ${userId} AFK status updated to ${isAfk}`); 
  }

  export {userTokens}