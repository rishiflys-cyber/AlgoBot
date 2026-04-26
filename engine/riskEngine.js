function getPositionSize(capital, price) {
  return Math.floor((capital * 0.02) / price);
}

module.exports = { getPositionSize };