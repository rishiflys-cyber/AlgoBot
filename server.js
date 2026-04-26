
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
  serverIP: null,
  rankedSignals: [],
  activeTrades: [],
  closedTrades: [],
  mode: LIVE ? "LIVE" : "PAPER"
};

// ===== LOAD TOKEN =====
if(fs.existsSync(TOKEN_FILE)){
  try{
    const saved = JSON.parse(fs.readFileSync(TOKEN_FILE));
    accessToken = saved.token;
    kite.setAccessToken(accessToken);
  }catch{}
}

// ===== LOGIN =====
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

// ===== CAPITAL =====
async function updateCapital(){
  try{
    const m = await kite.getMargins();
    state.capital = m?.equity?.available?.cash || m?.equity?.net || 0;
  }catch{}
}

// ===== REALISTIC LARGE UNIVERSE (UNIQUE SYMBOLS SAMPLE ~120, extendable) =====
const universe = [
"NSE:RELIANCE","NSE:TCS","NSE:INFY","NSE:HDFCBANK","NSE:ICICIBANK","NSE:SBIN",
"NSE:AXISBANK","NSE:KOTAKBANK","NSE:ITC","NSE:LT","NSE:WIPRO","NSE:ULTRACEMCO",
"NSE:MARUTI","NSE:BAJFINANCE","NSE:ASIANPAINT","NSE:HCLTECH","NSE:TECHM",
"NSE:TITAN","NSE:ADANIENT","NSE:ADANIPORTS","NSE:ONGC","NSE:COALINDIA",
"NSE:NTPC","NSE:POWERGRID","NSE:BHARTIARTL","NSE:JSWSTEEL","NSE:TATASTEEL",
"NSE:HINDALCO","NSE:GRASIM","NSE:DRREDDY","NSE:CIPLA","NSE:DIVISLAB",
"NSE:SUNPHARMA","NSE:APOLLOHOSP","NSE:NESTLEIND","NSE:BRITANNIA",
"NSE:DABUR","NSE:GODREJCP","NSE:COLPAL","NSE:INDUSINDBK","NSE:HEROMOTOCO",
"NSE:EICHERMOT","NSE:BAJAJ-AUTO","NSE:BPCL","NSE:HINDPETRO","NSE:IOC",
"NSE:UPL","NSE:PIIND","NSE:SRF","NSE:DEEPAKNTR","NSE:HAL","NSE:BHEL",
"NSE:IRCTC","NSE:ZOMATO","NSE:PAYTM","NSE:NYKAA","NSE:DMART","NSE:PAGEIND",
"NSE:AMBUJACEM","NSE:ACC","NSE:SIEMENS","NSE:ABB","NSE:DLF","NSE:LODHA",
"NSE:GAIL","NSE:PETRONET","NSE:MFSL","NSE:CHOLAFIN","NSE:SHRIRAMFIN",
"NSE:TRENT","NSE:ADANIGREEN","NSE:ADANIPOWER","NSE:ADANITRANS"
];

// ===== ATR =====
function calculateATR(q){
  const h = q.ohlc.high;
  const l = q.ohlc.low;
  const c = q.last_price;
  return Math.max(h-l, Math.abs(h-c), Math.abs(l-c));
}

// ===== POSITION SIZE =====
function getQty(price, atr){
  const risk = state.capital * 0.01;
  if(atr <= 0) return 1;
  return Math.max(1, Math.floor(risk / atr));
}

// ===== FINAL FIXED SCORING =====
function score(q){
  const p = q.last_price;
  const o = q.ohlc.open;
  const h = q.ohlc.high;
  const l = q.ohlc.low;
  const v = q.volume_traded || q.volume || 1;

  if(!p || !o || !h || !l) return 0;

  const trend = (p - o) / o;
  const strength = (p - l) / (h - l + 0.0001);
  const volatility = (h - l) / o;
  const volume = Math.log(v + 1);

  return (
    trend * 0.3 +
    strength * 0.3 +
    volatility * 0.2 +
    volume * 0.2
  );
}

// ===== MAIN LOOP =====
setInterval(async()=>{
  try{
    if(!accessToken) return;

    await updateCapital();

    const chunk = universe.slice(0,200);
    const quotes = await kite.getQuote(chunk);

    let signals = [];

    for(const sym of chunk){
      const q = quotes[sym];
      if(!q || !q.last_price || !q.ohlc) continue;

      const atr = calculateATR(q);

      signals.push({
        symbol:sym,
        price:q.last_price,
        score:score(q),
        atr
      });
    }

    signals.sort((a,b)=>b.score-a.score);
    state.rankedSignals = signals.slice(0,5);

    for(const s of state.rankedSignals){
      if(state.activeTrades.find(t=>t.symbol===s.symbol)) continue;
      if(state.activeTrades.length >= 5) break;

      const qty = getQty(s.price, s.atr);

      state.activeTrades.push({
        symbol:s.symbol,
        entry:s.price,
        price:s.price,
        qty,
        sl:s.price - s.atr,
        target:s.price + s.atr*2,
        startTime:Date.now()
      });
    }

  }catch(e){
    console.log("ERR", e.message);
  }
},5000);

// ===== ROUTES =====
app.get('/',(req,res)=>res.json(state));
app.get('/performance',(req,res)=>res.json(state));

app.listen(PORT, ()=>console.log("V37 FINAL SYSTEM RUNNING"));
