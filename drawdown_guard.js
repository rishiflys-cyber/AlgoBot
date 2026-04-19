
// Drawdown Guard

const MAX_DD = -0.02; // -2%

function isDrawdownSafe(pnl, capital){
  const dd = pnl / capital;
  return dd > MAX_DD;
}

function updatePnL(pnl, capital){
  return pnl * capital;
}

module.exports = { isDrawdownSafe, updatePnL };
