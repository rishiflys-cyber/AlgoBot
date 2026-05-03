
exports.generate = async function(kc){

  const q = await kc.getQuote(["NSE:NIFTY 50"]);
  const spot = q["NSE:NIFTY 50"].last_price;

  const strike = Math.round(spot/50)*50;

  // expiry auto (weekly rough)
  const today = new Date();
  const day = today.getDay();
  const diff = (4 - day + 7) % 7; // next Thursday
  const expiry = new Date(today);
  expiry.setDate(today.getDate() + diff);

  const month = expiry.toLocaleString('en-US',{month:'short'}).toUpperCase();
  const date = expiry.getDate();

  return [{
    symbol:`NIFTY${date}${month}${strike}CE`,
    exchange:"NFO",
    type:"OPTIONS"
  }];
};
