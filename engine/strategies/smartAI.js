exports.generate = async function(kc){
  const q = await kc.getQuote(["NSE:TCS"]);
  const price = q["NSE:TCS"].last_price;

  if(price > 2000){
    return [{symbol:"TCS", exchange:"NSE", type:"AI"}];
  }
  return [];
};
