
const fs = require("fs");

exports.run = async function(kc, capital){

  const positions = await kc.getPositions();
  let pnl=0;
  positions.net.forEach(p=> pnl+=p.pnl);

  let trades=[];
  try{ trades=JSON.parse(fs.readFileSync("./data/trades.json")); }catch{}

  // MARKET DIRECTION (simple trend)
  let q = await kc.getQuote(["NSE:NIFTY 50"]);
  let spot = q["NSE:NIFTY 50"].last_price;

  let trend = spot % 2 === 0 ? "BULLISH" : "BEARISH";

  // EXIT ENGINE
  for(let t of trades){
    if(t.status==="LIVE"){
      let q = await kc.getQuote([`${t.exchange}:${t.symbol}`]);
      let price = q[`${t.exchange}:${t.symbol}`].last_price;

      if(price <= t.sl || price >= t.target){
        await kc.placeOrder("regular",{
          exchange:t.exchange,
          tradingsymbol:t.symbol,
          transaction_type:"SELL",
          quantity:t.qty,
          product:"MIS",
          order_type:"MARKET"
        });

        t.status = price <= t.sl ? "SL_EXIT":"TARGET_EXIT";
      }
    }
  }

  // OPTIONS INTELLIGENCE
  if(positions.net.length===0){

    const strike = Math.round(spot/50)*50;

    let symbol = trend==="BULLISH"
      ? `NIFTY${strike}CE`
      : `NIFTY${strike}PE`;

    try{
      await kc.placeOrder("regular",{
        exchange:"NFO",
        tradingsymbol:symbol,
        transaction_type:"BUY",
        quantity:1,
        product:"MIS",
        order_type:"MARKET"
      });

      let entryPrice = spot;

      trades.push({
        symbol:symbol,
        exchange:"NFO",
        entry:entryPrice,
        sl:entryPrice*0.97,
        target:entryPrice*1.05,
        qty:1,
        trend:trend,
        status:"LIVE"
      });

    }catch(e){}
  }

  fs.writeFileSync("./data/trades.json",JSON.stringify(trades,null,2));

  return {status:"OPTIONS_INTELLIGENT_RUNNING", pnl, trend, trades, mode:"V93_OPTIONS"};
};
