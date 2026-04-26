
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

let state = {
  capital: 0,
  pnl: 0,
  activeTrades: [],
  closedTrades: [],
  mode: LIVE ? "LIVE" : "PAPER",
  serverIP: null
};

let lastPrice = {};

// LOGIN
app.get('/login', (req, res) => res.redirect(kite.getLoginURL()));

app.get('/redirect', async (req, res) => {
  try {
    const session = await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
    accessToken = session.access_token;
    kite.setAccessToken(accessToken);

    const ip = await axios.get("https://api.ipify.org?format=json");
    state.serverIP = ip.data.ip;

    res.send("Login success | IP: " + state.serverIP);
  } catch (e) {
    res.send("Login failed: " + e.message);
  }
});

// CAPITAL
async function updateCapital() {
  try {
    const m = await kite.getMargins();
    state.capital = m?.equity?.available?.cash || m?.equity?.net || state.capital;
  } catch {}
}

// SEBI COMPLIANT ORDER
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
      order_type: "MARKET",
      market_protection: 2   // ✅ SEBI compliant
    });
  } catch (e) {
    console.log("ORDER ERROR:", e.message);
  }
}

// SIMPLE SIGNAL
function getSignal(price, prev) {
  if (!prev) return null;
  if (price > prev * 1.002) return "BUY";
  if (price < prev * 0.998) return "SELL";
  return null;
}

// LOOP
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

  // EXIT
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

// ROUTES
app.get('/', (req, res) => res.json(state));
app.get('/performance', (req, res) => res.json(state));

app.listen(PORT, () => console.log("LIVE SEBI SYSTEM RUNNING"));
