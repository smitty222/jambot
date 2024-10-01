import { promises as fs } from 'fs';
import path from 'path';


const walletsFilePath = path.join(process.cwd(), 'src/libs/wallets.json');
const usersFilePath = path.join(process.cwd(), 'src/libs/users.json');

// Load wallets from the JSON file
async function loadWallets() {
    try {
        const data = await fs.readFile(walletsFilePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading wallets file:', error);
        return {}; // Return an empty object if there's an error
    }
}

// Save wallets to the JSON file
async function saveWallets(wallets) {
    try {
        await fs.writeFile(walletsFilePath, JSON.stringify(wallets, null, 2));
    } catch (error) {
        console.error('Error writing to wallets file:', error);
    }
}

// Load users from the JSON file
async function loadUsers() {
    try {
        const data = await fs.readFile(usersFilePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading users file:', error);
        return {}; // Return an empty object if there's an error
    }
}

// Save users to the JSON file
async function saveUsers(users) {
    try {
        await fs.writeFile(usersFilePath, JSON.stringify(users, null, 2));
    } catch (error) {
        console.error('Error writing to users file:', error);
    }
}
async function getNicknamesFromWallets() {
    const wallets = await loadWallets(); // Load the wallets
    const users = await loadUsers(); // Load the user data

    // Create a map for nicknames based on user UUIDs
    const nicknameMap = {};
    for (const uuid in users) {
        nicknameMap[uuid] = users[uuid].nickname; // Map user UUID to nickname
    }

    // Create a message with wallet balances and nicknames
    const message = Object.keys(wallets).map(uuid => {
        const nickname = nicknameMap[uuid] || 'Unknown'; // Use 'Unknown' if nickname is not found
        const balance = wallets[uuid].balance || 0; // Get balance
        return `@${nickname}: $${balance}`; // Format the message
    }).join('\n');

    return message; // Return the constructed message
}

// Initialize wallet for a user
async function initializeWallet(user) {
    const wallets = await loadWallets(); // Load current wallets

    // Initialize the user's wallet if it doesn't exist
    if (!wallets[user]) {
        wallets[user] = 50; // Default wallet size
        await saveWallets(wallets); // Save changes
    }

    return wallets[user]; // Return current balance
}

// Function to add dollars to a user's wallet
async function addToUserWallet(user, amount) {
    // Ensure the amount is a valid number
    if (typeof amount !== 'number' || amount <= 0) {
        console.error('Invalid amount:', amount);
        return;
    }

    const wallets = await loadWallets(); // Load current wallets
    const currentBalance = await initializeWallet(user); // Ensure wallet is initialized

    // Update the wallet balance
    wallets[user] = currentBalance + amount;

    // Save the updated wallets
    await saveWallets(wallets);

    // Log the update for debugging
    console.log(`Updated wallet for user ${user}: $${wallets[user]}`);
}

// Get user's wallet balance
async function getUserWallet(userUUID) {
    const wallets = await loadWallets();
    return wallets[userUUID] || 0; // Return 0 if user doesn't exist
}

// Function to add dollars to a user by their nickname
async function addDollarsByNickname(nickname, amount) {
    const users = await loadUsers(); // Load users from the file

    // Ensure the amount is a valid number
    if (typeof amount !== 'number' || amount <= 0) {
        console.error('Invalid amount:', amount);
        return;
    }

    // Find the user UUID by nickname
    const userUUID = Object.keys(users).find(uuid => users[uuid].nickname === nickname);

    if (userUUID) {
        await addToUserWallet(userUUID, amount); // Add dollars to the user's wallet
        console.log(`Added $${amount} to ${nickname}'s wallet.`);
    } else {
        console.error(`User with nickname ${nickname} not found.`);
    }
}

async function getBalanceByNickname(nickname) {
    const users = await loadUsers(); // Load users from the file

    // Find the user UUID by nickname
    const userUUID = Object.keys(users).find(uuid => users[uuid].nickname === nickname);

    if (!userUUID) {
        return null; // Return null if the nickname doesn't exist
    }

    // Fetch the user's wallet balance
    const wallet = await getUserWallet(userUUID);

    // Return the user's wallet balance, ensuring you access the balance property
    return wallet.balance || 0; // Return 0 if the wallet doesn't have a balance property
}

// Export functions
export { addToUserWallet, getUserWallet, addDollarsByNickname, getNicknamesFromWallets, getBalanceByNickname, saveWallets, loadWallets };
