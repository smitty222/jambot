// src/games/craps/crapsState.js

export const PHASES = {
  IDLE: 'IDLE',
  COME_OUT: 'COME_OUT',
  POINT: 'POINT'
}

export const crapsState = {
  // Players at the table, in seat order (user UUIDs)
  tableUsers: [],
  currentShooter: 0,

  // Game state
  phase: PHASES.IDLE,
  point: null,
  isBetting: false,
  canJoinTable: true,
  bettingTimeout: null,

  // Bets
  passBets: Object.create(null), // userId -> amount
  dontPassBets: Object.create(null), // userId -> amount

  // Come bets: pending means waiting for their "come-out" roll;
  // onNumbers[n] means moved to that number waiting to be hit before 7.
  comePending: Object.create(null), // userId -> amount
  comeOn: Object.create(null), // userId -> {4,5,6,8,9,10}

  // Place bets: userId -> {4,5,6,8,9,10}
  placeBets: Object.create(null),

  // Roll info
  lastRoll: null, // { d1, d2, total }
  rollsThisRound: 0,

  // Records
  records: {
    maxRolls: { count: 0, shooterId: null }
  }
}
