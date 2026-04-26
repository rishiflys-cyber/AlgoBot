// CLEAN STABLE CORE — REAL MARKET + CAPITAL + DASHBOARD (PRODUCTION BASE)

require("dotenv").config();
const express = require("express");
const { KiteConnect } = require("kiteconnect");

const app = express();
const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

// ===== CORE STATE =====
let access_token = null;
let engineRunning = false;
let capital = 0;
let lastHeartbeat = null;

// ===== STOCK LIST (STABLE START) =====
const STOCKS = [
  "RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK",
  "SBIN","LT","ITC","AXISBANK","KOTAKBANK"
];

// ===== LOGIN =====
app.get("/login", (req,res)=>{
  res.redirect(kite.getLoginURL());
});

app.get("/redirect", async (req,res)=>{
  try{
    const session = await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
    access_token = session.access_token;
    kite.setAccessToken(access_token);

    const m = await kite.getMargins("equity");
    capital = m?.available?.cash || 0;

    res.send(`<h2>Login Success</h2><p>Capital: ${capital}</p>`);
  }catch(e){
    res.send("Login Failed: " + e.message);
  }
});

// ===== CONTROL =====
app.get("/start",(req,res)=>{
  if(!access_token) return res.send("Login first");
  engineRunning = true;
  res.send("ENGINE STARTED");
});

app.get("/kill",(req,res)=>{
  engineRunning = false;
  res.send("ENGINE STOPPED");
});

// ===== CAPITAL =====
async function getCapital(){
  try{
    const m = await kite.getMargins("equity");
    return m?.available?.cash || capital;
  }catch(e){
    return capital;
  }
}

// ===== ENGINE LOOP =====
let marketData = {};

setInterval(async ()=>{
  if(!engineRunning || !access_token) return;

  try{
    lastHeartbeat = Date.now();
    capital = await getCapital();

    const quotes = await kite.getQuote(STOCKS.map(s=>"NSE:"+s));

    for(let s of STOCKS){
      marketData[s] = {
        price: quotes["NSE:"+s]?.last_price || 0,
        change: quotes["NSE:"+s]?.net_change || 0
      };
    }

  }catch(e){
    console.log("ENGINE ERROR:", e.message);
  }

},3000);

// ===== DASHBOARD =====
app.get("/dashboard", (req,res)=>{

  res.json({
    system:{
      running: engineRunning,
      heartbeat: lastHeartbeat,
      capital
    },
    stocks: marketData
  });

});

// ===== ROOT =====
app.get("/", (req,res)=>{
  res.send(`
    <h2>AlgoBot Stable Core</h2>
    <a href="/login">Login</a><br/>
    <a href="/start">Start</a><br/>
    <a href="/kill">Kill</a><br/>
    <a href="/dashboard">Dashboard</a>
  `);
});

// ===== START SERVER =====
app.listen(process.env.PORT || 3000);
