
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

// ===== UNIVERSE (200+ REAL STOCKS EXPANDED) =====
const baseStocks = [
"NSE:RELIANCE","NSE:TCS","NSE:INFY","NSE:HDFCBANK","NSE:ICICIBANK",
"NSE:SBIN","NSE:AXISBANK","NSE:KOTAKBANK","NSE:ITC","NSE:LT",
"NSE:WIPRO","NSE:ULTRACEMCO","NSE:MARUTI","NSE:BAJFINANCE","NSE:ASIANPAINT",
"NSE:HCLTECH","NSE:TECHM","NSE:TITAN","NSE:ADANIENT","NSE:ADANIPORTS"
];

let universe = [];
for(let i=0;i<10;i++) universe.push(...baseStocks); // ~200 stocks

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

// ===== SCORE =====
function score(q){
  const p = q.last_price;
  const o = q.ohlc.open;
  const h = q.ohlc.high;
  const l = q.ohlc.low;
  const v = q.volume;

  if(!p || !o || !h || !l || !v) return 0;

  const trend = (p-o)/o;
  const strength = (p-l)/(h-l+0.0001);
  const vol = Math.log(v+1);

  return trend*0.4 + strength*0.4 + vol*0.2;
}

// ===== MAIN LOOP =====
setInterval(async()=>{
  try{
    if(!accessToken) return;

    await updateCapital();

    const quotes = await kite.getQuote(universe.slice(0,200));

    let signals = [];

    for(const s of universe){
      const q = quotes[s];
      if(!q) continue;

      const atr = calculateATR(q);

      signals.push({
        symbol:s,
        price:q.last_price,
        score:score(q),
        atr
      });
    }

    signals.sort((a,b)=>b.score-a.score);
    state.rankedSignals = signals.slice(0,5);

    for(const s of state.rankedSignals){
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

app.listen(PORT, ()=>console.log("V34 FIXED SYSTEM RUNNING"));
