
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

/* RISK CONFIG */
const RISK_PER_TRADE = 0.02; // 2%

/* EMA */
function ema(data, period){
  let k = 2/(period+1);
  let emaVal = data[0];
  for(let i=1;i<data.length;i++){
    emaVal = data[i]*k + emaVal*(1-k);
  }
  return emaVal;
}

/* RSI */
function rsi(closes){
  let gains=0, losses=0;
  for(let i=1;i<closes.length;i++){
    let diff = closes[i]-closes[i-1];
    if(diff>0) gains+=diff;
    else losses-=diff;
  }
  let rs = gains/(losses || 1);
  return 100 - (100/(1+rs));
}

/* MARKET */
async function getMarket(){
  kc.setAccessToken(process.env.ACCESS_TOKEN);

  const inst = 408065;
  const now = new Date();
  const from = new Date(now.getTime() - 60*60*1000);

  const candles = await kc.getHistoricalData(inst, from, now, "5minute");

  const closes = candles.map(c=>c.close);
  const price = closes[closes.length-1];

  const r = rsi(closes);
  const e20 = ema(closes,20);
  const e50 = ema(closes,50);

  const trend = e20 > e50 ? "UP":"DOWN";
  const momentum = price - closes[closes.length-2];

  return { price, rsi:r, trend, momentum };
}

/* AI */
function aiDecision(m){
  let score = 0;
  if(m.trend==="UP") score+=30;
  if(m.rsi<40) score+=30;
  if(m.momentum>0) score+=20;

  return { action: score>=60?"BUY":"HOLD", confidence: score };
}

/* POSITION SIZING */
function calculateQty(price, sl){
  const riskAmount = capital * RISK_PER_TRADE;
  const slDistance = Math.abs(price - sl);

  if(slDistance === 0) return 1;

  let qty = Math.floor(riskAmount / slDistance);

  return Math.max(qty, 1);
}

/* LOOP */
setInterval(async ()=>{
  try{
    let m = await getMarket();
    let ai = aiDecision(m);

    if(!trades.length && ai.action==="BUY"){

      const sl = m.price * 0.97;
      const target = m.price * 1.05;
      const qty = calculateQty(m.price, sl);

      trades.push({
        symbol:"INFY",
        entry:m.price,
        sl,
        target,
        qty,
        status:"LIVE",
        confidence:ai.confidence
      });

    } 
    else if(trades.length){

      let t = trades[0];
      let price = m.price;
      let pnl = (price - t.entry) * t.qty;

      if(price>=t.target || price<=t.sl){
        t.status="CLOSED";
        t.exit=price;
        t.pnl=pnl;

        capital+=pnl;
        closedTrades.push(t);

        fs.appendFileSync("trades.log", JSON.stringify(t)+"\n");
        trades=[];
      }
    }

  }catch(e){
    console.log("ERR:", e.message);
  }

},8000);

/* ROUTE */
app.get("/performance",(req,res)=>{
  res.json({
    capital,
    trades,
    closedTrades,
    risk_per_trade:RISK_PER_TRADE,
    mode:"V115_POSITION_SIZING"
  });
});

app.listen(PORT,()=>console.log("V115 RUNNING"));
