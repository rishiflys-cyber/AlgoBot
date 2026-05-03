
const fs = require("fs");

// EMA calculation
function ema(prices, period){
  let k = 2/(period+1);
  let ema = prices[0];
  for(let i=1;i<prices.length;i++){
    ema = prices[i]*k + ema*(1-k);
  }
  return ema;
}

exports.run = async function(kc, capital){

  const positions = await kc.getPositions();
  let pnl=0;
  positions.net.forEach(p=> pnl+=p.pnl);

  let trades=[];
  try{ trades=JSON.parse(fs.readFileSync("./data/trades.json")); }catch{}

  let q = await kc.getQuote(["NSE:NIFTY 50"]);
  let spot = q["NSE:NIFTY 50"].last_price;

  // fake candles for EMA (structure ready)
  let prices = [spot*0.98, spot*0.99, spot, spot*1.01, spot*1.02];

  let ema20 = ema(prices,20);
  let ema50 = ema(prices,50);

  let trend = ema20 > ema50 ? "BULLISH":"BEARISH";

  // TIME FILTER (avoid early volatility)
  let now = new Date().toLocaleString("en-US",{timeZone:"Asia/Kolkata"});
  let d = new Date(now);
  let minutes = d.getHours()*60 + d.getMinutes();

  if(minutes < 570 || minutes > 900){
    return {status:"NO_TRADE_TIME_FILTER", mode:"V94_ELITE"};
  }

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

      // tighter trailing
      if(price > t.entry*1.02){
        t.sl = price*0.997;
      }
    }
  }

  // ENTRY (ELITE OPTIONS LOGIC)
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

      trades.push({
        symbol:symbol,
        exchange:"NFO",
        entry:spot,
        sl:spot*0.97,
        target:spot*1.06,
        qty:1,
        trend:trend,
        status:"LIVE"
      });

    }catch(e){}
  }

  fs.writeFileSync("./data/trades.json",JSON.stringify(trades,null,2));

  return {status:"ELITE_RUNNING", pnl, trend, trades, mode:"V94_ELITE"};
};
