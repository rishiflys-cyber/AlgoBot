
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
let lastTradeTime = null;

console.log("🚀 REAL TRADING BOT LIVE");

// LOGIN
app.get("/login",(req,res)=>res.redirect(kite.getLoginURL()));

app.get("/redirect", async (req,res)=>{
 try{
  const session = await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
  access_token = session.access_token;
  kite.setAccessToken(access_token);
  res.send("Login Success ✅");
 }catch(e){
  res.send("Login Failed ❌");
 }
});

// CONTROL
app.get("/start",(req,res)=>{BOT_ACTIVE=true;res.send("STARTED")});
app.get("/kill",(req,res)=>{BOT_ACTIVE=false;res.send("STOPPED")});

// DASHBOARD
app.get("/dashboard",(req,res)=>{
 res.json({BOT_ACTIVE,position,tradesToday});
});

// SIMPLE REAL LOGIC
async function getPrice(){
 try{
  const q = await kite.getLTP(["NSE:RELIANCE"]);
  return q["NSE:RELIANCE"].last_price;
 }catch{
  return null;
 }
}

function getSignal(price, prev){
 if(!prev) return null;
 if(price > prev * 1.002) return "BUY";
 if(price < prev * 0.998) return "SELL";
 return null;
}

let lastPrice = null;

// BOT LOOP
setInterval(async ()=>{
 if(!BOT_ACTIVE || !access_token) return;
 if(tradesToday >= 2) return;

 const price = await getPrice();
 if(!price) return;

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
  tradesToday++;
  lastTradeTime = new Date();

  console.log("TRADE EXECUTED:", signal, price);

 }catch(e){
  console.log("Order failed");
 }

},5000);

// RESET DAILY
setInterval(()=>{
 tradesToday = 0;
},86400000);

// PORT FIX
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log("Server running on", PORT));
