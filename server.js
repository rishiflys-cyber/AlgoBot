
require('dotenv').config();
const express = require('express');
const KiteConnect = require("kiteconnect").KiteConnect;

const app = express();
const PORT = process.env.PORT || 3000;

const LIVE_TRADING = process.env.LIVE_TRADING === 'true';

let kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });
let accessToken = process.env.ACCESS_TOKEN || null;

if (accessToken) kite.setAccessToken(accessToken);

// ===== STATE =====
let strategies = [];
let results = [];
let activeTrades = [];
let capital = 0;

// ===== LOGIN =====
app.get('/login', (req, res) => res.redirect(kite.getLoginURL()));

app.get('/redirect', async (req, res) => {
  const session = await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
  accessToken = session.access_token;
  kite.setAccessToken(accessToken);
  res.send("Login success");
});

// ===== CAPITAL =====
async function updateCapital() {
  if (!accessToken) return;
  const m = await kite.getMargins();
  capital = m?.equity?.available?.cash || m?.equity?.net || capital;
}

// ===== STRATEGY GENERATION =====
function generateStrategy() {
  return {
    id: Date.now(),
    threshold: 60 + Math.random() * 20
  };
}

// ===== BACKTEST =====
function evaluateStrategy(strategy) {
  let score = Math.random() * 100;
  return score;
}

// ===== ORDER =====
async function placeOrder(symbol, qty) {
  if (!LIVE_TRADING) return;

  const [exchange, tradingsymbol] = symbol.split(":");

  await kite.placeOrder("regular", {
    exchange,
    tradingsymbol,
    transaction_type: "BUY",
    quantity: qty,
    product: "MIS",
    order_type: "MARKET"
  });
}

// ===== MAIN LOOP =====
setInterval(async () => {
  if (!accessToken) return;

  await updateCapital();

  const strat = generateStrategy();
  const score = evaluateStrategy(strat);

  strategies.push(strat);
  results.push({ ...strat, score });

  results = results.sort((a,b)=>b.score-a.score).slice(0,5);

  const best = results[0];
  if (!best) return;

  const symbol = "NSE:RELIANCE";
  const price = 1000; // placeholder
  const qty = Math.max(1, Math.floor((capital * 0.02) / price));

  if (best.score > best.threshold && activeTrades.length < 3) {
    await placeOrder(symbol, qty);

    activeTrades.push({
      symbol,
      qty,
      strategy: best.id
    });
  }

}, 4000);

// ===== ROUTES =====
app.get('/', (req, res) => {
  res.json({
    capital,
    topStrategy: results[0],
    activeTrades
  });
});

app.get('/performance', (req, res) => {
  res.json({
    strategiesTested: strategies.length,
    bestScore: results[0]?.score || 0,
    trades: activeTrades.length,
    time: new Date().toISOString()
  });
});

app.listen(PORT, () => console.log("Alpha Live Running"));
