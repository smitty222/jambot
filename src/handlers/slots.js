import { addToUserWallet, getUserWallet, removeFromUserWallet } from '../libs/walletManager.js';
import fs from 'fs';
import path from 'path';

const jackpotFile = path.join(process.cwd(), 'src/libs/jackpot.json');

// Slot machine symbols and payouts
const symbols = ['🍒', '🍋', '🍊', '🍉', '🔔', '⭐', '💎']; // Slot symbols
const payouts = {
    '🍒🍒🍒': 5,   // 5x the bet for 3 cherries
    '🍋🍋🍋': 4,   // 4x for 3 lemons
    '🍊🍊🍊': 3,   // 3x for 3 oranges
    '🍉🍉🍉': 6,   // 6x for 3 watermelons
    '🔔🔔🔔': 8,   // 8x for 3 bells
    '⭐⭐⭐': 10,    // 10x for 3 stars
    '💎💎💎': 20   // 20x for 3 diamonds
};

// Payouts for two matching symbols
const twoMatchPayouts = {
    '🍒🍒': 2,    // 2x for 2 cherries
    '🍋🍋': 1.5,  // 1.5x for 2 lemons
    '🍊🍊': 1.2,  // 1.2x for 2 oranges
    '🍉🍉': 2.5,  // 2.5x for 2 watermelons
    '🔔🔔': 3,    // 3x for 2 bells
    '⭐⭐': 4,     // 4x for 2 stars
    '💎💎': 5     // 5x for 2 diamonds
};

// Function to simulate a slot spin, randomly picking 3 symbols
function spinSlots() {
    const result = [];
    for (let i = 0; i < 3; i++) {
        result.push(symbols[Math.floor(Math.random() * symbols.length)]);
    }
    return result;
}

function getJackpotValue() {
    if (fs.existsSync(jackpotFile)) {
        const data = fs.readFileSync(jackpotFile, 'utf8');
        const json = JSON.parse(data);
        return json.progressiveJackpot || 100; // Default to 100 if not set
    } else {
        return 100; // Default to 100 if the file doesn't exist
    }
}

// Update the jackpot value in the JSON file
function updateJackpotValue(newValue) {
    const data = { progressiveJackpot: newValue };
    fs.writeFileSync(jackpotFile, JSON.stringify(data), 'utf8');
}

// Function to calculate the multiplier for wins
function calculateMultiplier(result) {
    const resultString = result.join('');

    // Check for 3-symbol match
    if (payouts.hasOwnProperty(resultString)) {
        return payouts[resultString];
    }

    // Check for two-symbol match
    const firstTwoSymbols = result[0] + result[1];
    const middleTwoSymbols = result[1] + result[2];
    const firstAndLast = result[0] + result[2];

    if (twoMatchPayouts.hasOwnProperty(firstTwoSymbols)) {
        return twoMatchPayouts[firstTwoSymbols];
    }
    if (twoMatchPayouts.hasOwnProperty(middleTwoSymbols)) {
        return twoMatchPayouts[middleTwoSymbols];
    }
    if (twoMatchPayouts.hasOwnProperty(firstAndLast)) {
        return twoMatchPayouts[firstAndLast];
    }

    return 0; // No win
}

// Function to calculate payout with an RTP adjustment mechanism
function calculateRTP(winMultiplier, betAmount, rtp = 0.96) {
    // Expected payout based on RTP
    const expectedPayout = betAmount * winMultiplier * rtp;
    return expectedPayout;
}

async function playSlots(userUUID, betSize = 1, paylines = 1) {
    const maxBetSize = 1000; // Set a maximum bet size if desired
    const minBetSize = 1; // Set a minimum bet size

    if (betSize < minBetSize || betSize > maxBetSize) {
        return `Bet amount must be between $${minBetSize} and $${maxBetSize}.`;
    }
    const maxPaylines = 5; // Set a maximum number of paylines
    const rtp = 0.96;    // 96% RTP (Return to Player)
    const hitFrequency = 0.3; // 30% hit frequency for small wins

    try {
        // Get the current balance before the bet
        let currentBalance = await getUserWallet(userUUID);
        console.log(`User ${userUUID} current balance before bet: $${currentBalance}`);

        // Check for valid bet size and paylines
        const totalBet = betSize * paylines;
        if (betSize <= 0 || totalBet > currentBalance) {
            console.error(`Invalid bet amount: $${totalBet} for user ${userUUID}.`);
            return `Invalid bet amount. Your current balance is $${currentBalance}.`;
        }

        // Deduct the total bet from the user's wallet
        const deductionSuccess = await removeFromUserWallet(userUUID, totalBet);
        if (!deductionSuccess) {
            console.error(`Failed to deduct bet of $${totalBet} from user ${userUUID}.`);
            return `Unable to place your bet of $${totalBet}. Please check your balance.`;
        }

        console.log(`User ${userUUID} deducted bet of $${totalBet}.`);

        // Spin the slots across the chosen number of paylines
        const results = [];
        let winnings = 0;

        for (let line = 0; line < paylines; line++) {
            const slotsResult = spinSlots();
            results.push(slotsResult);

            const multiplier = calculateMultiplier(slotsResult);

            if (multiplier > 0) {
                // Calculate winnings using the calculateRTP function
                winnings += calculateRTP(multiplier, betSize, rtp);
            }
        }

        // Retrieve the current jackpot value
        let progressiveJackpot = getJackpotValue();

        // Update the progressive jackpot
        const jackpotContribution = totalBet * 0.05; // 5% of bet goes to jackpot
        progressiveJackpot += jackpotContribution;

        // Determine if player hits the jackpot
        if (isJackpotHit()) {
            winnings += progressiveJackpot; // Add jackpot to winnings
            progressiveJackpot = 100; // Reset jackpot
            console.log(`User ${userUUID} hit the jackpot!`);
        }

        // Save the updated jackpot value
        updateJackpotValue(progressiveJackpot);

        if (winnings > 0) {
            await addToUserWallet(userUUID, winnings); // Update the wallet with winnings

            // Refresh the balance after winning
            currentBalance = await getUserWallet(userUUID); // Fetch updated balance
            console.log(`User ${userUUID} won! New balance: $${currentBalance}`);
            return `____SPIN____\n\n${results.map(r => r.join(' | ')).join('\n')}\n_____________\n\n You Win $${winnings.toFixed(2)}!\nCurrent Balance: $${currentBalance}.`;
        } else {
            // Fetch the updated balance after deduction
            currentBalance = await getUserWallet(userUUID); // Refresh balance after deduction
            console.log(`User ${userUUID} lost the bet. New balance: $${currentBalance}`);
            return `____SPIN____\n\n${results.map(r => r.join(' | ')).join('\n')}\n______________\n\n You Lose $${totalBet}.\nCurrent Balance: $${currentBalance}.`;
        }
    } catch (error) {
        console.error('Error while playing slots:', error);
        return 'An error occurred while playing the slots. Please try again later.';
    }
}


// Simulate progressive jackpot hit with low probability
function isJackpotHit() {
    return Math.random() < 0.001; // 0.1% chance to hit jackpot
}

// Simplified command handler that accepts a bet amount
async function handleSlotsCommand(userUUID, betSize) {
    // Validate betSize
    if (betSize <= 0) {
        return 'Please enter a valid bet amount greater than 0.';
    }

    const message = await playSlots(userUUID, betSize);
    return message; // Return the message to display to the user
}


export { playSlots, handleSlotsCommand, getJackpotValue };
