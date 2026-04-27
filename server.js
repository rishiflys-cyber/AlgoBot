
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const axios = require('axios');
const KiteConnect = require("kiteconnect").KiteConnect;

const app = express();
const PORT = process.env.PORT || 3000;

const LIVE = process.env.LIVE_TRADING === "true";
const TOKEN_FILE = "access_token.json";

let kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });
let accessToken = null;

let state = {
  capital: 0,
  pnl: 0,
  peakCapital: 0,
  serverIP: null,
  rankedSignals: [],
  activeTrades: [],
  closedTrades: [],
  mode: LIVE ? "LIVE" : "PAPER",
  regime: "UNKNOWN"
};

if (fs.existsSync(TOKEN_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(TOKEN_FILE));
    accessToken = saved.token;
    kite.setAccessToken(accessToken);
  } catch {}
}

app.get('/login',(req,res)=>res.redirect(kite.getLoginURL()));

app.get('/redirect', async(req,res)=>{
  try{
    const session = await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
    accessToken = session.access_token;
    kite.setAccessToken(accessToken);
    fs.writeFileSync(TOKEN_FILE, JSON.stringify({token:accessToken}));

    const ip = await axios.get("https://api.ipify.org?format=json");
    state.serverIP = ip.data.ip;

    res.send("Login success | IP: " + ip.data.ip);
  }catch{
    res.send("Login failed");
  }
});

async function updateCapital(){
  try{
    const m = await kite.getMargins();
    state.capital = m?.equity?.available?.cash || 0;
    if(state.capital > state.peakCapital) state.peakCapital = state.capital;
  }catch{}
}

const universe = ["NSE:RELIANCE","NSE:TCS","NSE:INFY","NSE:HDFCBANK","NSE:ICICIBANK"];

function score(q){
  return (q.last_price - q.ohlc.open)/q.ohlc.open;
}

setInterval(async()=>{
  try{
    if(!accessToken) return;

    await updateCapital();
    const quotes = await kite.getQuote(universe);

    let signals=[];
    for(const s of universe){
      const q=quotes[s];
      if(!q) continue;
      signals.push({symbol:s,price:q.last_price,score:score(q)});
    }

    signals.sort((a,b)=>b.score-a.score);
    state.rankedSignals=signals.slice(0,3);

  }catch{}
},3000);

// API
app.get('/performance',(req,res)=>res.json(state));

// AUTO REFRESH PAGE
app.get('/',(req,res)=>{
  res.send(`
  <html>
  <head>
    <title>AlgoBot Live</title>
    <script>
      async function load(){
        const res = await fetch('/performance');
        const data = await res.json();
        document.getElementById('data').innerText = JSON.stringify(data,null,2);
      }
      setInterval(load,2000);
      window.onload=load;
    </script>
  </head>
  <body style="background:black;color:#0f0;font-family:monospace">
    <h2>AlgoBot Live (Auto Refresh)</h2>
    <pre id="data"></pre>
  </body>
  </html>
  `);
});

app.listen(PORT,()=>console.log("V41 RUNNING"));
