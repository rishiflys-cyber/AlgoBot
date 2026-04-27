
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const axios = require('axios');
const KiteConnect = require("kiteconnect").KiteConnect;

const app = express();
const PORT = process.env.PORT || 3000;

const LIVE = process.env.LIVE_TRADING === "true";
const FORCE_PAPER = process.env.FORCE_PAPER === "true";
const TOKEN_FILE = "access_token.json";

let kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });
let accessToken = null;

let state = {
  capital: 100000,
  peakCapital: 100000,
  pnl: 0,
  serverIP: null,
  rankedSignals: [],
  activeTrades: [],
  closedTrades: [],
  mode: FORCE_PAPER ? "PAPER" : (LIVE ? "LIVE" : "PAPER")
};

// load token
if (fs.existsSync(TOKEN_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(TOKEN_FILE));
    accessToken = saved.token;
    kite.setAccessToken(accessToken);
  } catch {}
}

// login
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

// capital
async function updateCapital(){
  if(FORCE_PAPER) return;

  try{
    const m = await kite.getMargins();
    console.log("MARGIN RAW:", JSON.stringify(m));
    const cash = m?.equity?.available?.cash;
    if(cash && cash > 0){
      state.capital = cash;
      state.peakCapital = Math.max(state.peakCapital, cash);
    }
  }catch(e){
    console.log("CAPITAL ERROR:", e.message);
  }
}

// universe
const universe = [
"NSE:RELIANCE","NSE:TCS","NSE:INFY","NSE:HDFCBANK","NSE:ICICIBANK",
"NSE:SBIN","NSE:AXISBANK","NSE:KOTAKBANK","NSE:ITC","NSE:LT",
"NSE:WIPRO","NSE:ULTRACEMCO","NSE:MARUTI","NSE:BAJFINANCE","NSE:ASIANPAINT",
"NSE:HCLTECH","NSE:TECHM","NSE:TITAN","NSE:ADANIENT","NSE:ADANIPORTS",
"NSE:ONGC","NSE:NTPC","NSE:POWERGRID","NSE:TATASTEEL","NSE:HINDALCO"
];

// batch quotes
async function getQuotes(symbols){
  let result = {};
  for(let i=0;i<symbols.length;i+=50){
    try{
      const q = await kite.getQuote(symbols.slice(i,i+50));
      result = {...result,...q};
    }catch{}
  }
  return result;
}

// scoring
function score(q){
  const p=q.last_price,o=q.ohlc.open,h=q.ohlc.high,l=q.ohlc.low;
  if(!p||!o||!h||!l) return 0;
  return ((p-o)/o)+((p-l)/(h-l+0.0001));
}

// SAFE allocation
function allocate(signals){
  const riskPerTrade = state.capital * 0.01;
  const maxExposure = state.capital * 0.5;

  let used = 0;
  let output = [];

  for(const s of signals){
    const stopDistance = s.price * 0.01;
    let qty = Math.floor(riskPerTrade / stopDistance);

    if(qty <= 0) qty = 1;

    const exposure = qty * s.price;

    if(used + exposure > maxExposure) continue;

    used += exposure;

    output.push({
      ...s,
      qty
    });
  }

  return output;
}

// loop
setInterval(async ()=>{
  if(!accessToken && !FORCE_PAPER) return;

  await updateCapital();

  const quotes = await getQuotes(universe);

  let signals=[];
  for(const s of universe){
    const q=quotes[s];
    if(!q) continue;
    signals.push({symbol:s,price:q.last_price,score:score(q)});
  }

  signals.sort((a,b)=>b.score-a.score);

  const top = signals.slice(0,10); // wider pool
  const allocated = allocate(top).slice(0,5);

  state.rankedSignals = allocated;

  // trades
  for(const s of allocated){
    if(state.activeTrades.find(t=>t.symbol===s.symbol)) continue;

    state.activeTrades.push({
      symbol:s.symbol,
      entry:s.price,
      qty:s.qty,
      sl:s.price*0.99,
      target:s.price*1.02,
      startTime:Date.now()
    });
  }

},5000);

// api
app.get('/performance',(req,res)=>res.json(state));

// UI
app.get('/',(req,res)=>{
  res.send(`
  <html>
  <script>
  async function load(){
    const r=await fetch('/performance');
    const d=await r.json();
    document.getElementById('d').innerText=JSON.stringify(d,null,2);
  }
  setInterval(load,2000);
  window.onload=load;
  </script>
  <body style="background:black;color:#0f0;font-family:monospace">
  <h2>V45 SAFE ENGINE</h2>
  <pre id="d"></pre>
  </body></html>
  `);
});

app.listen(PORT,()=>console.log("V45 SAFE RUNNING"));
