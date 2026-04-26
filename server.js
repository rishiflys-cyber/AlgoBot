
require('dotenv').config();
const express = require('express');
const fs = require('fs');
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
  mode: LIVE ? "LIVE" : "PAPER"
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

// ===== STATS ENGINE =====
function updateStats() {
  if (history.length === 0) return;

  const wins = history.filter(t => t.pnl > 0);
  const losses = history.filter(t => t.pnl <= 0);

  state.winRate = wins.length / history.length;
  state.avgWin = wins.length ? wins.reduce((a,b)=>a+b.pnl,0)/wins.length : 0;
  state.avgLoss = losses.length ? losses.reduce((a,b)=>a+b.pnl,0)/losses.length : 0;
}

// ===== ADAPTIVE STRATEGY =====
function getDynamicParams() {
  // adjust based on real performance
  if (state.winRate > 0.6) {
    return { sl: 0.007, target: 0.02, risk: 0.03 };
  }
  if (state.winRate < 0.4) {
    return { sl: 0.004, target: 0.01, risk: 0.01 };
  }
  return { sl: 0.005, target: 0.015, risk: 0.02 };
}

// ===== EXECUTION =====
async function executeOrder(symbol, qty, side) {
  if (!LIVE) {
    console.log("PAPER:", symbol, side, qty);
    return;
  }

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
  } catch (e) {
    console.log("ORDER ERROR:", e.message);
  }
}

// ===== SIGNAL (IMPROVED) =====
function getSignal(price, prev) {
  if (!prev) return null;

  const change = (price - prev) / prev;

  if (change > 0.003) return "BUY";
  if (change < -0.003) return "SELL";

  return null;
}

// ===== LOOP =====
setInterval(async () => {
  if (!accessToken) return;

  await updateCapital();

  const params = getDynamicParams();

  const symbols = ["NSE:RELIANCE","NSE:TCS","NSE:INFY"];
  const quotes = await kite.getQuote(symbols);

  for (const sym of symbols) {
    const q = quotes[sym];
    if (!q) continue;

    const price = q.last_price;
    const signal = getSignal(price, lastPrice[sym]);

    lastPrice[sym] = price;

    if (signal && state.activeTrades.length < 2) {
      const qty = Math.max(1, Math.floor((state.capital * params.risk) / price));

      await executeOrder(sym, qty, signal);

      state.activeTrades.push({
        symbol: sym,
        entry: price,
        qty,
        side: signal,
        sl: price * (1 - params.sl),
        target: price * (1 + params.target)
      });
    }
  }

  // manage exits
  state.activeTrades = state.activeTrades.filter(tr => {
    const cp = lastPrice[tr.symbol];

    if (cp >= tr.target || cp <= tr.sl) {
      const pnl = (cp - tr.entry) * tr.qty;
      state.pnl += pnl;

      history.push({ pnl });
      if (history.length > 300) history.shift();

      updateStats();

      executeOrder(tr.symbol, tr.qty, tr.side === "BUY" ? "SELL" : "BUY");

      state.closedTrades.push({ ...tr, exit: cp, pnl });
      return false;
    }

    return true;
  });

}, 3000);

// ===== ROUTES =====
app.get('/', (req, res) => res.json(state));

app.get('/performance', (req, res) => {
  res.json({
    capital: state.capital,
    pnl: state.pnl,
    winRate: state.winRate,
    avgWin: state.avgWin,
    avgLoss: state.avgLoss,
    trades: history.length,
    mode: state.mode,
    time: new Date().toISOString()
  });
});

app.listen(PORT, () => console.log("LIVE OPTIMIZED SYSTEM RUNNING"));
