
// Upgrade 8: Trade Quality Filter

function isHighQualityMove(prev, current){
  if(!prev || !current) return true;
  const change = Math.abs(current - prev) / prev;

  // require minimum move strength (filters micro noise)
  return change > 0.001; // 0.1%
}

module.exports = { isHighQualityMove };
