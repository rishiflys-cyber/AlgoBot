
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

// ================= CAPITAL =================
async function updateCapital(){
  try{
    const m = await kite.getMargins();
    state.capital = m?.equity?.available?.cash || m?.equity?.net || 0;

    if(state.capital > state.peakCapital){
      state.peakCapital = state.capital;
    }
  }catch{}
}

// ================= UNIVERSE =================
const universe = [
"NSE:RELIANCE","NSE:TCS","NSE:INFY","NSE:HDFCBANK","NSE:ICICIBANK",
"NSE:SBIN","NSE:AXISBANK","NSE:KOTAKBANK","NSE:ITC","NSE:LT",
"NSE:WIPRO","NSE:ULTRACEMCO","NSE:MARUTI","NSE:BAJFINANCE","NSE:ASIANPAINT",
"NSE:HCLTECH","NSE:TECHM","NSE:TITAN","NSE:ADANIENT","NSE:ADANIPORTS"
];

// ================= REGIME =================
function detectRegime(quotes){
  let trendCount = 0;
  for(const s of universe){
    const q = quotes[s];
    if(!q) continue;
    if(q.last_price > q.ohlc.open) trendCount++;
  }

  if(trendCount > universe.length * 0.6) return "TREND";
  if(trendCount < universe.length * 0.4) return "SIDEWAYS";
  return "NEUTRAL";
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

// ================= RISK =================
function riskAllowed(){
  const drawdown = (state.peakCapital - state.capital) / state.peakCapital;

  if(drawdown > 0.05) return false; // kill switch
  if(state.pnl < -state.capital * 0.03) return false;

  return true;
}

// ================= LOOP =================
setInterval(async ()=>{
  try{
    if(!accessToken) return;

    await updateCapital();
    const quotes = await kite.getQuote(universe);

    state.regime = detectRegime(quotes);

    const buffer = 0.5;

    // EXIT
    for (let trade of state.activeTrades) {
      const q = quotes[trade.symbol];
      if (!q) continue;

      trade.price = q.last_price;

      if (
        trade.price >= (trade.target - buffer) ||
        trade.price <= (trade.sl + buffer) ||
        (Date.now() - trade.startTime) > 1200000 // 20 min
      ) {
        trade.closed = true;

        const pnl = (trade.price - trade.entry) * trade.qty;
        state.closedTrades.push({...trade, exit: trade.price, pnl});
      }
    }

    state.activeTrades = state.activeTrades.filter(t=>!t.closed);
    state.pnl = state.closedTrades.reduce((s,t)=>s+t.pnl,0);

    if(!riskAllowed()) return;

    // SIGNALS
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

    // ENTRY
    for(const s of state.rankedSignals){
      if(state.activeTrades.find(t=>t.symbol===s.symbol)) continue;
      if(state.activeTrades.length >= 5) break;

      state.activeTrades.push({
        symbol:s.symbol,
        entry:s.price,
        price:s.price,
        qty:1,
        sl:s.price*0.99,
        target:s.price*1.02,
        startTime:Date.now()
      });
    }

  }catch(e){
    console.log("ERR", e.message);
  }
},5000);

// ================= ROUTES =================
app.get('/',(req,res)=>res.json(state));
app.get('/performance',(req,res)=>res.json(state));

app.listen(PORT, ()=>console.log("V40 HEDGE FUND CORE RUNNING"));
