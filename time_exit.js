
/**
 * Upgrade 6: Time-Based Exit (NO LOGIC CHANGE)
 * Exits trades after max holding time to avoid stagnation.
 */

const tradeTime = {};
const MAX_HOLD_MS = 15 * 60 * 1000; // 15 minutes

function markEntry(symbol){
  tradeTime[symbol] = Date.now();
}

function shouldExit(symbol){
  const now = Date.now();
  const entry = tradeTime[symbol] || 0;
  return (now - entry) >= MAX_HOLD_MS;
}

function clear(symbol){
  delete tradeTime[symbol];
}

module.exports = { markEntry, shouldExit, clear };
