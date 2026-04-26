
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
  mode: LIVE ? "LIVE" : "PAPER"
};

let lastPrice = {};

// ===== CAPITAL =====
async function updateCapital() {
  try {
    const m = await kite.getMargins();
    state.capital = m?.equity?.available?.cash || m?.equity?.net || state.capital;
  } catch {}
}

// ===== ORDER EXECUTION =====
async function executeOrder(symbol, qty, side) {
  if (!LIVE) {
    console.log("PAPER TRADE:", symbol, side, qty);
    return;
  }

  const [exchange, tradingsymbol] = symbol.split(":");

  try {
    await kite.placeOrder("regular", {
      exchange,
      tradingsymbol,
      transaction_type: side === "BUY" ? "BUY" : "SELL",
      quantity: qty,
      product: "MIS",
      order_type: "MARKET"
    });
  } catch (e) {
    console.log("ORDER ERROR:", e.message);
  }
}

// ===== SIGNAL =====
function getSignal(price, prev) {
  if (!prev) return null;
  if (price > prev) return "BUY";
  if (price < prev) return "SELL";
  return null;
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
    const signal = getSignal(price, lastPrice[sym]);

    lastPrice[sym] = price;

    if (signal && state.activeTrades.length < 2) {
      const qty = Math.max(1, Math.floor((state.capital * 0.01) / price));

      await executeOrder(sym, qty, signal);

      state.activeTrades.push({
        symbol: sym,
        entry: price,
        qty,
        side: signal,
        sl: price * 0.995,
        target: price * 1.01
      });
    }
  }

  // manage exits
  state.activeTrades = state.activeTrades.filter(tr => {
    const cp = lastPrice[tr.symbol];

    if (cp >= tr.target || cp <= tr.sl) {
      const pnl = (cp - tr.entry) * tr.qty;
      state.pnl += pnl;

      if (LIVE) {
        executeOrder(tr.symbol, tr.qty, tr.side === "BUY" ? "SELL" : "BUY");
      }

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
    activeTrades: state.activeTrades.length,
    closedTrades: state.closedTrades.length,
    mode: state.mode,
    time: new Date().toISOString()
  });
});

app.listen(PORT, () => console.log("EXECUTION V4 RUNNING"));
