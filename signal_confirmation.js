// Upgrade 2: Signal Confirmation Layer (NO LOGIC CHANGE, additive)

let lastSignals = {};

function confirmSignal(symbol, newSignal){
  if(!newSignal) {
    lastSignals[symbol] = null;
    return null;
  }

  if(lastSignals[symbol] === newSignal){
    lastSignals[symbol] = null; // reset after confirmation
    return newSignal;
  }

  lastSignals[symbol] = newSignal;
  return null;
}

module.exports = { confirmSignal };
