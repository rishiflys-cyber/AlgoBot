function volatilityGate(prev, curr){
  if(!prev) return true;
  const change = Math.abs((curr - prev)/prev);
  return change > 0.001;
}
module.exports = { volatilityGate };