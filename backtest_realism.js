function applyCosts(pnl){
  const fee = 0.0005;
  return pnl - fee;
}

module.exports = { applyCosts };