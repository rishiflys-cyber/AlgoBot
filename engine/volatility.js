const priceHistory = {};
const volatilityMap = {};

function updateVolatility(symbol, price) {
  if (!priceHistory[symbol]) priceHistory[symbol] = [];

  priceHistory[symbol].push(price);
  if (priceHistory[symbol].length > 20) priceHistory[symbol].shift();

  if (priceHistory[symbol].length < 5) return 0;

  let changes = [];
  for (let i = 1; i < priceHistory[symbol].length; i++) {
    changes.push(Math.abs(priceHistory[symbol][i] - priceHistory[symbol][i - 1]));
  }

  const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;
  volatilityMap[symbol] = avgChange;

  return avgChange;
}

module.exports = { updateVolatility, volatilityMap };