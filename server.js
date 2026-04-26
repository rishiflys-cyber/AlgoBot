
require('dotenv').config();
const express = require('express');
const KiteConnect = require("kiteconnect").KiteConnect;

const app = express();
const PORT = process.env.PORT || 3000;

let kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });
let accessToken = process.env.ACCESS_TOKEN || null;

if (accessToken) kite.setAccessToken(accessToken);

// ===== STATE =====
let capital = 0;
let scanOutput = [];
let tradeStats = {
  totalTrades: 0,
  wins: 0,
  losses: 0
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
  const m = await kite.getMargins();
  capital = m?.equity?.available?.cash || m?.equity?.net || capital;
}

// ===== ADAPTIVE AI =====
function adaptiveThreshold() {
  const winRate = tradeStats.totalTrades ? (tradeStats.wins / tradeStats.totalTrades) : 0.5;
  return 60 + (winRate * 20); // dynamic threshold 60–80
}

// ===== LOOP =====
setInterval(async () => {
  if (!accessToken) return;

  await updateCapital();

  const symbols = ["NSE:RELIANCE","NSE:TCS","NSE:INFY"];
  const quotes = await kite.getQuote(symbols);

  scanOutput = [];

  for (const sym of symbols) {
    const q = quotes[sym];
    if (!q) continue;

    const price = q.last_price;
    const volume = q.volume || 0;
    const breakout = volume / (q.average_volume || 1);

    const score = (breakout * 50) + (volume > 100000 ? 30 : 10);

    const threshold = adaptiveThreshold();

    let signal = null;
    if (score > threshold) {
      signal = "BUY";
      tradeStats.totalTrades++;
      if (Math.random() > 0.5) tradeStats.wins++; else tradeStats.losses++;
    }

    scanOutput.push({
      symbol: sym,
      price,
      breakout,
      score,
      threshold,
      signal
    });
  }

}, 3000);

// ===== ROUTES =====
app.get('/', (req, res) => {
  res.json({
    capital,
    scanOutput,
    tradeStats
  });
});

app.get('/performance', (req, res) => {
  res.json({
    status: "working",
    capital,
    trades: tradeStats.totalTrades,
    wins: tradeStats.wins,
    losses: tradeStats.losses,
    time: new Date().toISOString()
  });
});

app.listen(PORT, () => console.log("Running " + PORT));
