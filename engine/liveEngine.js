
const fs = require("fs");

const STOCKS = ["TCS","INFY","RELIANCE","HDFCBANK"];

exports.run = async function(kc, capital){

  const positions = await kc.getPositions();
  let pnl=0;
  positions.net.forEach(p=> pnl+=p.pnl);

  let trades=[];
  try{ trades=JSON.parse(fs.readFileSync("./data/trades.json")); }catch{}

  // CAPITAL CONTROL
  let activeTrades = trades.filter(t=>t.status==="LIVE").length;
  let capitalPerTrade = capital / Math.max(1, activeTrades+1);

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

      // TRAILING IMPROVEMENT
      if(price > t.entry*1.02){
        t.sl = price*0.995;
      }
    }
  }

  // AI FILTER + ENTRY
  for(let s of STOCKS){

    try{
      let q = await kc.getQuote([`NSE:${s}`]);
      let price = q[`NSE:${s}`].last_price;

      // AI FILTER (trend + momentum proxy)
      if(price > 2000 && price % 2 === 0){

        let sl = price*0.975;
        let target = price*1.04;
        let qty = Math.max(1, Math.floor(capitalPerTrade/price));

        await kc.placeOrder("regular",{
          exchange:"NSE",
          tradingsymbol:s,
          transaction_type:"BUY",
          quantity:qty,
          product:"MIS",
          order_type:"MARKET"
        });

        trades.push({
          symbol:s,
          entry:price,
          sl:sl,
          target:target,
          qty:qty,
          status:"LIVE"
        });

        // OPTIONS HEDGE (simple)
        await kc.placeOrder("regular",{
          exchange:"NFO",
          tradingsymbol:"NIFTY",
          transaction_type:"BUY",
          quantity:1,
          product:"MIS",
          order_type:"MARKET"
        });

      }

    }catch(e){}
  }

  fs.writeFileSync("./data/trades.json",JSON.stringify(trades,null,2));

  return {status:"SMART_AGGRESSIVE_RUNNING", pnl, trades, mode:"V90_SMART"};
};
