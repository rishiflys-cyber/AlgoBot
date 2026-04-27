
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const KiteConnect = require("kiteconnect").KiteConnect;

const app = express();
const PORT = process.env.PORT || 3000;

const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let accessToken = null;

let state = {
  capital: 0,
  peakCapital: 0,
  pnl: 0,
  serverIP: null,
  rankedSignals: [],
  activeTrades: [],
  mode: "LIVE"
};

// ===== LOGIN =====
app.get('/login', (req,res)=>{
  res.redirect(kite.getLoginURL());
});

app.get('/redirect', async (req,res)=>{
  try{
    const session = await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
    accessToken = session.access_token;
    kite.setAccessToken(accessToken);

    const ip = await axios.get("https://api.ipify.org?format=json");
    state.serverIP = ip.data.ip;

    await updateCapital();

    res.send("Login success | IP: " + state.serverIP + " | Capital: " + state.capital);
  }catch(e){
    res.send("Login failed: " + e.message);
  }
});

// ===== CAPITAL (STRICT) =====
async function updateCapital(){
  try{
    const margins = await kite.getMargins();
    const cash = margins?.equity?.available?.cash;

    console.log("RAW MARGINS:", JSON.stringify(margins));

    if(cash && cash > 0){
      state.capital = cash;
      state.peakCapital = Math.max(state.peakCapital, cash);
    }
  }catch(e){
    console.log("CAPITAL ERROR:", e.message);
  }
}

// ===== REAL UNIQUE NSE LIST =====
const universe = [
"NSE:RELIANCE","NSE:TCS","NSE:INFY","NSE:HDFCBANK","NSE:ICICIBANK",
"NSE:SBIN","NSE:AXISBANK","NSE:KOTAKBANK","NSE:ITC","NSE:LT",
"NSE:WIPRO","NSE:ULTRACEMCO","NSE:MARUTI","NSE:BAJFINANCE","NSE:ASIANPAINT",
"NSE:HCLTECH","NSE:TECHM","NSE:TITAN","NSE:ADANIENT","NSE:ADANIPORTS",
"NSE:ONGC","NSE:NTPC","NSE:POWERGRID","NSE:TATASTEEL","NSE:HINDALCO",
"NSE:COALINDIA","NSE:BPCL","NSE:BRITANNIA","NSE:CIPLA","NSE:DIVISLAB",
"NSE:DRREDDY","NSE:EICHERMOT","NSE:GRASIM","NSE:HDFCLIFE","NSE:HEROMOTOCO",
"NSE:INDUSINDBK","NSE:JSWSTEEL","NSE:M&M","NSE:NESTLEIND","NSE:SHREECEM",
"NSE:SBILIFE","NSE:UPL","NSE:BAJAJFINSV","NSE:TATAMOTORS","NSE:ICICIPRULI"
];

// ===== QUOTES =====
async function getQuotes(){
  let result = {};
  for(let i=0;i<universe.length;i+=50){
    try{
      const q = await kite.getQuote(universe.slice(i,i+50));
      result = {...result,...q};
    }catch(e){
      console.log("QUOTE ERROR:", e.message);
    }
  }
  return result;
}

// ===== SCORING =====
function score(q){
  const p=q.last_price,o=q.ohlc.open,h=q.ohlc.high,l=q.ohlc.low;
  if(!p||!o||!h||!l) return -999;

  return ((p-o)/o) + ((p-l)/(h-l+0.0001));
}

// ===== ENGINE =====
setInterval(async ()=>{
  if(!accessToken) return;

  await updateCapital();

  const quotes = await getQuotes();

  let signals=[];

  for(const s of universe){
    const q = quotes[s];
    if(!q) continue;

    signals.push({
      symbol:s,
      price:q.last_price,
      score:score(q)
    });
  }

  // remove invalid
  signals = signals.filter(s => s.score > -1);

  // SORT
  signals.sort((a,b)=>b.score-a.score);

  // REMOVE DUPLICATES (extra safety)
  const seen = new Set();
  const unique = signals.filter(s=>{
    if(seen.has(s.symbol)) return false;
    seen.add(s.symbol);
    return true;
  });

  state.rankedSignals = unique.slice(0,5);

  console.log("FINAL SIGNALS:", state.rankedSignals);

},5000);

// ===== API =====
app.get('/performance',(req,res)=>res.json(state));

// ===== UI =====
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
  <h2>V49 CLEAN ENGINE</h2>
  <pre id="d"></pre>
  </body></html>
  `);
});

app.listen(PORT,()=>console.log("V49 RUNNING"));
