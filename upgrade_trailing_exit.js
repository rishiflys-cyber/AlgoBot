function trailingExit(trade, pnl){
  if(trade.peak === undefined) trade.peak = pnl;
  if(pnl > trade.peak) trade.peak = pnl;
  return pnl < (trade.peak - 0.005);
}
module.exports = { trailingExit };