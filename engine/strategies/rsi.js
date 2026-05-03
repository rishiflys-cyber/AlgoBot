exports.generate = async function(kc){

  const q = await kc.getQuote(["NSE:TCS"]);
  const price = q["NSE:TCS"].last_price;

  // pseudo RSI threshold
  if(price % 7 === 0){

    let sl = price * 0.98;
    let target = price * 1.03;

    return [{
      symbol:"TCS",
      price:price,
      sl:sl,
      target:target
    }];
  }

  return [];
};
