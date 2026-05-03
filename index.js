
const express = require("express");
const fs = require("fs");
const { KiteConnect } = require("kiteconnect");

const app = express();
const PORT = process.env.PORT || 3000;

const kc = new KiteConnect({ api_key: process.env.API_KEY });

/* LOGIN */
app.get("/login",(req,res)=>res.redirect(kc.getLoginURL()));

app.get("/redirect", async (req,res)=>{
  const session = await kc.generateSession(
    req.query.request_token,
    process.env.API_SECRET
  );
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  res.send("ACCESS_TOKEN: "+session.access_token+"<br>IP: "+ip);
});

/* CORE */
let capital = 8560;
let trades = [];
let closedTrades = [];

/* CONFIG */
const symbols = {
  "INFY": 408065,
  "RELIANCE": 738561,
  "TCS": 2953217
};

const RISK_PER_TRADE = 0.02;
const MAX_CONCURRENT_TRADES = 3;

/* EMA */
function ema(data, period){
  let k = 2/(period+1);
  let val = data[0];
  for(let i=1;i<data.length;i++){
    val = data[i]*k + val*(1-k);
  }
  return val;
}

/* RSI */
function rsi(closes){
  let g=0,l=0;
  for(let i=1;i<closes.length;i++){
    let d=closes[i]-closes[i-1];
    if(d>0) g+=d; else l-=d;
  }
  let rs=g/(l||1);
  return 100-(100/(1+rs));
}

/* MARKET */
async function getMarket(inst){
  kc.setAccessToken(process.env.ACCESS_TOKEN);

  const now = new Date();
  const from = new Date(now.getTime() - 60*60*1000);

  const candles = await kc.getHistoricalData(inst, from, now, "5minute");
  const closes = candles.map(c=>c.close);

  const price = closes[closes.length-1];
  const r = rsi(closes);
  const e20 = ema(closes,20);
  const e50 = ema(closes,50);

  return {
    price,
    rsi:r,
    trend: e20>e50 ? "UP":"DOWN",
    momentum: price - closes[closes.length-2]
  };
}

/* AI */
function ai(m){
  let score=0;
  if(m.trend==="UP") score+=30;
  if(m.rsi<40) score+=30;
  if(m.momentum>0) score+=20;

  return {action: score>=60?"BUY":"HOLD", confidence:score};
}

/* POSITION */
function qty(price, sl){
  let risk = capital * RISK_PER_TRADE;
  let dist = Math.abs(price-sl);
  return Math.max(Math.floor(risk/(dist||1)),1);
}

/* LOOP */
setInterval(async ()=>{
  try{
    for(let sym in symbols){

      if(trades.length >= MAX_CONCURRENT_TRADES) break;

      let already = trades.find(t=>t.symbol===sym && t.status==="LIVE");
      if(already) continue;

      let m = await getMarket(symbols[sym]);
      let decision = ai(m);

      if(decision.action==="BUY"){

        let sl = m.price*0.97;
        let q = qty(m.price, sl);

        trades.push({
          symbol:sym,
          entry:m.price,
          sl,
          target:m.price*1.05,
          qty:q,
          status:"LIVE",
          confidence:decision.confidence
        });
      }
    }

    // EXIT LOOP
    for(let t of trades){
      if(t.status==="LIVE"){

        let m = await getMarket(symbols[t.symbol]);
        let price = m.price;
        let pnl = (price - t.entry)*t.qty;

        if(price>=t.target || price<=t.sl){
          t.status="CLOSED";
          t.exit=price;
          t.pnl=pnl;

          capital+=pnl;
          closedTrades.push(t);

          fs.appendFileSync("trades.log", JSON.stringify(t)+"\n");
        }
      }
    }

    // CLEAN CLOSED
    trades = trades.filter(t=>t.status==="LIVE");

  }catch(e){
    console.log("ERR:",e.message);
  }

},10000);

/* ROUTE */
app.get("/performance",(req,res)=>{
  res.json({
    capital,
    active_trades: trades.length,
    trades,
    closedTrades,
    mode:"V116_MULTI_STOCK"
  });
});

app.listen(PORT,()=>console.log("V116 RUNNING"));
