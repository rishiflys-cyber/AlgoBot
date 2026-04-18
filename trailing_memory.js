function updatePeak(trade, pnl){
  if(trade.peak === undefined) trade.peak = pnl;
  if(pnl > trade.peak) trade.peak = pnl;
}

function shouldTrailExit(trade, pnl){
  if(trade.peak === undefined) return false;
  return pnl < (trade.peak - 0.005);
}

module.exports = { updatePeak, shouldTrailExit };