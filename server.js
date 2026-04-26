
require('dotenv').config();
const express = require('express');
const KiteConnect = require("kiteconnect").KiteConnect;

const app = express();
const PORT = process.env.PORT || 3000;

let kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });
let accessToken = process.env.ACCESS_TOKEN || null;

if (accessToken) kite.setAccessToken(accessToken);

let capital = 0;
let scanOutput = [];
let priceHistory = {};

const symbols = ["NSE:RELIANCE","NSE:TCS","NSE:INFY"];

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

// REGIME DETECTION
function detectRegime(hist) {
  if (hist.length < 10) return { type: "NORMAL", strength: 0.5 };

  const max = Math.max(...hist);
  const min = Math.min(...hist);
  const avg = hist.reduce((a,b)=>a+b,0)/hist.length;

  const rangePct = (max - min) / avg;

  if (rangePct < 0.002) return { type: "SIDEWAYS", strength: 0.2 };
  if (rangePct > 0.01) return { type: "VOLATILE", strength: 0.9 };

  return { type: "TRENDING", strength: 0.7 };
}

// MOMENTUM
function momentum(hist) {
  let up = 0;
  for (let i=1;i<hist.length;i++){
    if (hist[i] > hist[i-1]) up++;
  }
  return hist.length ? up / hist.length : 0.5;
}

// LOOP
setInterval(async () => {
  if (!accessToken) return;

  await updateCapital();

  const quotes = await kite.getQuote(symbols);
  scanOutput = [];

  for (const sym of symbols) {
    const q = quotes[sym];
    if (!q) continue;

    const price = q.last_price;

    if (!priceHistory[sym]) priceHistory[sym] = [];
    priceHistory[sym].push(price);
    if (priceHistory[sym].length > 50) priceHistory[sym].shift();

    const hist = priceHistory[sym];

    const m = momentum(hist);
    const regime = detectRegime(hist);

    let signal = null;

    if (regime.type === "TRENDING" && m > 0.6) signal = "BUY";
    if (regime.type === "TRENDING" && m < 0.4) signal = "SELL";

    scanOutput.push({
      symbol: sym,
      price,
      momentum: m,
      regime: regime.type,
      regimeStrength: regime.strength,
      signal
    });
  }

}, 3000);

// ROUTES
app.get('/', (req, res) => {
  res.json({
    capital,
    scanOutput
  });
});

app.listen(PORT, () => console.log("Regime Engine Running"));
