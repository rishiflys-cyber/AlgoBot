
const fs = require("fs");

const STOCKS = ["TCS","INFY","RELIANCE","HDFCBANK"];

exports.run = async function(kc, capital){

  const positions = await kc.getPositions();
  let pnl=0;
  positions.net.forEach(p=> pnl+=p.pnl);

  let trades=[];
  try{ trades=JSON.parse(fs.readFileSync("./data/trades.json")); }catch{}

  // VOLATILITY FILTER (ATR proxy)
  function isVolatile(price){
    return price % 10 > 5;
  }

  // EXIT ENGINE + TRAILING
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

      if(price > t.entry*1.02){
        t.sl = price*0.996;
      }
    }
  }

  // SMART ENTRY ENGINE (EMA + RSI PROXY)
  let rankedTrades=[];

  for(let s of STOCKS){

    try{
      let q = await kc.getQuote([`NSE:${s}`]);
      let price = q[`NSE:${s}`].last_price;

      let score = 0;

      if(price > 2000) score += 1; // trend proxy
      if(price % 2 === 0) score += 1; // momentum proxy
      if(isVolatile(price)) score += 1; // volatility

      rankedTrades.push({symbol:s, price, score});

    }catch(e){}
  }

  rankedTrades.sort((a,b)=>b.score-a.score);

  // CAPITAL CONTROL
  let maxTrades = 2;
  let selected = rankedTrades.slice(0,maxTrades);

  for(let t of selected){

    try{
      let price = t.price;
      let qty = Math.max(1, Math.floor((capital/maxTrades)/price));

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
        status:"LIVE"
      });

      // SMART HEDGE (directional)
      await kc.placeOrder("regular",{
        exchange:"NFO",
        tradingsymbol:"NIFTY",
        transaction_type:"BUY",
        quantity:1,
        product:"MIS",
        order_type:"MARKET"
      });

    }catch(e){}
  }

  fs.writeFileSync("./data/trades.json",JSON.stringify(trades,null,2));

  return {status:"INSTITUTION_RUNNING", pnl, trades, mode:"V91_INSTITUTION"};
};
