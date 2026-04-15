
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

let trades = [];
let position = null;

const SYMBOL = "RELIANCE";
const EXCHANGE = "NSE";
const PRODUCT = "MIS";

const MAX_TRADE_VALUE = 500; // SAFE START
const SL = 0.02;
const TP = 0.03;

// LOGIN
app.get("/login", (req,res)=> res.redirect(kite.getLoginURL()));

app.get("/redirect", async (req,res)=>{
  try {
    const session = await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
    access_token = session.access_token;
    kite.setAccessToken(access_token);
    res.send("Login Success ✅ REAL MODE");
  } catch(e){
    res.send("Login Failed ❌");
  }
});

// CONTROL
app.get("/start",(req,res)=>{ BOT_ACTIVE=true; res.send("🚀 BOT STARTED"); });
app.get("/kill",(req,res)=>{ BOT_ACTIVE=false; res.send("🛑 BOT STOPPED"); });

// DASHBOARD (REAL DATA)
app.get("/dashboard", async (req,res)=>{
  try{
    const margins = await kite.getMargins();
    const capital = margins.equity.available.cash;

    res.json({
      capital,
      trades,
      position
    });
  }catch(e){
    res.json({error:"Not logged in"});
  }
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

// LOOP
setInterval(async ()=>{
  if(!BOT_ACTIVE || !access_token) return;

  try{
    const to = new Date();
    const from = new Date(Date.now()-50*5*60*1000);

    const candles = await kite.getHistoricalData(
      `${EXCHANGE}:${SYMBOL}`,
      "5minute",
      from,
      to
    );

    const prices = candles.map(c=>c.close);
    if(prices.length < 30) return;

    const e9 = ema(prices,9);
    const e21 = ema(prices,21);

    const crossUp = e9.at(-1)>e21.at(-1) && e9.at(-2)<=e21.at(-2);
    const crossDown = e9.at(-1)<e21.at(-1) && e9.at(-2)>=e21.at(-2);

    const ltpData = await kite.getLTP([`NSE:${SYMBOL}`]);
    const ltp = ltpData[`NSE:${SYMBOL}`].last_price;

    const qty = Math.max(1, Math.floor(MAX_TRADE_VALUE/ltp));

    // BUY
    if(!position && crossUp){
      await kite.placeOrder("regular",{
        exchange:EXCHANGE,
        tradingsymbol:SYMBOL,
        transaction_type:"BUY",
        quantity:qty,
        product:PRODUCT,
        order_type:"MARKET"
      });

      position = {entry: ltp, qty};
      trades.push({type:"BUY", price:ltp});
      console.log("BUY REAL", ltp);
    }

    // SELL
    if(position){
      const pnlPct = (ltp-position.entry)/position.entry;

      if(pnlPct<=-SL || pnlPct>=TP || crossDown){
        await kite.placeOrder("regular",{
          exchange:EXCHANGE,
          tradingsymbol:SYMBOL,
          transaction_type:"SELL",
          quantity:position.qty,
          product:PRODUCT,
          order_type:"MARKET"
        });

        trades.push({type:"SELL", price:ltp});
        console.log("SELL REAL", ltp);

        position = null;
      }
    }

  }catch(e){
    console.log("ERROR:", e.message);
  }

},10000);

app.get("/",(req,res)=>res.sendFile(path.join(__dirname,"public/index.html")));

app.listen(8080,()=>console.log("REAL MONEY BOT RUNNING"));
