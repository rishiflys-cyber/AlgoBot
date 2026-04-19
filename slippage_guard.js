const MAX_SLIPPAGE = 0.002;

function isSlippageSafe(expectedPrice, currentPrice){
  if(!expectedPrice || !currentPrice) return true;
  const diff = Math.abs(currentPrice - expectedPrice) / expectedPrice;
  return diff <= MAX_SLIPPAGE;
}

module.exports = { isSlippageSafe };
