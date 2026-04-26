
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
  killSwitch: false,
  alert: false
};

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
  try {
    const m = await kite.getMargins();
    state.capital = m?.equity?.available?.cash || m?.equity?.net || state.capital;
  } catch {}
}

// ===== SIMPLE SIGNAL =====
function getSignal(price, prev) {
  if (!prev) return null;
  if (price > prev) return "BUY";
  if (price < prev) return "SELL";
  return null;
}

// ===== KILL SWITCH =====
function checkRisk() {
  if (state.pnl < -0.05 * state.capital) {
    state.killSwitch = true;
  }
  if (state.pnl < -0.03 * state.capital) {
    state.alert = true;
  }
}

// ===== MAIN LOOP =====
let lastPrice = {};

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

    if (signal && state.activeTrades.length < 3) {
      const qty = Math.max(1, Math.floor((state.capital * 0.01) / price));

      state.activeTrades.push({
        symbol: sym,
        entry: price,
        side: signal,
        qty
      });
    }
  }

  // manage exits
  state.activeTrades = state.activeTrades.filter(tr => {
    const cp = lastPrice[tr.symbol];
    const pnl = (cp - tr.entry) * tr.qty;

    if (Math.abs(pnl) > tr.entry * 0.01) {
      state.pnl += pnl;
      state.closedTrades.push({ ...tr, exit: cp, pnl });
      return false;
    }
    return true;
  });

  checkRisk();

}, 3000);

// ===== ROUTES =====
app.get('/', (req, res) => {
  res.json(state);
});

app.get('/performance', (req, res) => {
  res.json({
    capital: state.capital,
    pnl: state.pnl,
    activeTrades: state.activeTrades.length,
    closedTrades: state.closedTrades.length,
    killSwitch: state.killSwitch,
    alert: state.alert,
    time: new Date().toISOString()
  });
});

app.listen(PORT, () => console.log("FINAL SYSTEM RUNNING"));
