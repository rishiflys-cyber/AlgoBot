require('dotenv').config();
const express = require('express');
const KiteConnect = require("kiteconnect").KiteConnect;

const app = express();
const PORT = process.env.PORT || 3000;

const LIVE_TRADING = process.env.LIVE_TRADING === 'true';

let kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });
let accessToken = process.env.ACCESS_TOKEN || null;

if (accessToken) kite.setAccessToken(accessToken);

// ===== STATE (PERSIST-LIKE IN MEMORY) =====
global.state = global.state || {
  capital: 0,
  pnl: 0,
  activeTrades: [],
  closedTrades: [],
  lossTracker: {},
  priceHist: {}
};

const state = global.state;

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
  state.capital = m?.equity?.available?.cash || m?.equity?.net || state.capital;
}

// ===== SAFE LOOP (NO ASYNC forEach) =====
async function mainLoop() {
  if (!accessToken) return;

  await updateCapital();

  const symbols = ["NSE:RELIANCE","NSE:TCS","NSE:INFY"];
  const quotes = await kite.getQuote(symbols);

  for (const sym of symbols) {
    const q = quotes[sym];
    if (!q) continue;

    const price = q.last_price;

    if (!state.priceHist[sym]) state.priceHist[sym] = [];
    state.priceHist[sym].push(price);
    if (state.priceHist[sym].length > 20) state.priceHist[sym].shift();
  }
}

// ===== LOOP =====
setInterval(() => {
  mainLoop().catch(err => console.error("LOOP ERROR", err.message));
}, 3000);

// ===== DASHBOARD (FULL CONTRACT RESTORED) =====
app.get('/', (req, res) => {
  res.json({
    botActive: true,
    capital: state.capital,
    pnl: state.pnl,
    serverIP: "AUTO",
    activeTrades: state.activeTrades,
    closedTrades: state.closedTrades,
    scanOutput: []
  });
});

// ===== PERFORMANCE =====
app.get('/performance', (req, res) => {
  res.json({
    status: "working",
    capital: state.capital,
    pnl: state.pnl,
    activeTrades: state.activeTrades.length,
    closedTrades: state.closedTrades.length,
    time: new Date().toISOString()
  });
});

app.listen(PORT, () => console.log("Running " + PORT));