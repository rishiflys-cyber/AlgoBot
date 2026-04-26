
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
let scanOutput = [];
let priceHistory = {};

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

// REAL ALPHA LOGIC
function computeMomentum(hist) {
  let up = 0;
  for (let i=1;i<hist.length;i++){
    if (hist[i] > hist[i-1]) up++;
  }
  return hist.length ? up / hist.length : 0.5;
}

function computeVolatility(hist) {
  let changes = [];
  for (let i=1;i<hist.length;i++){
    changes.push(Math.abs(hist[i]-hist[i-1]));
  }
  return changes.length ? changes.reduce((a,b)=>a+b,0)/changes.length : 0;
}

function alphaSignal({momentum, breakout, volatility}) {
  if (momentum > 0.6 && breakout > 1.5 && volatility > 0) return "BUY";
  if (momentum < 0.4 && breakout > 1.5 && volatility > 0) return "SELL";
  return null;
}

// LOOP
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
    const avgVol = q.average_volume || 1;

    if (!priceHistory[sym]) priceHistory[sym] = [];
    priceHistory[sym].push(price);
    if (priceHistory[sym].length > 50) priceHistory[sym].shift();

    const hist = priceHistory[sym];

    const momentum = computeMomentum(hist);
    const volatility = computeVolatility(hist);
    const breakout = volume / avgVol;

    const signal = alphaSignal({momentum, breakout, volatility});

    scanOutput.push({
      symbol: sym,
      price,
      momentum,
      volatility,
      breakout,
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

app.listen(PORT, () => console.log("Real Alpha Engine Running"));
