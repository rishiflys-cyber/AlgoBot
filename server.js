
require('dotenv').config();
const express = require('express');
const KiteConnect = require("kiteconnect").KiteConnect;

const app = express();
const PORT = process.env.PORT || 3000;

const LIVE = process.env.LIVE_TRADING === "true";

let kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });
let accessToken = process.env.ACCESS_TOKEN;

if (accessToken) kite.setAccessToken(accessToken);

// ===== STATE =====
let state = {
  capital: 0,
  pnl: 0,
  activeTrades: [],
  closedTrades: [],
  winRate: 0,
  avgWin: 0,
  avgLoss: 0,
  badPatterns: []
};

let history = [];
let lastPrice = {};

// ===== CAPITAL =====
async function updateCapital() {
  try {
    const m = await kite.getMargins();
    state.capital = m?.equity?.available?.cash || m?.equity?.net || state.capital;
  } catch {}
}

// ===== STATS =====
function updateStats() {
  if (!history.length) return;

  const wins = history.filter(t => t.pnl > 0);
  const losses = history.filter(t => t.pnl <= 0);

  state.winRate = wins.length / history.length;
  state.avgWin = wins.length ? wins.reduce((a,b)=>a+b.pnl,0)/wins.length : 0;
  state.avgLoss = losses.length ? losses.reduce((a,b)=>a+b.pnl,0)/losses.length : 0;
}

// ===== PATTERN DETECTION =====
function analyzePatterns() {
  const lowScoreLoss = history.filter(t => t.score < 3 && t.pnl < 0).length;
  if (lowScoreLoss > 5) {
    state.badPatterns.push("LOW_SCORE");
  }
}

// ===== FILTER =====
function allowTrade(score) {
  if (state.badPatterns.includes("LOW_SCORE") && score < 3) return false;
  return true;
}

// ===== SIGNAL =====
function getScore(price, prev) {
  if (!prev) return 0;
  let score = 0;
  if (price > prev) score++;
  if (price > prev * 1.002) score++;
  if (price > prev * 1.004) score++;
  return score;
}

// ===== EXECUTION =====
async function executeOrder(symbol, qty, side) {
  if (!LIVE) return;
  const [exchange, tradingsymbol] = symbol.split(":");
  try {
    await kite.placeOrder("regular", {
      exchange,
      tradingsymbol,
      transaction_type: side,
      quantity: qty,
      product: "MIS",
      order_type: "MARKET"
    });
  } catch {}
}

// ===== LOOP =====
setInterval(async () => {
  if (!accessToken) return;

  await updateCapital();

  const symbols = ["NSE:RELIANCE","NSE:TCS","NSE:INFY"];
  const quotes = await kite.getQuote(symbols);

  for (const sym of symbols) {
    const q = quotes[sym];
    if (!q) continue;

    const price = q.last_price;
    const score = getScore(price, lastPrice[sym]);

    lastPrice[sym] = price;

    if (!allowTrade(score)) continue;

    if (score >= 2 && state.activeTrades.length < 2) {
      const qty = Math.max(1, Math.floor((state.capital * 0.02) / price));

      await executeOrder(sym, qty, "BUY");

      state.activeTrades.push({
        symbol: sym,
        entry: price,
        qty,
        score,
        sl: price * 0.995,
        target: price * 1.015
      });
    }
  }

  // exits
  state.activeTrades = state.activeTrades.filter(tr => {
    const cp = lastPrice[tr.symbol];

    if (cp >= tr.target || cp <= tr.sl) {
      const pnl = (cp - tr.entry) * tr.qty;
      state.pnl += pnl;

      history.push({ pnl, score: tr.score });
      if (history.length > 200) history.shift();

      updateStats();
      analyzePatterns();

      executeOrder(tr.symbol, tr.qty, "SELL");

      state.closedTrades.push({ ...tr, exit: cp, pnl });
      return false;
    }

    return true;
  });

}, 3000);

// ===== ROUTES =====
app.get('/', (req, res) => res.json(state));

app.get('/performance', (req, res) => res.json(state));

app.listen(PORT, () => console.log("TRADE INTELLIGENCE V6 RUNNING"));
