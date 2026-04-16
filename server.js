
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
let tradesToday = 0;
let capital = 0;
let entryPrice = 0;
let pnl = 0;

const SL_PERCENT = 0.01;
const TP_PERCENT = 0.02;

console.log("🚀 FULL UPGRADE BOT");

// LOGIN
app.get("/login",(req,res)=>res.redirect(kite.getLoginURL()));

app.get("/redirect", async (req,res)=>{
 try{
  const session = await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
  access_token = session.access_token;
  kite.setAccessToken(access_token);

  const m = await kite.getMargins();
  capital = m?.equity?.net || 0;

  res.send("Login Success ✅");
 }catch{
  res.send("Login Failed ❌");
 }
});

// CONTROL
app.get("/start",(req,res)=>{BOT_ACTIVE=true;res.send("STARTED")});
app.get("/kill",(req,res)=>{BOT_ACTIVE=false;res.send("STOPPED")});

// DASHBOARD
app.get("/dashboard",(req,res)=>{
 res.json({capital,BOT_ACTIVE,position,tradesToday,pnl});
});

// PRICE
async function getPrice(){
 try{
  const q = await kite.getLTP(["NSE:RELIANCE"]);
  return q["NSE:RELIANCE"].last_price;
 }catch{
  return null;
 }
}

// SMART SIGNAL
function getSignal(price, prev){
 if(!prev) return null;
 if(price > prev * 1.003) return "BUY";
 if(price < prev * 0.997) return "SELL";
 return null;
}

let lastPrice = null;

// BOT LOOP
setInterval(async ()=>{
 if(!BOT_ACTIVE || !access_token) return;
 if(tradesToday >= 2) return;

 const price = await getPrice();
 if(!price) return;

 // manage open position
 if(position){
   if(position === "BUY"){
     if(price <= entryPrice*(1-SL_PERCENT) || price >= entryPrice*(1+TP_PERCENT)){
       pnl += (price - entryPrice);
       position = null;
     }
   }
   return;
 }

 const signal = getSignal(price, lastPrice);
 lastPrice = price;

 if(!signal) return;

 try{
  await kite.placeOrder("regular",{
   exchange:"NSE",
   tradingsymbol:"RELIANCE",
   transaction_type: signal,
   quantity:1,
   product:"MIS",
   order_type:"MARKET"
  });

  position = signal;
  entryPrice = price;
  tradesToday++;

  console.log("TRADE:", signal, price);

 }catch(e){
  console.log("Order failed");
 }

},5000);

// RESET DAILY
setInterval(()=>{
 tradesToday = 0;
 pnl = 0;
},86400000);

// PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log("Server running on", PORT));
