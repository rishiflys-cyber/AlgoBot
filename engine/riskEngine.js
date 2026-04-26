const { volatilityMap } = require('./volatility');

function getDynamicSLTP(symbol, price) {
  const volatility = volatilityMap[symbol] || 0.001;

  let multiplier = 1.5;

  let slPct = volatility * multiplier;
  let tpPct = slPct * 1.5;

  return {
    stopLoss: price * (1 - slPct),
    target: price * (1 + tpPct)
  };
}

module.exports = { getDynamicSLTP };