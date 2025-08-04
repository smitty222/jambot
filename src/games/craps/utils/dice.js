// src/games/craps/utils/dice.js

// Roll two six‐sided dice
export function rollDice() {
  const d1 = 1 + Math.floor(Math.random() * 6);
  const d2 = 1 + Math.floor(Math.random() * 6);
  return { d1, d2, total: d1 + d2 };
}
