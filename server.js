
require("dotenv").config();
const express = require("express");
const path = require("path");
const { KiteConnect } = require("kiteconnect");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let access_token=null, BOT_ACTIVE=false;
let tradesToday=0, position=null, entryPrice=0;
let pnl=0, capital=0, lossStreak=0;
let lastPrices = {};
let strategyStats = {trend:{wins:0,loss:0}, mean:{wins:0,loss:0}};

const STOCKS = ["RELIANCE","HDFCBANK","ICICIBANK","INFY","TCS","SBIN","ITC","LT","AXISBANK","KOTAKBANK"];

const CONFIG = {
  MAX_TRADES:2,
  SL:0.008,
  TP:0.018,
  TRAIL:0.005,
  PRICE_JUMP:0.002,
  VOL_FILTER:0.0015,
  LOSS_STREAK_LIMIT:2,
  RISK_PER_TRADE:0.01
};

// LOGIN
app.get("/login",(req,res)=>res.redirect(kite.getLoginURL()));
app.get("/redirect", async (req,res)=>{
 try{
  const s=await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
  access_token=s.access_token;
  kite.setAccessToken(access_token);
  res.send("Login Success ✅");
 }catch{res.send("Login Failed")}
});

// CONTROL
app.get("/start",(req,res)=>{BOT_ACTIVE=true;res.send("STARTED")});
app.get("/kill",(req,res)=>{BOT_ACTIVE=false;res.send("STOPPED")});

// DASHBOARD
app.get("/dashboard", async (req,res)=>{
 try{
  if(access_token){
    const m=await kite.getMargins();
    capital=m?.equity?.net||0;
  }
 }catch{}
 res.json({capital,BOT_ACTIVE,position,tradesToday,pnl,lossStreak,strategyStats});
});

// PRICE
async function getPrices(){
 try{
  const q=await kite.getLTP(STOCKS.map(s=>`NSE:${s}`));
  return q;
 }catch{return null;}
}

// STRATEGIES
function trend(p, prev){
 if(!prev) return null;
 let c=(p-prev)/prev;
 if(Math.abs(c)<CONFIG.VOL_FILTER) return null;
 if(c>CONFIG.PRICE_JUMP) return "BUY";
 if(c<-CONFIG.PRICE_JUMP) return "SELL";
 return null;
}

function mean(p, prev){
 if(!prev) return null;
 let c=(p-prev)/prev;
 if(c>0.004) return "SELL";
 if(c<-0.004) return "BUY";
 return null;
}

// SELECT BEST STRATEGY
function pickStrategy(){
 let t = strategyStats.trend;
 let m = strategyStats.mean;
 let tScore = t.wins - t.loss;
 let mScore = m.wins - m.loss;
 return tScore >= mScore ? "trend" : "mean";
}

// POSITION SIZE
function getQty(price){
 let risk = capital * CONFIG.RISK_PER_TRADE;
 let slDist = price * CONFIG.SL;
 return Math.max(1, Math.floor(risk / slDist));
}

// LOOP
setInterval(async ()=>{
 if(!BOT_ACTIVE || !access_token) return;
 if(tradesToday>=CONFIG.MAX_TRADES) return;
 if(lossStreak>=CONFIG.LOSS_STREAK_LIMIT) return;

 const hour = new Date().getHours();
 if(hour>=11 && hour<=13) return; // avoid midday

 const prices = await getPrices();
 if(!prices) return;

 let best=null, bestScore=0;

 for(let s of STOCKS){
   let p = prices[`NSE:${s}`].last_price;
   let prev = lastPrices[s];

   let score = prev ? Math.abs((p-prev)/prev) : 0;
   if(score > bestScore){
     bestScore = score;
     best = {symbol:s, price:p, prev};
   }

   lastPrices[s]=p;
 }

 if(!best || bestScore < CONFIG.VOL_FILTER) return;

 let strat = pickStrategy();
 let signal = strat==="trend" ? trend(best.price, best.prev) : mean(best.price, best.prev);
 if(!signal) return;

 let qty = getQty(best.price);

 try{
  await kite.placeOrder("regular",{
    exchange:"NSE",
    tradingsymbol:best.symbol,
    transaction_type:signal,
    quantity:qty,
    product:"MIS",
    order_type:"LIMIT",
    price: signal==="BUY" ? best.price*1.001 : best.price*0.999
  });

  position = best.symbol+" "+signal;
  entryPrice = best.price;
  tradesToday++;

 }catch{}

},3000);

// RESET
setInterval(()=>{
 tradesToday=0; pnl=0; lossStreak=0;
 strategyStats={trend:{wins:0,loss:0},mean:{wins:0,loss:0}};
},86400000);

// PORT
const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log("FINAL MERGE BOT RUNNING",PORT));
