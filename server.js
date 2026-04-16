
require("dotenv").config();
const express = require("express");
const path = require("path");
const { KiteConnect } = require("kiteconnect");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let access_token=null, BOT_ACTIVE=false, tradesToday=0;
let position=null, entryPrice=0, pnl=0, capital=0;

let lossStreak=0, lastPrice=null;

// ===== ADVANCED CONFIG (v8.5) =====
const CONFIG = {
  MAX_TRADES:2,
  SL:0.01,
  TP:0.02,
  TRAIL:0.005,
  PRICE_JUMP:0.002,
  VOL_FILTER:0.0015,
  TIME_START:9,
  TIME_END:15,
  LOSS_STREAK_LIMIT:3,
  DAILY_LOSS_LIMIT:0.02
};

// ===== LOGIN =====
app.get("/login",(req,res)=>res.redirect(kite.getLoginURL()));
app.get("/redirect", async (req,res)=>{
 try{
  const s=await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
  access_token=s.access_token;
  kite.setAccessToken(access_token);
  const m=await kite.getMargins();
  capital=m?.equity?.net||0;
  res.send("Login Success ✅");
 }catch{res.send("Login Failed")}
});

// ===== CONTROL =====
app.get("/start",(req,res)=>{BOT_ACTIVE=true;res.send("STARTED")});
app.get("/kill",(req,res)=>{BOT_ACTIVE=false;res.send("STOPPED")});

// ===== DASHBOARD =====
app.get("/dashboard", async (req,res)=>{
 try{
  if(access_token){
    const m=await kite.getMargins();
    capital=m?.equity?.net||0;
  }
 }catch{}
 res.json({capital,BOT_ACTIVE,position,tradesToday,pnl,lossStreak});
});

// ===== PRICE =====
async function getPrice(){
 try{
  const q=await kite.getLTP(["NSE:RELIANCE"]);
  return q["NSE:RELIANCE"].last_price;
 }catch{return null;}
}

// ===== SIGNAL (improved) =====
function getSignal(price){
 if(!lastPrice) return null;
 let change=(price-lastPrice)/lastPrice;

 if(Math.abs(change) < CONFIG.VOL_FILTER) return null;

 if(change > CONFIG.PRICE_JUMP) return "BUY";
 if(change < -CONFIG.PRICE_JUMP) return "SELL";
 return null;
}

// ===== LOOP =====
setInterval(async ()=>{
 if(!BOT_ACTIVE || !access_token) return;

 const hour = new Date().getHours();
 if(hour < CONFIG.TIME_START || hour > CONFIG.TIME_END) return;

 if(tradesToday >= CONFIG.MAX_TRADES) return;
 if(lossStreak >= CONFIG.LOSS_STREAK_LIMIT) return;

 const price = await getPrice();
 if(!price) return;

 // manage open trade
 if(position){
   let exit=false;

   if(position==="BUY"){
     if(price <= entryPrice*(1-CONFIG.SL)) { pnl -= entryPrice*CONFIG.SL; lossStreak++; exit=true; }
     if(price >= entryPrice*(1+CONFIG.TP)) { pnl += entryPrice*CONFIG.TP; lossStreak=0; exit=true; }
   }

   if(exit){
     position=null;
   }
   return;
 }

 const signal = getSignal(price);
 lastPrice = price;
 if(!signal) return;

 try{
  await kite.placeOrder("regular",{
   exchange:"NSE",
   tradingsymbol:"RELIANCE",
   transaction_type:signal,
   quantity:1,
   product:"MIS",
   order_type:"MARKET"
  });

  position=signal;
  entryPrice=price;
  tradesToday++;

 }catch{}

},3000);

// RESET
setInterval(()=>{tradesToday=0;pnl=0;lossStreak=0},86400000);

// PORT
const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log("8.5 BOT RUNNING",PORT));
