import { postMessage } from '../libs/cometchat.js';
import { fetchUserData, updateRoomInfo } from '../utils/API.js';
import { addToUserWallet, getUserWallet, loadWallets, saveWallets, removeFromUserWallet } from '../libs/walletManager.js';


// Global variabless
let rouletteGameActive = false;
let bets = {};
const defaultWalletSize = 50;
const room = process.env.ROOM_UUID

// American Roulette winning numbers and colors
const winningNumbers = {
    0: 'green',
    1: 'red',
    2: 'black',
    3: 'red',
    4: 'black',
    5: 'red',
    6: 'black',
    7: 'red',
    8: 'black',
    9: 'red',
    10: 'black',
    11: 'red',
    12: 'black',
    13: 'red',
    14: 'black',
    15: 'red',
    16: 'black',
    17: 'red',
    18: 'black',
    19: 'red',
    20: 'black',
    21: 'red',
    22: 'black',
    23: 'red',
    24: 'black',
    25: 'red',
    26: 'black',
    27: 'red',
    28: 'black',
    29: 'red',
    30: 'black',
    31: 'red',
    32: 'black',
    33: 'red',
    34: 'black',
    35: 'red',
    36: 'black',
    37: 'green' // For 00
};
function getRouletteColor(number) {
    if (number === 0 || number === '00') {
        return 'green'; // Both 0 and 00 are green
    }
    const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
    const blackNumbers = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];
    if (redNumbers.includes(number)) {
        return 'red';
    } else if (blackNumbers.includes(number)) {
        return 'black';
    } else {
        return 'unknown'; // Handle invalid numbers (should not occur in roulette)
    }
}
async function logUserBets() {
    let logMessages = [];
    for (const [userId, userBets] of Object.entries(bets)) {
        const nickname = await getUserNickname(userId); 

        // Ensure userBets is an array
        if (Array.isArray(userBets)) {
            let betDetails = userBets.map(bet => {
                let betInfo = `$${bet.amount} on ${bet.type}`;
                if (bet.type === 'dozen') {
                    betInfo += ` ${bet.dozen}`;
                } else if (bet.type === 'number') {
                    betInfo += ` ${bet.number}`;
                }
                return betInfo;
            }).join(', ');

            logMessages.push(`@${nickname} placed: ${betDetails}`);
        } else {
            console.log(`Warning: userBets for user ${nickname} is not an array:`, userBets);
        }
    }
    console.log('Current User Bets:');
    console.log(logMessages.join('\n'));
}

export async function getUserNickname(userId) {
    const userArray = [userId]; 
    const users = await fetchUserData(userArray); // Fetch user data

    // Check if we have any user profiles returned and return the nickname
    if (users && users.length > 0 && users[0].userProfile) {
        return users[0].userProfile.nickname || 'Unknown'; // Access userProfile for the nickname
    } else {
        return 'Unknown'; // Return 'Unknown' if no user data is found
    }
}

async function initializeWallet(user) {
    try {
        const wallets = await loadWallets(); // Load wallets

        // Log the current state of wallets
        console.log('Loaded wallets:', wallets);

        if (!wallets[user]) {
            wallets[user] = { balance: defaultWalletSize };
            await saveWallets(wallets); 
            console.log(`Created new wallet for user ${user} with balance: ${defaultWalletSize}`);
            return defaultWalletSize; 
        }
        console.log(`Wallet exists for user ${user} with balance: ${wallets[user].balance}`);
        return wallets[user].balance; 
    } catch (error) {
        console.error('Error initializing wallet:', error);

        throw error; 
    }
}

