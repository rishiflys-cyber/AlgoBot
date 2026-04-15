
/**
 * PATCH UPDATE - drop-in server.js
 * Adds:
 * - Multi-stock: RELIANCE, TCS, INFY
 * - AI score filter (>=60)
 * - Console marker for verification
 */
require("dotenv").config();
const express = require("express");
const path = require("path");
const { KiteConnect } = require("kiteconnect");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let access_token = null;
let BOT_ACTIVE = false;
let position = null;

console.log("🚀 ULTIMATE AI VERSION ACTIVE (PATCH)");

const STOCKS = ["RELIANCE","TCS","INFY"];
const EXCHANGE = "NSE";
const PRODUCT = "MIS";

const MAX_TRADE_VALUE = Number(process.env.MAX_TRADE_VALUE || 500);
const SL = Number(process.env.STOP_LOSS_PCT || 0.02);
const TP = Number(process.env.TARGET_PCT || 0.03);

// LOGIN
app.get("/login", (req,res)=> res.redirect(kite.getLoginURL()));

app.get("/redirect", async (req,res)=>{
  try {
    const session = await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
    access_token = session.access_token;
    kite.setAccessToken(access_token);
    res.send("Login Success ✅ ULTIMATE AI (PATCH)");
  } catch (e) {
    res.status(500).send("Login Failed ❌");
  }
});

// CONTROL
app.get("/start",(req,res)=>{ BOT_ACTIVE=true; res.send("STARTED"); });
app.get("/kill",(req,res)=>{ BOT_ACTIVE=false; res.send("STOPPED"); });

// DASHBOARD
app.get("/dashboard", async (req,res)=>{
  let capital = 0;
  try {
    const margins = await kite.getMargins();
    capital = margins?.equity?.net || 0;
  } catch {}
  res.json({capital, BOT_ACTIVE, position});
});

// EMA
function ema(values, period){
  const k = 2/(period+1);
  let prev = values[0];
  return values.map(v=>{
    prev = v*k + prev*(1-k);
    return prev;
  });
}

// AI SCORE
function aiScore(prices, candles){
  let score = 0;

  const trend = Math.abs((prices.at(-1)-prices.at(-5))/prices.at(-5));
  if(trend>0.002) score+=30;

  const last = candles.at(-1);
  const body = (last.close-last.open)/last.open;
  if(body>0.001) score+=30;

  const avgVol = candles.slice(-10).reduce((s,c)=>s+(c.volume||0),0)/10;
  if((last.volume||0)>avgVol) score+=20;

  if(prices.at(-1)>prices.at(-2) && prices.at(-2)>prices.at(-3)) score+=20;

  return score;
}

// AUTO START @ 9:20
setInterval(()=>{
  const now = new Date();
  if(now.getHours()===9 && now.getMinutes()===20){
    BOT_ACTIVE = true;
    console.log("AUTO START 9:20");
  }
},60000);

// ENTRY LOOP (scan stocks, 1 position max)
setInterval(async ()=>{
  if(!BOT_ACTIVE || !access_token || position) return;

  const now = new Date();
  if(now.getHours()===9 && now.getMinutes()<20) return;
  if(now.getHours()===14 && now.getMinutes()>=45) return;

  try{
    for(const SYMBOL of STOCKS){
      const to = new Date();
      const from = new Date(Date.now()-50*5*60*1000);

      const candles = await kite.getHistoricalData(`${EXCHANGE}:${SYMBOL}`,"5minute",from,to);
      const prices = candles.map(c=>c.close);
      if(prices.length < 30) continue;

      const e9 = ema(prices,9);
      const e21 = ema(prices,21);

      const crossUp = e9.at(-1)>e21.at(-1) && e9.at(-2)<=e21.at(-2);

      const score = aiScore(prices, candles);

      if(crossUp && score >= 60){
        const ltpData = await kite.getLTP([`${EXCHANGE}:${SYMBOL}`]);
        const ltp = ltpData[`${EXCHANGE}:${SYMBOL}`].last_price;

        const qty = Math.max(1, Math.floor(MAX_TRADE_VALUE/ltp));

        await kite.placeOrder("regular",{
          exchange:EXCHANGE,
          tradingsymbol:SYMBOL,
          transaction_type:"BUY",
          quantity:qty,
          product:PRODUCT,
          order_type:"MARKET"
        });

        position = {symbol:SYMBOL, entry:ltp, qty};
        console.log("BUY", SYMBOL, "score:", score);
        break;
      }
    }
  }catch(e){
    console.log("Entry loop error:", e.message);
  }
},10000);

// EXIT LOOP
setInterval(async ()=>{
  if(!position || !access_token) return;

  try{
    const ltpData = await kite.getLTP([`NSE:${position.symbol}`]);
    const ltp = ltpData[`NSE:${position.symbol}`].last_price;

    const pnlPct = (ltp - position.entry) / position.entry;

    if(pnlPct<=-SL || pnlPct>=TP){
      await kite.placeOrder("regular",{
        exchange:"NSE",
        tradingsymbol:position.symbol,
        transaction_type:"SELL",
        quantity:position.qty,
        product:"MIS",
        order_type:"MARKET"
      });

      console.log("EXIT", position.symbol);
      position = null;
    }
  }catch(e){
    console.log("Exit loop error:", e.message);
  }
},5000);

// AUTO STOP @ 3:15
setInterval(async ()=>{
  const now = new Date();
  if(now.getHours()===15 && now.getMinutes()===15){
    if(position){
      try{
        await kite.placeOrder("regular",{
          exchange:"NSE",
          tradingsymbol:position.symbol,
          transaction_type:"SELL",
          quantity:position.qty,
          product:"MIS",
          order_type:"MARKET"
        });
      }catch{}
      position = null;
    }
    BOT_ACTIVE = false;
    console.log("AUTO STOP 3:15");
  }
},60000);

// ROOT
app.get("/",(req,res)=>res.sendFile(path.join(__dirname,"public/index.html")));

const PORT = process.env.PORT || 8080;
app.listen(PORT,()=>console.log("ULTIMATE AI PATCH RUNNING"));
