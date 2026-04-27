function generateSignals(symbols) {
  let signals = [];

  for (let sym of symbols) {
    const price = Math.random() * 1000 + 100;

    const score =
      Math.random() * 0.4 +
      Math.random() * 0.4 +
      Math.random() * 0.2;

    signals.push({
      symbol: sym,
      price,
      score
    });
  }

  signals.sort((a, b) => b.score - a.score);

  return signals;
}

module.exports = generateSignals;