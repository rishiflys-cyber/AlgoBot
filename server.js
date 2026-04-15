
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
let trades = [];

const SYMBOL = "RELIANCE";
const EXCHANGE = "NSE";
const PRODUCT = "MIS";

const MAX_TRADE_VALUE = 500;
const SL = 0.02;
const TP = 0.03;

// LOGIN
app.get("/login", (req,res)=> res.redirect(kite.getLoginURL()));

app.get("/redirect", async (req,res)=>{
  try {
    const session = await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
    access_token = session.access_token;
    kite.setAccessToken(access_token);
    res.send("Login Success ✅");
  } catch {
    res.send("Login Failed ❌");
  }
});

// MANUAL CONTROL
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

// AUTO START 9:20
setInterval(()=>{
  const now = new Date();
  if(now.getHours()===9 && now.getMinutes()===20){
    BOT_ACTIVE = true;
    console.log("AUTO STARTED");
  }
},60000);

// TRADING LOOP
setInterval(async ()=>{
  if(!BOT_ACTIVE || !access_token) return;

  const now = new Date();
  const hr = now.getHours();
  const min = now.getMinutes();

  if(hr===9 && min<20) return;
  if(hr===14 && min>=45) return;

  try{
    const to = new Date();
    const from = new Date(Date.now()-50*5*60*1000);

    const candles = await kite.getHistoricalData(`${EXCHANGE}:${SYMBOL}`,"5minute",from,to);
    const prices = candles.map(c=>c.close);
    if(prices.length < 30) return;

    const e9 = ema(prices,9);
    const e21 = ema(prices,21);

    const crossUp = e9.at(-1)>e21.at(-1) && e9.at(-2)<=e21.at(-2);
    const crossDown = e9.at(-1)<e21.at(-1) && e9.at(-2)>=e21.at(-2);

    const ltpData = await kite.getLTP([`${EXCHANGE}:${SYMBOL}`]);
    const ltp = ltpData[`${EXCHANGE}:${SYMBOL}`].last_price;

    const qty = Math.max(1, Math.floor(MAX_TRADE_VALUE/ltp));

    if(!position && crossUp){
      await kite.placeOrder("regular",{exchange:EXCHANGE,tradingsymbol:SYMBOL,transaction_type:"BUY",quantity:qty,product:PRODUCT,order_type:"MARKET"});
      position = {entry:ltp, qty};
    }

    if(position){
      const pnlPct = (ltp-position.entry)/position.entry;
      if(pnlPct<=-SL || pnlPct>=TP || crossDown){
        await kite.placeOrder("regular",{exchange:EXCHANGE,tradingsymbol:SYMBOL,transaction_type:"SELL",quantity:position.qty,product:PRODUCT,order_type:"MARKET"});
        position = null;
      }
    }

  }catch(e){}
},10000);

// AUTO STOP 3:15
setInterval(async ()=>{
  const now = new Date();
  if(now.getHours()===15 && now.getMinutes()===15){
    if(position){
      try{
        await kite.placeOrder("regular",{exchange:EXCHANGE,tradingsymbol:SYMBOL,transaction_type:"SELL",quantity:position.qty,product:PRODUCT,order_type:"MARKET"});
      }catch{}
      position=null;
    }
    BOT_ACTIVE=false;
    console.log("AUTO STOP");
  }
},60000);

app.get("/",(req,res)=>res.sendFile(path.join(__dirname,"public/index.html")));

app.listen(process.env.PORT||8080,()=>console.log("FULL AUTO BOT RUNNING"));
