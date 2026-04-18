
let allocations = {};

function allocate(symbol, capital, risk){
  let amount = capital * risk;
  allocations[symbol] = amount;
  return amount;
}

function release(symbol){
  delete allocations[symbol];
}

module.exports = { allocate, release };
