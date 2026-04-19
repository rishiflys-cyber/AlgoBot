// Upgrade 4: Per-Symbol Cooldown (additive, no logic change)

const lastTradeTime = {};
const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

function canTradeSymbol(symbol, cooldownMs = DEFAULT_COOLDOWN_MS){
  const now = Date.now();
  const last = lastTradeTime[symbol] || 0;
  return (now - last) >= cooldownMs;
}

function markTraded(symbol){
  lastTradeTime[symbol] = Date.now();
}

module.exports = { canTradeSymbol, markTraded };
