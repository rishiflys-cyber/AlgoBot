// FINAL UNIFIED SERVER — STABLE CORE + ONE-PAGE CONTROL PANEL (ROOT)
// Features:
// - Login (Zerodha Kite)
// - IP display on login + root
// - Start / Kill controls
// - Live capital (margins)
// - Engine loop fetching live quotes
// - Unified root UI showing: IP, capital, status, heartbeat, stocks, trades, pnl, alerts
// - /dashboard and /performance JSON endpoints

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

// ===== STOCK UNIVERSE (edit as needed) =====
const STOCKS = [
  "RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK",
  "SBIN","LT","ITC","AXISBANK","KOTAKBANK"
];

// ===== HELPERS =====
function getIP(req){
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || "")
    .toString()
    .split(",")[0]
    .trim();
}

function getLocalIP(){
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return "0.0.0.0";
}

async function getCapital(){
  try{
    const m = await kite.getMargins("equity");
    return m?.available?.cash || 0;
  }catch(e){
    return capital;
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

    const ip = getIP(req);
    res.send(`
      <h2>Login Success</h2>
      <p><b>IP:</b> ${ip}</p>
      <p><b>Local IP:</b> ${getLocalIP()}</p>
      <p><b>Capital:</b> ${capital}</p>
      <a href="/">Go to Control Panel</a>
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

// ===== ENGINE LOOP =====
setInterval(async ()=>{
  if(!engineRunning || !access_token) return;

  try{
    lastHeartbeat = Date.now();
    capital = await getCapital();

    const quotes = await kite.getQuote(STOCKS.map(s=>"NSE:"+s));

    for(let s of STOCKS){
      marketData[s] = {
        price: quotes["NSE:"+s]?.last_price || 0,
        change: quotes["NSE:"+s]?.net_change || 0,
        ts: Date.now()
      };
    }

  }catch(e){
    console.log("ENGINE ERROR:", e.message);
  }

}, 3000);

// ===== UNIFIED ROOT (ONE PAGE) =====
app.get("/", async (req,res)=>{
  const ip = getIP(req);

  let capitalLive = capital;
  try{
    capitalLive = await getCapital();
  }catch(e){}

  res.send(`
    <h2>🚀 AlgoBot Control Panel</h2>

    <p><b>IP:</b> ${ip}</p>
    <p><b>Capital:</b> ${capitalLive}</p>
    <p><b>Status:</b> ${engineRunning ? "RUNNING" : "STOPPED"}</p>
    <p><b>Heartbeat:</b> ${lastHeartbeat || "N/A"}</p>

    <hr/>

    <a href="/login">🔐 Login</a><br/>
    <a href="/start">▶ Start</a><br/>
    <a href="/kill">⛔ Kill</a><br/>

    <hr/>

    <h3>📊 Stocks</h3>
    <pre>${JSON.stringify(marketData, null, 2)}</pre>

    <hr/>

    <h3>📈 Trades</h3>
    <pre>${JSON.stringify(activeTrades, null, 2)}</pre>

    <hr/>

    <h3>📉 PnL</h3>
    <pre>${JSON.stringify({pnl, peakPnL}, null, 2)}</pre>

    <hr/>

    <h3>⚠ Alerts</h3>
    <pre>${JSON.stringify(alerts, null, 2)}</pre>

    <hr/>
    <a href="/dashboard">JSON Dashboard</a> | <a href="/performance">JSON Performance</a>
  `);
});

// ===== JSON ENDPOINTS =====
app.get("/dashboard", (req,res)=>{
  res.json({
    system:{
      running: engineRunning,
      heartbeat: lastHeartbeat,
      capital
    },
    stocks: marketData,
    trades: activeTrades,
    pnl: {pnl, peakPnL},
    alerts
  });
});

app.get("/performance", (req,res)=>{
  res.json({
    system:{
      running: engineRunning,
      heartbeat: lastHeartbeat,
      capital
    },
    stocks: marketData,
    trades: activeTrades,
    pnl: {pnl, peakPnL},
    alerts
  });
});

// ===== START =====
app.listen(process.env.PORT || 3000, ()=>{
  console.log("Server started");
});
