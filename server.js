
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
let activeTrade = null;
let lastScan = [];
let lastPrice = {};
let lossStreak = 0;
let dailyPnL = 0;

const STOCKS = ["RELIANCE","HDFCBANK","ICICIBANK","INFY","TCS"];

function getIST(){
  const now = new Date();
  return new Date(now.toLocaleString("en-US",{timeZone:"Asia/Kolkata"}));
}
function mins(){
  const t = getIST();
  return t.getHours()*60 + t.getMinutes();
}

setInterval(()=>{
  const m = mins();
  if(m === 560) BOT_ACTIVE = true;
  if(m === 930) BOT_ACTIVE = false;
}, 60000);

app.get("/login",(req,res)=>res.redirect(kite.getLoginURL()));
app.get("/redirect", async (req,res)=>{
  try{
    const s = await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
    access_token = s.access_token;
    kite.setAccessToken(access_token);
    res.send("OK");
  }catch(e){
    res.send("Login Failed");
  }
});

app.get("/start",(req,res)=>{ BOT_ACTIVE = true; res.send("STARTED"); });
app.get("/kill",(req,res)=>{ BOT_ACTIVE = false; res.send("STOPPED"); });
app.get("/status",(req,res)=>res.json(lastScan));

function getMarketBias(prices){
  let sum = 0, count = 0;
  for(const s of STOCKS){
    const key = `NSE:${s}`;
    const p = prices[key]?.last_price;
    if(p && lastPrice[s]){
      sum += (p - lastPrice[s]) / lastPrice[s];
      count++;
    }
  }
  if(count === 0) return null;
  const avg = sum / count;
  if(avg > 0.0005) return "BULL";
  if(avg < -0.0005) return "BEAR";
  return "SIDEWAYS";
}

function getSignal(p, prev){
  if(!prev) return null;
  const change = (p - prev) / prev;
  if(Math.abs(change) < 0.0012) return null;
  if(change > 0) return "BUY";
  if(change < 0) return "SELL";
  return null;
}

setInterval(async ()=>{
  if(!BOT_ACTIVE || !access_token) return;

  if(lossStreak >= 3) return;
  if(dailyPnL <= -0.02) return;

  try{
    const prices = await kite.getLTP(STOCKS.map(s=>`NSE:${s}`));
    lastScan = [];

    const bias = getMarketBias(prices);

    let best = null, bestScore = 0;

    for(const s of STOCKS){
      const key = `NSE:${s}`;
      const p = prices[key].last_price;
      const prev = lastPrice[s];

      const signal = getSignal(p, prev);
      const score = prev ? Math.abs((p - prev) / prev) : 0;

      lastScan.push({symbol:s, price:p, signal, score, bias});

      if(signal && score > bestScore){
        bestScore = score;
        best = {symbol:s, price:p, signal};
      }

      lastPrice[s] = p;
    }

    if(activeTrade){
      const key = `NSE:${activeTrade.symbol}`;
      const p = prices[key].last_price;

      let pnl = 0;
      if(activeTrade.type === "BUY"){
        pnl = (p - activeTrade.entry) / activeTrade.entry;
        if(pnl >= 0.01 || pnl <= -0.005){
          await kite.placeOrder("regular",{
            exchange:"NSE",
            tradingsymbol:activeTrade.symbol,
            transaction_type:"SELL",
            quantity:1,
            product:"MIS",
            order_type:"MARKET"
          });
          dailyPnL += pnl;
          pnl < 0 ? lossStreak++ : lossStreak = 0;
          activeTrade = null;
        }
      } else {
        pnl = (activeTrade.entry - p) / activeTrade.entry;
        if(pnl >= 0.01 || pnl <= -0.005){
          await kite.placeOrder("regular",{
            exchange:"NSE",
            tradingsymbol:activeTrade.symbol,
            transaction_type:"BUY",
            quantity:1,
            product:"MIS",
            order_type:"MARKET"
          });
          dailyPnL += pnl;
          pnl < 0 ? lossStreak++ : lossStreak = 0;
          activeTrade = null;
        }
      }
      return;
    }

    if(best && bestScore > 0.0012){
      if(
        (bias === "BULL" && best.signal === "BUY") ||
        (bias === "BEAR" && best.signal === "SELL")
      ){
        await kite.placeOrder("regular",{
          exchange:"NSE",
          tradingsymbol:best.symbol,
          transaction_type:best.signal,
          quantity:1,
          product:"MIS",
          order_type:"MARKET"
        });

        activeTrade = {
          symbol: best.symbol,
          type: best.signal,
          entry: best.price
        };
      }
    }

  }catch(e){}

}, 3000);

app.get("/",(req,res)=>{
  res.sendFile(path.join(__dirname,"public/index.html"));
});

app.listen(process.env.PORT || 3000);
