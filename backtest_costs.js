function applyCost(pnl){
  const cost = 0.0005;
  return pnl - cost;
}

module.exports = { applyCost };