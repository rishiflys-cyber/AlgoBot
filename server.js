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

const symbols = ["NSE:RELIANCE","NSE:TCS","NSE:INFY","NSE:HDFCBANK","NSE:ICICIBANK"];

app.get('/login', (req, res) => res.redirect(kite.getLoginURL()));

app.get('/redirect', async (req, res) => {
  try {
    const session = await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
    accessToken = session.access_token;
    kite.setAccessToken(accessToken);
    res.send("Login success");
  } catch {
    res.send("Login failed");
  }
});

async function updateCapital() {
  if (!accessToken) return;
  try {
    const m = await kite.getMargins();
    capital = m?.equity?.available?.cash || m?.equity?.net || 0;
  } catch {}
}

function detectRegime(prices) {
  if (prices.length < 10) return { type: "NORMAL", strength: 0.5 };
  const max = Math.max(...prices);
  const min = Math.min(...prices);
  const avg = prices.reduce((a,b)=>a+b,0)/prices.length;
  const rangePct = (max - min) / (avg || 1);

  if (rangePct < 0.002) return { type: "SIDEWAYS", strength: 0.2 };
  if (rangePct > 0.01) return { type: "VOLATILE", strength: 0.9 };
  return { type: "NORMAL", strength: 0.5 };
}

const priceHist = {};

function agreementScoreFn({ momentum, volumeBreakout, indexTrend }) {
  let score = 0;
  if (momentum > 0.5) score++;
  if (volumeBreakout > 1.5) score++;
  if ((indexTrend === "UP" && momentum > 0.5) || (indexTrend === "DOWN" && momentum < 0.5)) score++;
  return score;
}

function tradeQuality({ momentum, volumeBreakout, agreementScore, regime }) {
  let score = momentum * 40 + volumeBreakout * 30 + agreementScore * 30;
  if (regime.type === "SIDEWAYS") score *= 0.7;
  if (volumeBreakout < 1) score *= volumeBreakout;
  return Math.min(100, score);
}

setInterval(async () => {
  if (!accessToken) return;

  await updateCapital();

  try {
    const quotes = await kite.getQuote(symbols);
    scanOutput = [];

    let indexTrend = "UP";

    symbols.forEach(sym => {
      const q = quotes[sym];
      if (!q) return;

      const price = q.last_price;
      const volume = q.volume || 0;
      const avgVol = q.average_volume || 1;

      if (!priceHist[sym]) priceHist[sym] = [];
      priceHist[sym].push(price);
      if (priceHist[sym].length > 20) priceHist[sym].shift();

      const hist = priceHist[sym];
      let up = 0, total = 0;
      for (let i=1;i<hist.length;i++){
        if (hist[i] > hist[i-1]) up++;
        total++;
      }
      const momentum = total ? up/total : 0.5;

      if (sym === symbols[0]) {
        indexTrend = momentum >= 0.5 ? "UP" : "DOWN";
      }

      const volumeBreakout = volume / avgVol;
      const regime = detectRegime(hist);
      const agreementScore = agreementScoreFn({ momentum, volumeBreakout, indexTrend });
      const tq = tradeQuality({ momentum, volumeBreakout, agreementScore, regime });

      let signal = null;
      let reason = "Filtered";

      if (regime.type !== "SIDEWAYS" && agreementScore >= 2 && momentum >= 0.5 && tq >= 65) {
        signal = indexTrend === "UP" ? "BUY" : "SELL";
        reason = "Momentum + Volume + Index + Quality";
      }

      scanOutput.push({
        symbol: sym,
        price,
        probability: momentum,
        volume,
        volumeBreakout,
        indexTrend,
        agreementScore,
        signal,
        reason,
        tradeQualityScore: tq,
        regime: regime.type,
        regimeStrength: regime.strength
      });
    });

  } catch (e) {
    console.error("QUOTE ERROR:", e.message);
  }

}, 3000);

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