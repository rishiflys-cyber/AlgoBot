exports.generate = async function(kc){
  const q = await kc.getQuote(["NSE:TCS"]);
  return [{symbol:"TCS", price:q["NSE:TCS"].last_price}];
};
