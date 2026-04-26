// STABLE CORE FIX V2 — IP + DASHBOARD + PERFORMANCE FIXED

require("dotenv").config();
const express = require("express");
const os = require("os");
const { KiteConnect } = require("kiteconnect");

const app = express();
const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

// ===== STATE =====
let access_token = null;
let engineRunning = false;
let capital = 0;
let lastHeartbeat = null;

// ===== STOCKS =====
const STOCKS = ["RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK"];

// ===== GET PUBLIC IP =====
function getIP(req){
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || "")
    .toString()
    .split(",")[0]
    .trim();
}

// ===== LOGIN =====
app.get("/login", (req,res)=>{
  res.redirect(kite.getLoginURL());
});

app.get("/redirect", async (req,res)=>{
  try{
    const session = await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
    access_token = session.access_token;
    kite.setAccessToken(access_token);

    const ip = getIP(req);

    res.send(`
      <h2>Login Success</h2>
      <p><b>IP:</b> ${ip}</p>
      <a href="/dashboard">Go to Dashboard</a>
    `);

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

// ===== ENGINE =====
let marketData = {};

setInterval(async ()=>{
  if(!engineRunning || !access_token) return;

  try{
    lastHeartbeat = Date.now();

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
      heartbeat: lastHeartbeat
    },
    stocks: marketData
  });
});

// ===== PERFORMANCE (FIXED ROUTE) =====
app.get("/performance", (req,res)=>{
  res.json({
    system:{
      running: engineRunning,
      heartbeat: lastHeartbeat
    },
    stocks: marketData
  });
});

// ===== ROOT =====
app.get("/", (req,res)=>{
  res.send(`
    <h2>AlgoBot Fixed</h2>
    <a href="/login">Login</a><br/>
    <a href="/start">Start</a><br/>
    <a href="/kill">Kill</a><br/>
    <a href="/dashboard">Dashboard</a><br/>
    <a href="/performance">Performance</a>
  `);
});

// ===== START =====
app.listen(process.env.PORT || 3000);
