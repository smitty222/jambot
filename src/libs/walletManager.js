import { promises as fs } from 'fs'
import path from 'path'
import { fetchRecentSongs } from '../utils/API.js'
import { getUserNickname } from '../handlers/roulette.js'

const walletsFilePath = path.join(process.cwd(), 'src/libs/wallets.json')
const usersFilePath = path.join(process.cwd(), 'src/libs/users.json')

// Helper function to round to nearest tenth
function roundToTenth (amount) {
  return Math.round(amount * 10) / 10 // Rounds to one decimal place
}

// Load wallets from the JSON file
async function loadWallets () {
  try {
    const data = await fs.readFile(walletsFilePath, 'utf-8')
    return JSON.parse(data)
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error('Wallets file not found, initializing a new one.')
      await saveWallets({}) // Create a new file if it doesn't exist
      return {} // Return an empty object
    } else {
      console.error('Error reading wallets file:', error)
      return {} // Return an empty object on error
    }
  }
}

async function addOrUpdateUser (userUUID) {
  try {
    // Fetch the user's nickname using the getUserNickname function
    const nickname = await getUserNickname(userUUID)

    // Step 1: Load the current users
    const users = await loadUsers()

    // Step 2: Check if the user already exists
    if (!users[userUUID]) {
      if (nickname) {
        // Step 3: Add the user if they don't exist and if we have a valid nickname
        users[userUUID] = { nickname }

        // Step 4: Save the updated users list to the users.json file
        await saveUsers(users)
        console.log(`User ${nickname} added successfully with UUID: ${userUUID}`)
      } else {
        console.log(`Nickname not found for user ${userUUID}, not added.`)
      }
    } else {
      console.log(`User with UUID: ${userUUID} already exists.`)
    }
  } catch (error) {
    console.error('Error adding or updating user:', error)
  }
}

// Save wallets to the JSON file
async function saveWallets (wallets) {
  // Ensure wallets is a valid object
  if (typeof wallets !== 'object' || wallets === null) {
    console.error('Invalid wallets object:', wallets)
    return // Exit if wallets is invalid
  }

  try {
    await fs.writeFile(walletsFilePath, JSON.stringify(wallets, null, 2)) // Pretty print JSON
    console.log('Wallets saved successfully:') // Log successful save
  } catch (error) {
    console.error('Error writing to wallets file:', error)
  }
}

// Load users from the JSON file
export async function loadUsers () {
  try {
    const data = await fs.readFile(usersFilePath, 'utf8')
    return JSON.parse(data)
  } catch (error) {
    console.error('Error reading users file:', error)
    return {} // Return an empty object if there's an error
  }
}

// Save users to the JSON file
async function saveUsers (users) {
  try {
    await fs.writeFile(usersFilePath, JSON.stringify(users, null, 2)) // Pretty print JSON
    console.log('Users saved successfully:', users) // Log successful save
  } catch (error) {
    console.error('Error writing to users file:', error)
  }
}

// Retrieve nicknames and balances from wallets
async function getNicknamesFromWallets () {
  const wallets = await loadWallets() // Fetch wallet data
  const users = await loadUsers() // Fetch user data

  return Object.entries(wallets).map(([uuid, wallet]) => ({
    nickname: users[uuid] ? users[uuid].nickname : 'Unknown',
    balance: wallet.balance
  }))
}

// Function to add dollars to a user's wallet
async function addToUserWallet (userUUID, amount, nickname) {
  try {
    // Add or update the user in the users.json file before adding to their wallet
    await addOrUpdateUser(userUUID, nickname)

    // Step 1: Load existing wallets
    const wallets = await loadWallets()

    // Step 2: Ensure the user's wallet exists, if not, initialize it
    if (!wallets[userUUID]) {
      wallets[userUUID] = { balance: 0 } // Create a wallet if it doesn't exist
    }

    // Step 3: Add the amount and round the result
    wallets[userUUID].balance = roundToTenth(wallets[userUUID].balance + amount)

    // Step 4: Save the updated wallets back to the file
    await saveWallets(wallets)
    return true // Return true to indicate success
  } catch (error) {
    console.error('Error adding to wallet:', error)
    return false // Return false to indicate an error
  }
}

