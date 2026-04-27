function generateSignals(symbols) {
  let signals = [];

  for (let sym of symbols) {
    // Simulated market data (next upgrade = real candles)
    const price = Math.random() * 1000 + 100;

    const momentum = Math.random();   // trend strength
    const breakout = Math.random();   // breakout probability
    const volatility = Math.random(); // movement

    // FINAL SCORE
    const score =
      momentum * 0.4 +
      breakout * 0.4 +
      volatility * 0.2;

    // FILTER (IMPORTANT)
   signals.push({
  symbol: sym,
  price,
  score
});
    }
  }

  // SORT BEST FIRST
  signals.sort((a, b) => b.score - a.score);

  return signals;
}

module.exports = generateSignals;