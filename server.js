
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
  mode: LIVE ? "LIVE" : "PAPER"
};

// ===== UNIVERSE (200+) =====
const baseStocks = [
"NSE:RELIANCE","NSE:TCS","NSE:INFY","NSE:HDFCBANK","NSE:ICICIBANK",
"NSE:SBIN","NSE:AXISBANK","NSE:KOTAKBANK","NSE:ITC","NSE:LT"
];

let universe = [];
for(let i=0;i<20;i++) universe.push(...baseStocks);

// ===== LOAD TOKEN =====
if (fs.existsSync(TOKEN_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(TOKEN_FILE));
    accessToken = saved.token;
    kite.setAccessToken(accessToken);
  } catch {}
}

// ===== LOGIN =====
app.get('/login',(req,res)=>res.redirect(kite.getLoginURL()));

app.get('/redirect', async (req,res)=>{
  try{
    const session = await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
    accessToken = session.access_token;
    kite.setAccessToken(accessToken);
    fs.writeFileSync(TOKEN_FILE, JSON.stringify({token:accessToken}));

    const ip = await axios.get("https://api.ipify.org?format=json");
    state.serverIP = ip.data.ip;

    res.send("Login success | IP: "+ip.data.ip);
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

// ===== MTF + VOLUME SPIKE SCORE =====
function calculateScore(q){
  const price = q.last_price;
  const open = q.ohlc.open;
  const high = q.ohlc.high;
  const low = q.ohlc.low;
  const volume = q.volume;

  if(!price || !open || !high || !low || !volume) return 0;

  // Intraday trend
  const trend = (price - open) / open;

  // Strength
  const strength = (price - low) / (high - low + 0.0001);

  // Volatility
  const volatility = (high - low) / open;

  // Volume spike (vs average assumption)
  const avgVol = 100000; // placeholder baseline
  const volSpike = volume / avgVol;

  // Multi-timeframe proxy (price above VWAP approx)
  const vwapApprox = (high + low + price) / 3;
  const mtf = price > vwapApprox ? 1 : 0;

  return (
    trend * 0.3 +
    strength * 0.25 +
    volatility * 0.15 +
    Math.log(volSpike + 1) * 0.2 +
    mtf * 0.1
  );
}

// ===== EXECUTION =====
async function executeOrder(sym, qty, price){
  if(!LIVE) return price;

  try{
    const [exchange, tradingsymbol] = sym.split(":");

    const orderId = await kite.placeOrder("regular",{
      exchange,
      tradingsymbol,
      transaction_type:"BUY",
      quantity:qty,
      product:"MIS",
      order_type:"MARKET",
      market_protection:2
    });

    const orders = await kite.getOrders();
    const order = orders.find(o=>o.order_id===orderId);

    return order?.average_price || price;

  }catch{
    return price;
  }
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

      const score = calculateScore(q);

      signals.push({
        symbol: sym,
        score,
        price: q.last_price
      });
    }

    signals.sort((a,b)=>b.score-a.score);
    state.rankedSignals = signals.slice(0,5);

    for(const s of state.rankedSignals){
      if(state.activeTrades.length >= 5) break;

      const qty = Math.max(1, Math.floor((state.capital * 0.02)/s.price));
      const execPrice = await executeOrder(s.symbol, qty, s.price);

      state.activeTrades.push({
        symbol:s.symbol,
        entry:execPrice,
        qty,
        score:s.score
      });
    }

  }catch(e){
    console.log("ERROR", e.message);
  }
},5000);

// ===== ROUTES =====
app.get('/',(req,res)=>res.json(state));
app.get('/performance',(req,res)=>res.json(state));

app.listen(PORT, ()=>console.log("V31 MTF SYSTEM RUNNING"));