async function startRouletteGame(payload) {
    if (rouletteGameActive) {
        await postMessage({
            room: room,
            message: 'A roulette game is already active! Please wait for it to finish before starting a new one.'
        });
        return; // Prevent starting a new game if one is already active
    }
    let updatePayload = null;
    updatePayload = {
            "pinnedMessages": [
                {
                  "message": {
                    "id": "1266d88a-82d7-4c0a-802d-422c7887ba77",
                    "date": "2024-09-30T23:08:48.000Z",
                    "color": "#6AC5FE",
                    "badges": [
                      "VERIFIED",
                      "STAFF"
                    ],
                    "message": "Roulette Bet Types:\nExample Bet ($5 on Red): /red 5\n /red <wager>   /black <wager>\n /odd <wager>   /even <wager>\n /high <wager>   /low <wager>\n /<number> <wager>\n /dozen<1,2,or 3> <wager>",
                    "avatarId": "bot-01",
                    "mentions": [],
                    "userName": "Allen",
                    "userUuid": "Allen",
                    "reactions": {},
                    "retryButton": false,
                    "reportIdentifier": "8829755"
                  },
                  "pinnedByName": "Rsmitty",
                  "pinnedByUUID": "210141ad-6b01-4665-84dc-e47ea7c27dcb"
                }
              ]
    };
    await updateRoomInfo(updatePayload);

    const GifUrl = 'https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExNTlvaXpxeWw2ejlyeWl0M3g2YTl4NmZ4b2MxMzN3NW91NWd5MmhudyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/qH1jQOvi4WVEvCRvOg/giphy.gif'
      await postMessage({
        room,
        message: '',
        images: [GifUrl]
      })

    rouletteGameActive = true;
    console.log('Roulette Game Active');

    await postMessage({
        room: process.env.ROOM_UUID,
        message: '🎉 Welcome to the Roulette Table! 🎉'
    });

    const ImageUrl = 'https://imgur.com/IyFZlzj.jpg'; // Replace with your actual image URL
    await postMessage({
        room,
        message: '', // You can add a message if needed
        images: [ImageUrl] // Pass the image URL here
    });

    await postMessage({
        room: process.env.ROOM_UUID,
        message: 'Please Place Your Bets! See the pinned message for help'
    });

    await postMessage({
        room: process.env.ROOM_UUID,
        message: 'Betting will close in 90 seconds'
    });

    await new Promise(resolve => setTimeout(resolve, 75000)); // Wait for 28 seconds

    await postMessage({
        room: process.env.ROOM_UUID,
        message: 'Betting closes in 15 seconds'
    });

    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for 2 seconds

    const spinGif = 'https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExczVmZHRpbnY5a3F2dHp1bGtjNmljbGt4c2RzMTFoNWcyYngzbHplMSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/qNCtzhsWCc7q4D2FB5/giphy-downsized-large.gif'
    await postMessage({
        room: room,
        message: '',
        images: [spinGif]
    })

    // Set a timeout to end the roulette game after 40 seconds
    setTimeout(async () => {
        await closeBets();
    }, 13000); // Adjust the time as needed
}
async function closeBets() {
    if (!rouletteGameActive) return; // Prevent closing if already inactive

    await postMessage({
        room: process.env.ROOM_UUID,
        message: `Betting is now closed`
    });

    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for 2 seconds

    // Prepare to announce user bets
    let betsMessage = "Bets placed\n";
for (const [user, userBets] of Object.entries(bets)) {
    const nickname = await getUserNickname(user);
    betsMessage += `@${nickname}:\n`; // Start a new line after each user's nickname

    const betsList = userBets.map(bet => {
        if (bet.type === 'number') {
            return `  - Number ${bet.number} ($${bet.amount})`; // Indent each bet and start on a new line
        }
        return `  - ${bet.type.charAt(0).toUpperCase() + bet.type.slice(1)} ($${bet.amount})`; // Indent and capitalize bet type
    }).join('\n'); // Separate each bet with a newline

    betsMessage += betsList + '\n'; // Add an extra newline for spacing between users
}
    await postMessage({
        room: room,
        message: betsMessage
    })
    
      await new Promise(resolve => setTimeout(resolve, 8000)); // Wait for 8 seconds

    await drawWinningNumber(); // Draw the winning number here
}

