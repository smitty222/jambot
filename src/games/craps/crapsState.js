// src/games/craps/crapsState.js
export const crapsState = {
  tableUsers: [],
  currentShooter: 0,
  passBets: {},
  dontPassBets: {},
  comeBets: {},
  placeBets: {},
  point: null,
  phase: 'IDLE', 
  canJoinTable: false,
  isBetting: false,
  bettingTimeout: null
};
