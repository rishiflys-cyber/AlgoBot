function momentum(p, prev){
  if(!prev) return null;
  let c = (p-prev)/prev;
  if(c>0.002) return "BUY";
  if(c<-0.002) return "SELL";
  return null;
}

function meanReversion(p, prev){
  if(!prev) return null;
  let c = (p-prev)/prev;
  if(c<-0.003) return "BUY";
  if(c>0.003) return "SELL";
  return null;
}

function combinedSignal(p, prev){
  return momentum(p, prev) || meanReversion(p, prev);
}

module.exports = { momentum, meanReversion, combinedSignal };