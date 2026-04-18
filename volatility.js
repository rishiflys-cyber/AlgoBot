function getVolatility(prevPrices){
  if(prevPrices.length < 5) return 0.002;

  let changes = [];
  for(let i=1;i<prevPrices.length;i++){
    changes.push(Math.abs((prevPrices[i]-prevPrices[i-1])/prevPrices[i-1]));
  }

  return changes.reduce((a,b)=>a+b,0)/changes.length;
}

function dynamicThreshold(vol){
  return Math.max(0.001, vol * 1.2);
}

module.exports = { getVolatility, dynamicThreshold };