async function removeFromUserWallet (userUUID, amount) {
  try {
    const wallets = await loadWallets() // Load wallets using a helper function

    // Ensure the user's wallet exists; if not, initialize it
    if (!wallets[userUUID]) {
      wallets[userUUID] = { balance: 0 } // Create a wallet if it doesn't exist
    }

    // Check if the new balance would be negative
    const newBalance = roundToTenth(wallets[userUUID].balance - amount)
    wallets[userUUID].balance = newBalance < 0 ? 0 : newBalance // Set to zero if negative

    await saveWallets(wallets) // Save updated wallets back to the file
    return true // Return true to indicate success
  } catch (error) {
    console.error('Error removing from wallet:', error)
    return false // Return false to indicate an error
  }
}

// Get user's wallet balance
async function getUserWallet (userUUID) {
  try {
    const data = await fs.readFile(walletsFilePath, 'utf8')
    const wallets = JSON.parse(data)

    // If wallet doesn't exist, create one with an initial balance
    if (!wallets[userUUID]) {
      console.log(`Wallet not found for user ${userUUID}. Creating wallet with initial balance.`)
      wallets[userUUID] = { balance: 50 } // Starting balance
      await fs.writeFile(walletsFilePath, JSON.stringify(wallets, null, 2)) // Save the updated wallets data
    }

    return roundToTenth(wallets[userUUID].balance) // Round balance when retrieving
  } catch (error) {
    console.error('Error reading wallet file:', error)
    return 0 // Return 0 if an error occurs
  }
}

// Function to add dollars to a user by their nickname
async function addDollarsByNickname (nickname, amount) {
  const users = await loadUsers() // Load users from the file

  // Ensure the amount is a valid number
  if (typeof amount !== 'number' || amount <= 0) {
    console.error('Invalid amount:', amount)
    return
  }

  // Find the user UUID by nickname
  const userUUID = Object.keys(users).find(uuid => users[uuid].nickname === nickname)

  if (userUUID) {
    await addToUserWallet(userUUID, amount) // Add dollars to the user's wallet
    console.log(`Added $${amount} to ${nickname}'s wallet.`)
  } else {
    console.error(`User with nickname ${nickname} not found.`)
  }
}

// Function to get balance by nickname
async function getBalanceByNickname (nickname) {
  const users = await loadUsers() // Load users from the file

  // Find the user UUID by nickname
  const userUUID = Object.keys(users).find(uuid => users[uuid].nickname === nickname)

  if (!userUUID) {
    console.error(`User with nickname ${nickname} not found.`)
    return null // Return null if the nickname doesn't exist
  }

  // Fetch the user's wallet balance
  const balance = await getUserWallet(userUUID)

  // Return the user's wallet balance
  return balance // Return 0 if the wallet doesn't have a balance property
}

async function songPayment () {
  try {
    const songPlays = await fetchRecentSongs() // Fetch recent song plays

    // Check if songPlays is valid and an array
    if (!songPlays || !Array.isArray(songPlays)) {
      console.error('Invalid response format:')
      return // Exit if the response is not valid
    }

    // Check if there are any song plays
    if (songPlays.length === 0) {
      console.log('No recent songs found.')
      return // Exit if there are no recent songs
    }

    // Get the most recent songPlay (the first item in the array)
    const mostRecentSongPlay = songPlays[0]

    // Extract relevant information from the most recent songPlay
    const { song, playedAt } = mostRecentSongPlay // Destructure song and playedAt
    const userUUID = mostRecentSongPlay.djUuid // Get DJ UUID from the songPlay
    const voteCount = mostRecentSongPlay.voteCounts.likes // Get like votes count

    if (userUUID && typeof voteCount === 'number' && voteCount > 0) {
      const success = await addToUserWallet(userUUID, voteCount * 2) // Add $2 for each like
      if (success) {
        console.log(`Added $${voteCount * 1} to user ${userUUID}'s wallet for ${voteCount} likes.`)
      } else {
        console.error(`Failed to add to wallet for user ${userUUID}`)
      }
    } else {
      console.error('Invalid userUUID or voteCount for songPlay')
    }
  } catch (error) {
    console.error('Error in songPayment:', error)
  }
}

// Export functions
export {
  addToUserWallet,
  getUserWallet,
  addDollarsByNickname,
  getNicknamesFromWallets,
  getBalanceByNickname,
  saveWallets,
  loadWallets,
  removeFromUserWallet,
  songPayment

}
