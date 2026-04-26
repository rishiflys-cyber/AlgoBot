// FINAL SYSTEM V3 — REAL MARKET DATA + REAL SIGNAL ENGINE (NO MOCK)

// ===== IMPORTS =====
require("dotenv").config();
const express = require("express");
const os = require("os");
const { KiteConnect } = require("kiteconnect");

const app = express();
const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

// ===== CORE =====
let access_token=null, engineRunning=false, lastHeartbeat=Date.now();
let capital=0;

// ===== REAL STOCK LIST (TOP NSE LIQUID) =====
const STOCKS = [
"RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK","SBIN","LT","ITC","AXISBANK","KOTAKBANK",
"BAJFINANCE","MARUTI","HINDUNILVR","ASIANPAINT","TITAN","WIPRO","ULTRACEMCO","NTPC","POWERGRID","ONGC"
];

// ===== LOGIN =====
app.get("/login",(req,res)=> res.redirect(kite.getLoginURL()));

app.get("/redirect", async (req,res)=>{
 const session=await kite.generateSession(req.query.request_token,process.env.KITE_API_SECRET);
 access_token=session.access_token;
 kite.setAccessToken(access_token);

 const margins = await kite.getMargins("equity");
 capital = margins?.available?.cash || 0;

 res.send(`<h2>Login Success</h2><p>Capital: ${capital}</p>`);
});

// ===== CONTROL =====
app.get("/start",(req,res)=>{
 engineRunning=true;
 res.send("BOT STARTED");
});

app.get("/kill",(req,res)=>{
 engineRunning=false;
 res.send("BOT STOPPED");
});

// ===== CAPITAL =====
async function getCapital(){
 try{
  const m = await kite.getMargins("equity");
  return m?.available?.cash || capital;
 }catch(e){ return capital; }
}

// ===== REAL SIGNAL ENGINE =====
function calculateSignal(history){
 if(history.length < 3) return "NONE";

 let up=0;
 for(let i=1;i<history.length;i++){
  if(history[i]>history[i-1]) up++;
 }

 let prob = up/history.length;

 if(prob > 0.6) return "BUY";
 if(prob < 0.4) return "SELL";
 return "NONE";
}

// ===== HISTORY STORE =====
let historyStore={};

// ===== LOOP =====
setInterval(async ()=>{
 if(!engineRunning || !access_token) return;

 lastHeartbeat=Date.now();
 capital = await getCapital();

 try{
  const quotes = await kite.getQuote(STOCKS.map(s=>"NSE:"+s));

  for(let s of STOCKS){
   let price = quotes["NSE:"+s]?.last_price;

   if(!price) continue;

   historyStore[s] = historyStore[s] || [];
   historyStore[s].push(price);

   if(historyStore[s].length > 5) historyStore[s].shift();
  }

 }catch(e){
  console.log("DATA ERROR", e.message);
 }

},3000);

// ===== DASHBOARD =====
app.get("/dashboard", async (req,res)=>{

 const quotes = await kite.getQuote(STOCKS.map(s=>"NSE:"+s));

 let data = STOCKS.map(s=>{
   let price = quotes["NSE:"+s]?.last_price || 0;
   let hist = historyStore[s] || [];
   let signal = calculateSignal(hist);

   return {
     symbol:s,
     price,
     signal,
     trend: hist.length ? hist[hist.length-1] - hist[0] : 0
   };
 });

 res.json({
  system:{
    alive:engineRunning,
    capital,
    heartbeat:lastHeartbeat
  },
  stocks:data
 });

});

// ===== ROOT =====
app.get("/", (req,res)=>{
 res.send("<h2>AlgoBot V3</h2><a href='/login'>Login</a><br><a href='/start'>Start</a><br><a href='/kill'>Kill</a><br><a href='/dashboard'>Dashboard</a>");
});

// ===== START =====
app.listen(process.env.PORT || 3000);
