const fs = require("fs");
const rsi = require("./strategies/rsi");

exports.run = async function(kc, capital){

  const now = new Date().toLocaleString("en-US",{timeZone:"Asia/Kolkata"});
  const d = new Date(now);
  const t = d.getHours()*60 + d.getMinutes();

  if(t < 555 || t > 925){
    return {status:"MARKET_CLOSED", mode:"V87_ENGINE"};
  }

  const positions = await kc.getPositions();
  let pnl=0;
  positions.net.forEach(p=> pnl+=p.pnl);

  let tradesLog=[];
  try{ tradesLog=JSON.parse(fs.readFileSync("./data/trades.json")); }catch{}

  // EXIT ENGINE
  for(let trade of tradesLog){
    if(trade.status==="LIVE"){
      let quote = await kc.getQuote([`NSE:${trade.symbol}`]);
      let price = quote[`NSE:${trade.symbol}`].last_price;

      if(price <= trade.sl){
        trade.status="SL_HIT";
      } else if(price >= trade.target){
        trade.status="TARGET_HIT";
      } else if(price > trade.entry*1.01){
        trade.sl = price*0.99;
        trade.status="TRAILING";
      }
    }
  }

  fs.writeFileSync("./data/trades.json", JSON.stringify(tradesLog,null,2));

  // ENTRY
  const signals = await rsi.generate(kc);

  let results=[];

  for(let s of signals){

    if(positions.net.length>0) continue;

    try{
      let order = await kc.placeOrder("regular",{
        exchange:"NSE",
        tradingsymbol:s.symbol,
        transaction_type:"BUY",
        quantity:1,
        product:"MIS",
        order_type:"MARKET"
      });

      let trade={
        symbol:s.symbol,
        entry:s.price,
        sl:s.sl,
        target:s.target,
        status:"LIVE"
      };

      tradesLog.push(trade);
      fs.writeFileSync("./data/trades.json", JSON.stringify(tradesLog,null,2));

      results.push(trade);

    }catch(e){
      results.push({symbol:s.symbol,status:"FAILED",reason:e.message});
    }
  }

  return {status:"RUNNING", pnl, trades:tradesLog, mode:"V87_ENGINE"};
};
