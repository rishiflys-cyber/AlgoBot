function unifiedSignal(price, prev){
  if(!prev) return null;

  const change = (price - prev) / prev;

  if(change > 0.002) return "BUY";
  if(change < -0.002) return "SELL";

  return null;
}

module.exports = { unifiedSignal };