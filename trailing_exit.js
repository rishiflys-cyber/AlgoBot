function updateTrailing(trade, currentPrice){
  let pnl = trade.type==="BUY"
    ? (currentPrice - trade.entry)/trade.entry
    : (trade.entry - currentPrice)/trade.entry;

  if(!trade.maxPnl || pnl > trade.maxPnl){
    trade.maxPnl = pnl;
  }

  let trailStop = trade.maxPnl - 0.005;

  return pnl < trailStop;
}

module.exports = { updateTrailing };