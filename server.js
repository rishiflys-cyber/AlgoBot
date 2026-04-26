
require('dotenv').config();
const express = require('express');
const KiteConnect = require("kiteconnect").KiteConnect;

const app = express();
const PORT = process.env.PORT || 3000;

let kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });
let accessToken = process.env.ACCESS_TOKEN || null;

if (accessToken) kite.setAccessToken(accessToken);

// STATE
let capital = 0;
let activeTrades = [];
let closedTrades = [];
let tradeHistory = [];

// LOGIN
app.get('/login', (req, res) => res.redirect(kite.getLoginURL()));

app.get('/redirect', async (req, res) => {
  const session = await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
  accessToken = session.access_token;
  kite.setAccessToken(accessToken);
  res.send("Login success");
});

// CAPITAL
async function updateCapital() {
  if (!accessToken) return;
  const m = await kite.getMargins();
  capital = m?.equity?.available?.cash || m?.equity?.net || capital;
}

// PERFORMANCE ANALYSIS
function getWinRate() {
  if (tradeHistory.length === 0) return 0.5;
  const wins = tradeHistory.filter(t => t.pnl > 0).length;
  return wins / tradeHistory.length;
}

// ADAPTIVE RISK
function getRiskPercent() {
  const winRate = getWinRate();
  if (winRate > 0.6) return 0.04;
  if (winRate < 0.4) return 0.01;
  return 0.02;
}

// ENTRY FILTER (QUALITY)
function isHighQuality(signalStrength) {
  return signalStrength > 0.65;
}

// LOOP
setInterval(async () => {
  if (!accessToken) return;

  await updateCapital();

  const symbols = ["NSE:RELIANCE","NSE:TCS","NSE:INFY"];
  const quotes = await kite.getQuote(symbols);

  // MANAGE EXISTING
  activeTrades = activeTrades.filter(tr => {
    const q = quotes[tr.symbol];
    if (!q) return true;

    const pnl = (q.last_price - tr.entry) * tr.qty;

    if (pnl > tr.entry * 0.01 || pnl < -tr.entry * 0.005) {
      tradeHistory.push({ pnl });
      closedTrades.push({ ...tr, exit: q.last_price, pnl });
      return false;
    }

    return true;
  });

  // NEW ENTRIES (TOP QUALITY ONLY)
  if (activeTrades.length < 3) {
    const sym = symbols[Math.floor(Math.random() * symbols.length)];
    const q = quotes[sym];
    if (!q) return;

    const signalStrength = Math.random(); // replace with real score later

    if (!isHighQuality(signalStrength)) return;

    const risk = getRiskPercent();
    const qty = Math.max(1, Math.floor((capital * risk) / q.last_price));

    activeTrades.push({
      symbol: sym,
      entry: q.last_price,
      qty,
      strength: signalStrength
    });
  }

}, 3000);

// ROUTES
app.get('/', (req, res) => {
  res.json({
    capital,
    winRate: getWinRate(),
    activeTrades,
    closedTrades
  });
});

app.listen(PORT, () => console.log("Profit Optimization Running"));
