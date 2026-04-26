const lossTracker = {};

function calculateTradeQuality({ momentum, volumeStrength, agreementScore, regime }) {
  let score = momentum * 40 + volumeStrength * 30 + agreementScore * 30;

  if (regime.type === "SIDEWAYS") score *= 0.7;
  if (volumeStrength < 1) score *= volumeStrength;

  return Math.min(100, score);
}

function shouldTrade({
  probability,
  volumeBreakout,
  agreementScore,
  regime,
  tradeQualityScore,
  symbol
}) {

  if (
    lossTracker[symbol] &&
    Date.now() < lossTracker[symbol].cooldownUntil
  ) return false;

  if (regime.type === "SIDEWAYS") return false;

  if (regime.type === "VOLATILE") {
    if (probability < 0.6 || volumeBreakout < 1.8) return false;
  }

  if (agreementScore < 2) return false;
  if (probability < 0.5) return false;
  if (tradeQualityScore < 65) return false;

  return true;
}

function updateLossTracker(symbol, isLoss) {
  if (!lossTracker[symbol]) {
    lossTracker[symbol] = { losses: 0, cooldownUntil: 0 };
  }

  if (isLoss) {
    lossTracker[symbol].losses += 1;

    if (lossTracker[symbol].losses >= 2) {
      lossTracker[symbol].cooldownUntil = Date.now() + (10 * 60 * 1000);
      lossTracker[symbol].losses = 0;
    }
  } else {
    lossTracker[symbol].losses = 0;
  }
}

module.exports = {
  calculateTradeQuality,
  shouldTrade,
  updateLossTracker,
  lossTracker
};