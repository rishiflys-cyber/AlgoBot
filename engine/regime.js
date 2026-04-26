function detectMarketRegime(prices, volumes) {
  if (prices.length < 10) return { type: "NORMAL", strength: 0.5 };

  const range = Math.max(...prices) - Math.min(...prices);
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;

  const rangePct = range / avg;

  let type = "NORMAL";
  let strength = 0.5;

  if (rangePct < 0.002) {
    type = "SIDEWAYS";
    strength = 0.2;
  } else if (rangePct > 0.01) {
    type = "VOLATILE";
    strength = 0.9;
  }

  return { type, strength };
}

module.exports = { detectMarketRegime };