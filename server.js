
require('dotenv').config();
const express = require('express');
const axios = require('axios');
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
  killSwitch: false,
  alert: false,
  mode: LIVE ? "LIVE" : "PAPER",
  serverIP: null
};

let priceHistory = {};
let lastPrice = {};

// ===== LOGIN ROUTES (FIXED) =====
app.get('/login', (req, res) => {
  try {
    return res.redirect(kite.getLoginURL());
  } catch (e) {
    return res.send("Login error: " + e.message);
  }
});

app.get('/redirect', async (req, res) => {
  try {
    const token = req.query.request_token;
    if (!token) return res.send("Missing request_token");

    const session = await kite.generateSession(token, process.env.KITE_API_SECRET);
    accessToken = session.access_token;
    kite.setAccessToken(accessToken);

    await fetchIP();

    res.send("Login success | IP: " + state.serverIP);
  } catch (e) {
    res.send("Login failed: " + e.message);
  }
});

// ===== FETCH IP =====
async function fetchIP() {
  try {
    const res = await axios.get("https://api.ipify.org?format=json");
    state.serverIP = res.data.ip;
  } catch {}
}

// ===== CAPITAL =====
async function updateCapital() {
  try {
    const m = await kite.getMargins();
    state.capital = m?.equity?.available?.cash || m?.equity?.net || state.capital;
  } catch {}
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

// ===== SIMPLE STRATEGY =====
function getSignal(price, prev) {
  if (!prev) return null;
  if (price > prev * 1.002) return "BUY";
  if (price < prev * 0.998) return "SELL";
  return null;
}

// ===== LOOP =====
setInterval(async () => {
  if (!accessToken || state.killSwitch) return;

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
      const qty = Math.max(1, Math.floor((state.capital * 0.02) / price));

      await executeOrder(sym, qty, signal);

      state.activeTrades.push({
        symbol: sym,
        entry: price,
        qty,
        side: signal,
        sl: price * 0.995,
        target: price * 1.015
      });
    }
  }

  // manage exits
  state.activeTrades = state.activeTrades.filter(tr => {
    const cp = lastPrice[tr.symbol];

    if (cp >= tr.target || cp <= tr.sl) {
      const pnl = (cp - tr.entry) * tr.qty;
      state.pnl += pnl;

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
    activeTrades: state.activeTrades.length,
    closedTrades: state.closedTrades.length,
    mode: state.mode,
    ip: state.serverIP,
    time: new Date().toISOString()
  });
});

fetchIP();

app.listen(PORT, () => console.log("FINAL FIXED SYSTEM RUNNING"));