async function handleRouletteBet(payload) {
    const user = payload.sender;
    const nickname = await getUserNickname(user);
    const message = payload.message.trim(); // Trim any extra spaces
    const commandParts = message.split(' ');

    // Validate that the message starts with '/' and has at least two parts (e.g., "/red 15")
    if (!message.startsWith('/') || commandParts.length < 2) {
        console.log(`Ignoring non-bet message: ${message}`);
        return; // Exit if the message is not a valid bet command
    }

    const betTypeOrNumber = commandParts[0].substring(1); // Remove the '/'
    const amountString = commandParts[commandParts.length - 1]; // Get the last part
    const amount = parseFloat(amountString); // Parse it as a float

    console.log(`Received command: ${payload.message}`); // Debugging log
    console.log(`Command parts: ${commandParts}`); // Debugging log

    // Validate the bet amount
    if (isNaN(amount) || amount <= 0) {
        await postMessage({
            room: process.env.ROOM_UUID,
            message: `@${nickname}, please enter a valid positive amount to bet.`
        });
        return; // Exit if the amount is not valid
    }

    // Ensure the bet type is recognized (add valid bet types here)
    const validBetTypes = ['red', 'black', 'green', 'odd', 'even', 'number', 'dozen', 'high', 'low'];
    if (!validBetTypes.includes(betTypeOrNumber) && isNaN(parseInt(betTypeOrNumber, 10))) {
        console.log(`Invalid bet type: ${betTypeOrNumber}`);
        return; // Exit if the bet type is not valid
    }

    const wallets = await loadWallets(); // Ensure wallets are loaded before accessing them

    if (!wallets[user]) {
        wallets[user] = { balance: defaultWalletSize }; // Initialize with default balance
        await saveWallets(wallets); // Save the updated wallets
        await postMessage({
            room: process.env.ROOM_UUID,
            message: `@${nickname}, a wallet has been created for you with a starting balance of $${defaultWalletSize}.`
        });
    }

    if (wallets[user].balance < amount) {
        await postMessage({
            room: process.env.ROOM_UUID,
            message: `@${nickname}, you do not have enough funds to place this bet.`
        });
        return; // Exit if insufficient funds
    }

    // Deduct the bet amount from the user's balance and save the wallet
    wallets[user].balance -= amount;
    await saveWallets(wallets);
    console.log(`@${nickname} placed a bet of $${amount} on ${betTypeOrNumber}. New balance: $${wallets[user].balance}`);

    if (!bets[user]) {
        bets[user] = [];
    }

    bets[user].push({
        type: isNaN(betTypeOrNumber) ? betTypeOrNumber : 'number',
        number: !isNaN(betTypeOrNumber) ? parseInt(betTypeOrNumber, 10) : null,
        amount
    });

    await postMessage({
        room: process.env.ROOM_UUID,
        message: `@${nickname} has placed a bet of $${amount} on ${betTypeOrNumber}.`
    });
}

