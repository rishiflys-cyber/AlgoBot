const fs = require("fs");

exports.run = async function(kc, capital){

  const positions = await kc.getPositions();
  let pnl = 0;
  positions.net.forEach(p=> pnl+=p.pnl);

  let trades=[];
  try{ trades=JSON.parse(fs.readFileSync("./data/trades.json")); }catch{}

  // EXIT ENGINE (REAL SELL)
  for(let t of trades){
    if(t.status==="LIVE"){
      let q = await kc.getQuote([`NSE:${t.symbol}`]);
      let price = q[`NSE:${t.symbol}`].last_price;

      if(price <= t.sl || price >= t.target){
        await kc.placeOrder("regular",{
          exchange:"NSE",
          tradingsymbol:t.symbol,
          transaction_type:"SELL",
          quantity:1,
          product:"MIS",
          order_type:"MARKET"
        });

        t.status = price <= t.sl ? "SL_EXIT" : "TARGET_EXIT";
      }
    }
  }

  // ENTRY (BUY)
  if(positions.net.length===0){
    try{
      let q = await kc.getQuote(["NSE:TCS"]);
      let price = q["NSE:TCS"].last_price;

      let sl = price*0.98;
      let target = price*1.03;

      await kc.placeOrder("regular",{
        exchange:"NSE",
        tradingsymbol:"TCS",
        transaction_type:"BUY",
        quantity:1,
        product:"MIS",
        order_type:"MARKET"
      });

      trades.push({
        symbol:"TCS",
        entry:price,
        sl:sl,
        target:target,
        status:"LIVE"
      });

    }catch(e){}
  }

  fs.writeFileSync("./data/trades.json",JSON.stringify(trades,null,2));

  return {status:"AUTO_EXECUTING", pnl, trades, mode:"V88_FULL_AUTO"};
};
