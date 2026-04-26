// === REPLACE ONLY THE SIGNAL CONDITION BLOCK ===
const allowed = shouldTrade({
  probability,
  volumeBreakout,
  agreementScore,
  regime,
  tradeQualityScore,
  symbol
});

if (allowed) {