function getDozenRange(dozenNumber) {
    switch (dozenNumber) {
        case '1':
            return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        case '2':
            return [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
        case '3':
            return [25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36];
        default:
            return [];
    }
}

// Function to place a bet for a user
async function placeBet(user, betType, amount, additionalParams = {}) {
    const currentBalance = await initializeWallet(user); 

    // Check if the user has enough balance to place the bet
    if (currentBalance < amount) {
        await postMessage({
            room: process.env.ROOM_UUID,
            message: `@${user}, you do not have enough funds to place that bet!`
        });
        return; 
    }

    // Deduct the amount from the user's wallet using removeFromUserWallet
    const success = await removeFromUserWallet(user, amount);

    // Check if the wallet deduction was successful
    if (!success) {
        await postMessage({
            room: process.env.ROOM_UUID,
            message: `@${user}, an error occurred while processing your bet. Please try again.`
        });
        return; 
    }

    // Log the bet for the user
    if (!bets[user]) bets[user] = []; 
    bets[user].push({ type: betType, amount: amount, ...additionalParams });

    // Optional: Log the successful bet placement
    console.log(`User ${user} placed a bet of $${amount} on ${betType}.`);
}


async function drawWinningNumber() {
    logUserBets();
    if (!rouletteGameActive) {
        await postMessage({
            room: process.env.ROOM_UUID,
            message: `Roulette Game Inactive`
        });
        return;
    }

    const winningNumber = Math.floor(Math.random() * 37);
    const winningColor = getRouletteColor(winningNumber);

    console.log(`Winning Number: ${winningNumber}, Winning Color: ${winningColor}`);

    const colorEmoji = winningColor === 'red' ? '🟥' : winningColor === 'black' ? '⬛' : '🟩';

    await postMessage({
        room: process.env.ROOM_UUID,
        message: `The ball landed on ${winningNumber} ${colorEmoji} (${winningColor.toUpperCase()}) !`
    });

    let userWinnings = {}; // Object to store each user's total winnings and total bets

    for (const [user, userBets] of Object.entries(bets)) {
        const nickname = await getUserNickname(user);
        let totalWinAmount = 0;
        let totalBetAmount = 0; // Track the total bet amount

        for (const bet of userBets) {
            let winAmount = 0;
            totalBetAmount += bet.amount; // Accumulate total bet amount for this user

            switch (bet.type) {
                case 'red':
                case 'black':
                    if (bet.type === winningColor) {
                        winAmount += bet.amount * 2; // 2x payout for correct color
                    }
                    break;
                case 'green':
                    if (bet.type === winningColor) {
                        winAmount += bet.amount * 35; // 35x payout for green
                    }
                    break;
                case 'odd':
                    if (winningNumber % 2 !== 0 && winningNumber !== 0) {
                        winAmount += bet.amount * 2; // 2x payout for odd number
                    }
                    break;
                case 'even':
                    if (winningNumber % 2 === 0 && winningNumber !== 0) {
                        winAmount += bet.amount * 2; // 2x payout for even number
                    }
                    break;
                case 'number':
                    if (bet.number === winningNumber) {
                        winAmount += bet.amount * 35; // 35x payout for exact number
                    }
                    break;
                case 'dozen':
                    const dozenRange = getDozenRange(bet.dozen);
                    if (dozenRange.length > 0 && dozenRange.includes(winningNumber)) {
                        winAmount += bet.amount * 3; // 3x payout for correct dozen
                    }
                    break;
                case 'high':
                    if (winningNumber >= 19 && winningNumber <= 36) {
                        winAmount += bet.amount * 2; // 2x payout for high numbers
                    }
                    break;
                case 'low':
                    if (winningNumber >= 1 && winningNumber <= 18) {
                        winAmount += bet.amount * 2; // 2x payout for low numbers
                    }
                    break;
                default:
                    console.error(`Unknown bet type: ${bet.type}`);
            }

            totalWinAmount += winAmount; // Add current bet winnings to the user's total winnings
        }

        // Record user total bets and winnings
        userWinnings[user] = {
            totalWin: totalWinAmount,
            totalBet: totalBetAmount,
            nickname: nickname
        };
    }

    let hasWinners = false; // Flag to track if there are winners
    let outcomeMessage = "\n"; // Initialize outcome message

    for (const [user, winnings] of Object.entries(userWinnings)) {
        const netOutcome = winnings.totalWin - winnings.totalBet; // Calculate net outcome
        const nickname = winnings.nickname;

        // Fetch the user's current balance before updating
        const currentBalance = await getUserWallet(user);

        if (netOutcome > 0) {
            hasWinners = true;
            outcomeMessage += `🎉 ${nickname} is a Winner! +$${netOutcome} 🎉\nWin: +$${winnings.totalWin}\nBets: $${winnings.totalBet}\nCurrent Balance Before Payout: $${currentBalance}\n`;

            try {
                await addToUserWallet(user, winnings.totalWin);
                const updatedBalance = await getUserWallet(user); // Fetch updated balance after payout
                outcomeMessage += `Updated Balance: $${updatedBalance}\n\n`;
            } catch (error) {
                console.error(`Error updating wallet for @${nickname}: ${error}`);
            }
        } else {
            outcomeMessage += `😢 ${nickname} loses. Loss: -$${winnings.totalBet}\nCurrent Balance: $${currentBalance}\n\n`;
        }
    }

    if (!hasWinners) {
        outcomeMessage += "No winners this round. Better luck next time!";
    }

    console.log(outcomeMessage);

    await postMessage({
        room: process.env.ROOM_UUID,
        message: outcomeMessage
    });
}



// Main handler function to route commands
export async function handleRouletteCommandWrapper(payload) {
    if (payload.message.startsWith('/roulette')) {
        await handleRouletteCommandWrapper(payload);
    } else if (rouletteGameActive && (
        payload.message.startsWith('/red') ||
        payload.message.startsWith('/black') ||
        payload.message.startsWith('/green') || // Added this line if needed
        payload.message.startsWith('/odd') ||
        payload.message.startsWith('/even') ||
        payload.message.startsWith('/high') ||
        payload.message.startsWith('/low') ||
        payload.message.startsWith('/number') ||
        payload.message.startsWith('/dozen') ||
        payload.message.startsWith('/column') ||
        payload.message.startsWith('/two') ||   // Include two numbers
        payload.message.startsWith('/three') || // Include three numbers
        payload.message.startsWith('/four') ||  // Include four numbers
        payload.message.startsWith('/five') ||  // Include five numbers
        payload.message.startsWith('/six')       // Include six numbers
    )) {
        await handleRouletteBet(payload); // Handle the user's bet
    }
}

// Function to handle balance command
async function handleBalanceCommand(payload) {
    const user = payload.sender;
    console.log('User ID:', user); // Log the user ID

    const userNickname = await getUserNickname(user); // Function to get the user's nickname
    console.log('User Nickname:', userNickname); // Log the retrieved nickname

    if (!userNickname) {
        await postMessage({
            room: process.env.ROOM_UUID,
            message: `@${user}, I couldn't find your nickname.`
        });
        return; // Exit if nickname is not found
    }

    const currentBalance = await initializeWallet(user); // Ensure the user's wallet is initialized and get the balance

    await postMessage({
        room: process.env.ROOM_UUID,
        message: `@${userNickname}, your current balance is $${currentBalance}.`
    });
}


export { startRouletteGame, handleRouletteBet, rouletteGameActive, handleBalanceCommand };
