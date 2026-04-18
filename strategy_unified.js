let history = {};

function unifiedSignal(price, prev, symbol){
  if(!prev) return null;

  if(!history[symbol]) history[symbol] = [];
  history[symbol].push(price);

  if(history[symbol].length > 20) {
    history[symbol].shift();
  }

  if(history[symbol].length < 10) return null;

  let prices = history[symbol];
  let mean = prices.reduce((a,b)=>a+b,0)/prices.length;

  let variance = prices.reduce((sum,p)=>{
    return sum + Math.pow(p - mean, 2);
  },0) / prices.length;

  let vol = Math.sqrt(variance) / mean;

  let threshold = vol * 1.2;

  let change = (price - prev) / prev;

  if(change > threshold) return "BUY";
  if(change < -threshold) return "SELL";

  return null;
}

module.exports = { unifiedSignal };
