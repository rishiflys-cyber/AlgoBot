let priceHistory = {};

function updateHistory(symbol, price){
  if(!priceHistory[symbol]) priceHistory[symbol] = [];
  priceHistory[symbol].push(price);
  if(priceHistory[symbol].length > 20) priceHistory[symbol].shift();
}

function getVolatility(symbol){
  let arr = priceHistory[symbol] || [];
  if(arr.length < 5) return 0.002;

  let changes = [];
  for(let i=1;i<arr.length;i++){
    changes.push(Math.abs((arr[i]-arr[i-1])/arr[i-1]));
  }

  return changes.reduce((a,b)=>a+b,0)/changes.length;
}

module.exports = { updateHistory, getVolatility };