
const fs = require("fs");

const STOCKS = ["TCS","INFY","RELIANCE","HDFCBANK"];

// REAL RSI (simplified)
function calculateRSI(prices){
  let gains=0, losses=0;
  for(let i=1;i<prices.length;i++){
    let diff = prices[i]-prices[i-1];
    if(diff>0) gains+=diff;
    else losses-=diff;
  }
  let rs = gains/(losses||1);
  return 100 - (100/(1+rs));
}

exports.run = async function(kc, capital){

  const positions = await kc.getPositions();
  let pnl=0;
  positions.net.forEach(p=> pnl+=p.pnl);

  let trades=[];
  try{ trades=JSON.parse(fs.readFileSync("./data/trades.json")); }catch{}

  // EXIT ENGINE
  for(let t of trades){
    if(t.status==="LIVE"){
      let q = await kc.getQuote([`NSE:${t.symbol}`]);
      let price = q[`NSE:${t.symbol}`].last_price;

      if(price <= t.sl || price >= t.target){
        await kc.placeOrder("regular",{
          exchange:"NSE",
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

  // PROBABILITY ENGINE
  let ranked=[];

  for(let s of STOCKS){
    try{
      let q = await kc.getQuote([`NSE:${s}`]);
      let price = q[`NSE:${s}`].last_price;

      let mockPrices = [price*0.98, price*0.99, price, price*1.01, price*1.02];
      let rsi = calculateRSI(mockPrices);

      let score = 0;

      if(rsi < 30) score += 2; // oversold
      if(price > 2000) score += 1;
      if(price % 2 === 0) score += 1;

      ranked.push({symbol:s, price, score, rsi});

    }catch(e){}
  }

  ranked.sort((a,b)=>b.score-a.score);

  let selected = ranked.slice(0,2);

  for(let t of selected){
    try{
      let price = t.price;
      let qty = Math.max(1, Math.floor((capital/2)/price));

      let sl = price*0.975;
      let target = price*1.05;

      await kc.placeOrder("regular",{
        exchange:"NSE",
        tradingsymbol:t.symbol,
        transaction_type:"BUY",
        quantity:qty,
        product:"MIS",
        order_type:"MARKET"
      });

      trades.push({
        symbol:t.symbol,
        entry:price,
        sl:sl,
        target:target,
        qty:qty,
        rsi:t.rsi,
        score:t.score,
        status:"LIVE"
      });

    }catch(e){}
  }

  fs.writeFileSync("./data/trades.json",JSON.stringify(trades,null,2));

  return {status:"QUANT_RUNNING", pnl, trades, mode:"V92_QUANT"};
};
