import { promises as fs } from 'fs';
import path from 'path';

const walletsFilePath = path.join(process.cwd(), 'src/libs/wallets.json');
const usersFilePath = path.join(process.cwd(), 'src/libs/users.json');

// Load wallets from the JSON file
async function loadWallets() {
    try {
        const data = await fs.readFile(walletsFilePath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.error('Wallets file not found, initializing a new one.');
            await saveWallets({}); // Create a new file if it doesn't exist
            return {}; // Return an empty object
        } else {
            console.error('Error reading wallets file:', error);
            return {}; // Return an empty object on error
        }
    }
}

// Save wallets to the JSON file
async function saveWallets(wallets) {
    // Ensure wallets is a valid object
    if (typeof wallets !== 'object' || wallets === null) {
        console.error('Invalid wallets object:', wallets);
        return; // Exit if wallets is invalid
    }

    try {
        await fs.writeFile(walletsFilePath, JSON.stringify(wallets, null, 2)); // Pretty print JSON
        console.log('Wallets saved successfully:', wallets); // Log successful save
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
        await fs.writeFile(usersFilePath, JSON.stringify(users, null, 2)); // Pretty print JSON
        console.log('Users saved successfully:', users); // Log successful save
    } catch (error) {
        console.error('Error writing to users file:', error);
    }
}

// Retrieve nicknames and balances from wallets
async function getNicknamesFromWallets() {
    const wallets = await loadWallets(); // Fetch wallet data
    const users = await loadUsers();     // Fetch user data
    
    return Object.entries(wallets).map(([uuid, wallet]) => ({
        nickname: users[uuid] ? users[uuid].nickname : 'Unknown',
        balance: wallet.balance
    }));
}

// Function to add dollars to a user's wallet
async function addToUserWallet(user, amount) {
    // Ensure the amount is a valid number
    if (typeof amount !== 'number' || amount <= 0) {
        console.error('Invalid amount:', amount);
        return; // Exit early for invalid amounts
    }

    try {
        const wallets = await loadWallets(); // Load current wallets

        // Check if the user's wallet is present
        if (!wallets[user]) {
            console.error(`User wallet not found for user ${user}.`);
            return; // Exit if the wallet does not exist
        }

        // Update the wallet balance safely
        wallets[user].balance += amount;

        // Save the updated wallets
        await saveWallets(wallets);
        console.log(`Updated wallet for user ${user}: $${wallets[user].balance}`);
    } catch (error) {
        console.error('Error updating wallet:', error);
    }
}

async function removeFromUserWallet(user, amount) {
    // Load the wallets data
    const wallets = await loadWallets(); // Ensure wallets are loaded before accessing them

    // Check if the user's wallet exists
    if (!wallets[user]) {
        console.error(`Wallet for user ${user} does not exist.`);
        return false; // Exit if the wallet does not exist
    }

    // Ensure the wallet is properly structured
    if (typeof wallets[user] !== 'object' || !wallets[user].hasOwnProperty('balance')) {
        console.error(`Wallet for user ${user} is not properly initialized.`);
        return false; // Exit if wallet is invalid
    }

    // Check if the amount is valid
    if (isNaN(amount) || amount <= 0) {
        console.error(`Invalid amount: ${amount}. Cannot remove.`);
        return false; // Exit if the amount is not valid
    }

    // Check if the user has enough balance to remove the amount
    if (wallets[user].balance < amount) {
        console.error(`User ${user} does not have enough funds to remove $${amount}.`);
        return false; // Exit if insufficient funds
    }

    // Deduct the amount from the user's balance
    wallets[user].balance -= amount;

    // Save the updated wallets to persistent storage
    await saveWallets(wallets); 

    console.log(`Removed $${amount} from user ${user}'s wallet. New balance: $${wallets[user].balance}.`);
    return true; // Return true to indicate success
}


// Get user's wallet balance
async function getUserWallet(userUUID, nickname = 'Unknown') {
    const wallets = await loadWallets();
    const users = await loadUsers();

    // Initialize user if they do not exist
    if (!users[userUUID]) {
        users[userUUID] = { nickname };
        await saveUsers(users);
        console.log(`Added new user ${nickname} with UUID ${userUUID} to users.json.`);
    }

    // Initialize wallet if it doesn't exist
    if (!wallets[userUUID]) {
        wallets[userUUID] = { balance: 0 }; // Initialize with 0 balance
        await saveWallets(wallets);
    }

    // Return the user's wallet balance, ensuring the structure is consistent
    return wallets[userUUID].balance || 0; // Return 0 if the wallet doesn't exist
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

// Function to get balance by nickname
async function getBalanceByNickname(nickname) {
    const users = await loadUsers(); // Load users from the file

    // Find the user UUID by nickname
    const userUUID = Object.keys(users).find(uuid => users[uuid].nickname === nickname);

    if (!userUUID) {
        console.error(`User with nickname ${nickname} not found.`);
        return null; // Return null if the nickname doesn't exist
    }

    // Fetch the user's wallet balance
    const balance = await getUserWallet(userUUID);

    // Return the user's wallet balance
    return balance; // Return 0 if the wallet doesn't have a balance property
}

// Export functions
export { 
    addToUserWallet, 
    getUserWallet, 
    addDollarsByNickname, 
    getNicknamesFromWallets, 
    getBalanceByNickname, 
    saveWallets, 
    loadWallets , 
    removeFromUserWallet
};
