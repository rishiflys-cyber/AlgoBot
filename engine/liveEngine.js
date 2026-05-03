
const fs = require("fs");

// REAL RSI
function calculateRSI(closes){
  let gains=0, losses=0;
  for(let i=1;i<closes.length;i++){
    let diff = closes[i]-closes[i-1];
    if(diff>0) gains+=diff;
    else losses-=diff;
  }
  let rs = gains/(losses||1);
  return 100 - (100/(1+rs));
}

// EMA
function ema(data, period){
  let k = 2/(period+1);
  let ema = data[0];
  for(let i=1;i<data.length;i++){
    ema = data[i]*k + ema*(1-k);
  }
  return ema;
}

exports.run = async function(kc, capital){

  const positions = await kc.getPositions();
  let pnl=0;
  positions.net.forEach(p=> pnl+=p.pnl);

  let trades=[];
  try{ trades=JSON.parse(fs.readFileSync("./data/trades.json")); }catch{}

  // FETCH REAL HISTORICAL DATA
  const instrument = 256265; // NIFTY
  const now = new Date();
  const from = new Date(now.getTime() - 60*60*1000); // last 1 hour

  const candles = await kc.getHistoricalData(
    instrument,
    from,
    now,
    "5minute"
  );

  const closes = candles.map(c=>c.close);

  if(closes.length < 10){
    return {status:"NO_DATA", mode:"V95_DATA"};
  }

  const rsi = calculateRSI(closes);
  const ema20 = ema(closes,20);
  const ema50 = ema(closes,50);

  let trend = ema20 > ema50 ? "BULLISH":"BEARISH";

  // EXIT
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

  // ENTRY CONDITION (REAL)
  if(positions.net.length===0){

    if(rsi < 35 || rsi > 65){

      const spot = closes[closes.length-1];
      const strike = Math.round(spot/50)*50;

      let symbol = trend==="BULLISH"
        ? `NIFTY${strike}CE`
        : `NIFTY${strike}PE`;

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
        rsi:rsi,
        trend:trend,
        status:"LIVE"
      });
    }
  }

  fs.writeFileSync("./data/trades.json",JSON.stringify(trades,null,2));

  return {
    status:"DATA_DRIVEN_RUNNING",
    pnl,
    rsi,
    trend,
    trades,
    mode:"V95_DATA"
  };
};
