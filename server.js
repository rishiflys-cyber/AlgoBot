
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
let history = {}; // multi timeframe storage

const symbols = ["NSE:RELIANCE","NSE:TCS","NSE:INFY"];

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

// ===== AI SCORE =====
function aiScore(momentum, volume, breakout) {
  let score = (momentum * 50) + (breakout * 30) + (volume > 100000 ? 20 : 10);
  return Math.min(100, score);
}

// ===== LOOP =====
setInterval(async () => {
  if (!accessToken) return;

  await updateCapital();

  const quotes = await kite.getQuote(symbols);
  scanOutput = [];

  for (const sym of symbols) {
    const q = quotes[sym];
    if (!q) continue;

    const price = q.last_price;
    const volume = q.volume || 0;

    if (!history[sym]) history[sym] = [];
    history[sym].push(price);
    if (history[sym].length > 50) history[sym].shift();

    // short timeframe
    let shortUp = 0;
    for (let i=1;i<history[sym].length;i++){
      if (history[sym][i] > history[sym][i-1]) shortUp++;
    }
    const shortMomentum = shortUp / (history[sym].length || 1);

    // long timeframe (last 10 vs first)
    const longMomentum = history[sym].length > 10 ?
      (history[sym][history[sym].length-1] > history[sym][0] ? 1 : 0) : 0.5;

    const breakout = volume / (q.average_volume || 1);

    const ai = aiScore(shortMomentum, volume, breakout);

    let signal = null;
    if (shortMomentum > 0.5 && longMomentum > 0.5 && ai > 65) {
      signal = "BUY";
    }

    scanOutput.push({
      symbol: sym,
      price,
      shortMomentum,
      longMomentum,
      volume,
      breakout,
      aiScore: ai,
      signal
    });
  }

}, 3000);

// ===== ROUTES =====
app.get('/', (req, res) => {
  res.json({ capital, scanOutput });
});

app.get('/performance', (req, res) => {
  res.json({
    status: "working",
    capital,
    symbolsTracked: symbols.length,
    time: new Date().toISOString()
  });
});

app.listen(PORT, () => console.log("Running " + PORT));
