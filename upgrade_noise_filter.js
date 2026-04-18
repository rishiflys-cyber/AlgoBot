function noiseFilter(change){
  return Math.abs(change) >= 0.001;
}
module.exports = { noiseFilter };