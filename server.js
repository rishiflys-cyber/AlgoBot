
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

// ================= STATE =================
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

// ================= LOAD TOKEN =================
if (fs.existsSync(TOKEN_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(TOKEN_FILE));
    accessToken = saved.token;
    kite.setAccessToken(accessToken);
  } catch {}
}

// ================= LOGIN =================
app.get('/login', (req,res)=>res.redirect(kite.getLoginURL()));

app.get('/redirect', async (req,res)=>{
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

// ================= CAPITAL FIX =================
async function updateCapital(){
  try{
    const m = await kite.getMargins();
    const cash = m?.equity?.available?.cash;
    if(cash && cash > 0){
      state.capital = cash;
      if(state.capital > state.peakCapital) state.peakCapital = state.capital;
    }
  }catch{
    // fallback (important)
    if(state.capital === 0){
      state.capital = 100000; // default paper capital
      state.peakCapital = 100000;
    }
  }
}

// ================= NSE200 (sample expanded) =================
const universe = [
"NSE:RELIANCE","NSE:TCS","NSE:INFY","NSE:HDFCBANK","NSE:ICICIBANK",
"NSE:SBIN","NSE:AXISBANK","NSE:KOTAKBANK","NSE:ITC","NSE:LT",
"NSE:WIPRO","NSE:ULTRACEMCO","NSE:MARUTI","NSE:BAJFINANCE","NSE:ASIANPAINT",
"NSE:HCLTECH","NSE:TECHM","NSE:TITAN","NSE:ADANIENT","NSE:ADANIPORTS",
"NSE:ONGC","NSE:POWERGRID","NSE:NTPC","NSE:COALINDIA","NSE:BPCL",
"NSE:DIVISLAB","NSE:DRREDDY","NSE:CIPLA","NSE:SUNPHARMA","NSE:TATASTEEL",
"NSE:HINDALCO","NSE:JSWSTEEL","NSE:GRASIM","NSE:SHREECEM","NSE:AMBUJACEM"
];

// ================= BATCH QUOTES =================
async function getQuotes(symbols){
  let result = {};
  for(let i=0;i<symbols.length;i+=50){
    const batch = symbols.slice(i,i+50);
    try{
      const q = await kite.getQuote(batch);
      result = {...result,...q};
    }catch{}
  }
  return result;
}

// ================= SCORING =================
function score(q){
  const p = q.last_price;
  const o = q.ohlc.open;
  const h = q.ohlc.high;
  const l = q.ohlc.low;
  if(!p || !o || !h || !l) return 0;

  const trend = (p - o) / o;
  const strength = (p - l) / (h - l + 0.0001);

  return trend + strength;
}

// ================= LOOP =================
setInterval(async ()=>{
  if(!accessToken) return;

  await updateCapital();
  const quotes = await getQuotes(universe);

  let signals = [];

  for(const s of universe){
    const q = quotes[s];
    if(!q) continue;

    signals.push({
      symbol:s,
      price:q.last_price,
      score:score(q)
    });
  }

  signals.sort((a,b)=>b.score-a.score);
  state.rankedSignals = signals.slice(0,5);

},5000);

// ================= API =================
app.get('/performance',(req,res)=>res.json(state));

// ================= UI =================
app.get('/',(req,res)=>{
  res.send(`
  <html>
  <head>
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
  <body style="background:black;color:#00ff00;font-family:monospace">
    <h2>AlgoBot V43 FIXED</h2>
    <pre id="data"></pre>
  </body>
  </html>
  `);
});

app.listen(PORT, ()=>console.log("V43 FIXED RUNNING"));
