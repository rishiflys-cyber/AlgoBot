
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

if (fs.existsSync(TOKEN_FILE)) {
  const saved = JSON.parse(fs.readFileSync(TOKEN_FILE));
  accessToken = saved.token;
  kite.setAccessToken(accessToken);
}

const STOCKS = ["NSE:RELIANCE","NSE:TCS","NSE:INFY","NSE:HDFCBANK","NSE:ICICIBANK"];

let state = {
  capital: 0,
  pnl: 0,
  activeTrades: [],
  closedTrades: [],
  winRate: 0,
  avgWin: 0,
  avgLoss: 0,
  mode: LIVE ? "LIVE" : "PAPER"
};

let lastPrice = {};
let tradeHistory = [];

// LOGIN
app.get('/login', (req,res)=>res.redirect(kite.getLoginURL()));

app.get('/redirect', async (req,res)=>{
  try{
    const session = await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
    accessToken = session.access_token;
    kite.setAccessToken(accessToken);
    fs.writeFileSync(TOKEN_FILE, JSON.stringify({token: accessToken}));
    res.send("Login success");
  }catch(e){
    res.send("Login failed");
  }
});

// CAPITAL
async function updateCapital(){
  try{
    const m = await kite.getMargins();
    state.capital = m?.equity?.available?.cash || m?.equity?.net || state.capital;
  }catch{}
}

// ALPHA SCORE (multi-factor)
function getAlphaScore(q, prev){
  if(!prev) return 0;

  let score = 0;

  // momentum
  if(q.last_price > prev) score++;

  // breakout
  if(q.last_price > q.ohlc.high * 0.995) score++;

  // trend
  if(q.last_price > q.ohlc.open) score++;

  // volatility expansion
  if((q.ohlc.high - q.ohlc.low)/q.last_price > 0.01) score++;

  return score;
}

// UPDATE STATS
function updateStats(){
  const wins = tradeHistory.filter(t => t.pnl > 0);
  const losses = tradeHistory.filter(t => t.pnl <= 0);

  state.winRate = wins.length / (tradeHistory.length || 1);
  state.avgWin = wins.length ? wins.reduce((a,b)=>a+b.pnl,0)/wins.length : 0;
  state.avgLoss = losses.length ? losses.reduce((a,b)=>a+b.pnl,0)/losses.length : 0;
}

// EXECUTION
async function executeOrder(symbol, qty, side){
  if(!LIVE) return;
  const [exchange, tradingsymbol] = symbol.split(":");
  await kite.placeOrder("regular", {
    exchange,
    tradingsymbol,
    transaction_type: side,
    quantity: qty,
    product: "MIS",
    order_type: "MARKET",
    market_protection: 2
  });
}

// LOOP
setInterval(async ()=>{
  if(!accessToken) return;

  await updateCapital();

  const quotes = await kite.getQuote(STOCKS);

  let signals = [];

  for(const sym of STOCKS){
    const q = quotes[sym];
    if(!q) continue;

    const score = getAlphaScore(q, lastPrice[sym]);
    lastPrice[sym] = q.last_price;

    if(score >= 3){
      signals.push({sym, score, price: q.last_price});
    }
  }

  signals.sort((a,b)=>b.score-a.score);

  for(const s of signals){
    if(state.activeTrades.length >= 2) break;

    const qty = Math.max(1, Math.floor((state.capital * 0.01)/s.price));

    await executeOrder(s.sym, qty, "BUY");

    state.activeTrades.push({
      symbol: s.sym,
      entry: s.price,
      qty,
      sl: s.price * 0.995,
      target: s.price * 1.02,
      score: s.score
    });
  }

  // exits
  state.activeTrades = state.activeTrades.filter(tr=>{
    const cp = lastPrice[tr.symbol];

    if(cp >= tr.target || cp <= tr.sl){
      const pnl = (cp - tr.entry) * tr.qty;
      state.pnl += pnl;

      tradeHistory.push({ pnl, score: tr.score });

      updateStats();

      executeOrder(tr.symbol, tr.qty, "SELL");

      state.closedTrades.push({ ...tr, exit: cp, pnl });

      return false;
    }
    return true;
  });

},3000);

// ROUTES
app.get('/', (req,res)=>res.json(state));
app.get('/performance', (req,res)=>res.json(state));

app.listen(PORT, ()=>console.log("ALPHA SYSTEM V15 RUNNING"));
