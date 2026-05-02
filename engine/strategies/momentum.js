exports.generate = async function(kc){
  const q = await kc.getQuote(["NSE:INFY"]);
  return [{symbol:"INFY", price:q["NSE:INFY"].last_price}];
};
