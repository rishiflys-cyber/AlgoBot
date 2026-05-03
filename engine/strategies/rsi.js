
exports.generate = async function(kc){

  const q = await kc.getQuote(["NSE:TCS"]);
  const price = q["NSE:TCS"].last_price;

  // fake RSI logic placeholder
  if(price % 5 === 0){

    let sl = price * 0.98;
    let target = price * 1.02;

    return [{
      symbol:"TCS",
      exchange:"NSE",
      sl:sl,
      target:target
    }];
  }

  return [];
};
