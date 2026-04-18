function allocateCapital(totalCapital, activeTrades, maxTrades){
  return totalCapital / Math.max(1, (maxTrades - activeTrades.length));
}

module.exports = { allocateCapital };