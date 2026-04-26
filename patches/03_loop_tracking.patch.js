// === INSIDE MAIN LOOP (after fetching price & volume) ===
priceHistoryForRegime.push(price);
volumeHistoryForRegime.push(volume);

if (priceHistoryForRegime.length > 20) priceHistoryForRegime.shift();
if (volumeHistoryForRegime.length > 20) volumeHistoryForRegime.shift();

const volatility = updateVolatility(symbol, price);
const regime = detectMarketRegime(priceHistoryForRegime, volumeHistoryForRegime);

const tradeQualityScore = calculateTradeQuality({
  momentum: probability,
  volumeStrength: volumeBreakout,
  agreementScore,
  regime
});