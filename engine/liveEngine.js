const fs = require("fs");
const breakout = require("./strategies/breakout");
const momentum = require("./strategies/momentum");

exports.run = async function(kc, capital){

  const now = new Date().toLocaleString("en-US",{timeZone:"Asia/Kolkata"});
  const d = new Date(now);
  const t = d.getHours()*60 + d.getMinutes();

  if(t < 555 || t > 925){
    return {status:"MARKET_CLOSED", mode:"FULL_AUTO"};
  }

  const positions = await kc.getPositions();
  let pnl = 0;
  positions.net.forEach(p=>pnl+=p.pnl);

  const maxLoss = -capital*0.03;
  if(pnl <= maxLoss){
    return {status:"AUTO_STOP", pnl};
  }

  let tradesLog=[];
  try{ tradesLog=JSON.parse(fs.readFileSync("./data/trades.json")); }catch{}

  const signals=[
    ...(await breakout.generate(kc)),
    ...(await momentum.generate(kc))
  ];

  const results=[];

  for(let s of signals){

    let existing = tradesLog.find(t=>t.symbol===s.symbol && t.status==="LIVE");

    if(existing){
      let price = s.price;

      if(price > existing.entry*1.01){
        existing.sl = price*0.99;
        existing.status="TRAILING";
      }

      results.push(existing);
      continue;
    }

    if(positions.net.length>0) continue;

    try{
      let entry = s.price;
      let sl = entry*0.98;
      let risk = capital*0.01;
      let qty = Math.max(1, Math.floor(risk/(entry-sl)));

      let order = await kc.placeOrder("regular",{
        exchange:"NSE",
        tradingsymbol:s.symbol,
        transaction_type:"BUY",
        quantity:qty,
        product:"MIS",
        order_type:"LIMIT",
        price:entry
      });

      let trade={
        symbol:s.symbol,
        entry,
        sl,
        qty,
        order_id:order.order_id,
        status:"LIVE"
      };

      tradesLog.push(trade);
      fs.writeFileSync("./data/trades.json",JSON.stringify(tradesLog,null,2));

      results.push(trade);

    }catch(e){
      results.push({symbol:s.symbol,status:"FAILED",reason:e.message});
    }
  }

  return {mode:"FULL_SAFE_AUTO", pnl, trades:results};
};
