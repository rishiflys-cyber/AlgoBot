// FINAL UNIFIED SERVER — CAPITAL FIX APPLIED

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

let marketData = {};
let activeTrades = [];
let pnl = 0;
let peakPnL = 0;
let alerts = [];

const STOCKS = [
  "RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK",
  "SBIN","LT","ITC","AXISBANK","KOTAKBANK"
];

function getIP(req){
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || "")
    .toString().split(",")[0].trim();
}

// ===== CAPITAL FIX =====
async function getCapital(){
  try{
    const m = await kite.getMargins();

    console.log("FULL MARGINS:", JSON.stringify(m, null, 2));

    return (
      m?.equity?.available?.cash ||
      m?.equity?.net ||
      m?.equity?.available?.live_balance ||
      m?.commodity?.available?.cash ||
      0
    );
  }catch(e){
    console.log("CAPITAL ERROR:", e.message);
    return 0;
  }
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

    capital = await getCapital();

    res.send(`<h2>Login Success</h2><p>IP: ${getIP(req)}</p><a href="/">Go Home</a>`);
  }catch(e){
    res.send("Login Failed: " + e.message);
  }
});

// ===== CONTROL =====
app.get("/start",(req,res)=>{
  if(!access_token) return res.send("Login first");
  engineRunning = true;
  res.send("STARTED");
});

app.get("/kill",(req,res)=>{
  engineRunning = false;
  res.send("STOPPED");
});

// ===== ENGINE =====
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

// ===== ROOT =====
app.get("/", async (req,res)=>{

  let cap = await getCapital();

  res.send(`
    <h2>AlgoBot Control Panel</h2>
    <p>IP: ${getIP(req)}</p>
    <p>Capital: ${cap}</p>
    <p>Status: ${engineRunning ? "RUNNING":"STOPPED"}</p>
    <p>Heartbeat: ${lastHeartbeat || "N/A"}</p>

    <a href="/login">Login</a><br/>
    <a href="/start">Start</a><br/>
    <a href="/kill">Kill</a><br/>

    <hr/>
    <pre>${JSON.stringify(marketData,null,2)}</pre>
  `);
});

app.listen(process.env.PORT || 3000);
