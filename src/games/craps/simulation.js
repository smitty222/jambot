// src/games/craps/simulation.js

import { rollDice } from './utils/dice.js';
import { table }    from './service.js';
import { crapsState } from './crapsState.js';

/**
 * Perform one dice roll and route through come-out or point logic.
 */
export function doRoll() {
  const { d1, d2, total } = rollDice();
  table.emit('roll', { d1, d2, total });

  if (!crapsState.point) {
    table.resolveComeOut(total);
  } else {
    table.resolvePointPhase(total);
  }
}
