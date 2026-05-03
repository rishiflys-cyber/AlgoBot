
exports.generate = async function(kc){

  const q = await kc.getQuote(["NSE:NIFTY 50"]);
  const spot = q["NSE:NIFTY 50"].last_price;

  const strike = Math.round(spot/50)*50;

  return [{
    symbol:`NIFTY${strike}CE`,
    exchange:"NFO",
    type:"DYNAMIC_OPTIONS"
  }];
};
