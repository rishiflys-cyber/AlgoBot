
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
  serverIP: null
};

let priceHistory = {};
let lastPrice = {};

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

// ===== INDICATORS =====
function momentum(hist) {
  let up = 0;
  for (let i = 1; i < hist.length; i++) if (hist[i] > hist[i-1]) up++;
  return hist.length ? up / hist.length : 0.5;
}

function volatility(hist) {
  let sum = 0;
  for (let i = 1; i < hist.length; i++) {
    sum += Math.abs(hist[i] - hist[i-1]);
  }
  return hist.length ? sum / hist.length : 0;
}

// ===== SIGNAL SCORE =====
function getScore(hist, price, prev, volumeSpike) {
  if (hist.length < 10) return 0;

  let score = 0;

  if (momentum(hist) > 0.6) score++;
  if (momentum(hist) < 0.4) score++;
  if (volatility(hist) > 0) score++;
  if (volumeSpike) score++;
  if (prev && price > prev) score++;

  return score;
}

// ===== RISK =====
function checkRisk() {
  if (state.pnl < -0.05 * state.capital) state.killSwitch = true;
  if (state.pnl < -0.03 * state.capital) state.alert = true;
}

// ===== MAIN LOOP =====
setInterval(async () => {
  if (!accessToken || state.killSwitch) return;

  await updateCapital();

  const symbols = ["NSE:RELIANCE","NSE:TCS","NSE:INFY"];
  const quotes = await kite.getQuote(symbols);

  let candidates = [];

  for (const sym of symbols) {
    const q = quotes[sym];
    if (!q) continue;

    const price = q.last_price;
    const volume = q.volume || 0;
    const avgVol = q.average_volume || 1;

    if (!priceHistory[sym]) priceHistory[sym] = [];
    priceHistory[sym].push(price);
    if (priceHistory[sym].length > 20) priceHistory[sym].shift();

    const hist = priceHistory[sym];
    const volumeSpike = volume > avgVol * 1.2;

    const score = getScore(hist, price, lastPrice[sym], volumeSpike);

    lastPrice[sym] = price;

    candidates.push({ sym, price, score });
  }

  // pick top trades only
  candidates = candidates.sort((a,b)=>b.score-a.score).slice(0,2);

  candidates.forEach(c => {
    if (c.score < 3) return;
    if (state.activeTrades.length >= 3) return;

    const qty = Math.max(1, Math.floor((state.capital * 0.02) / c.price));

    state.activeTrades.push({
      symbol: c.sym,
      entry: c.price,
      qty,
      sl: c.price * 0.995,
      trail: c.price * 0.995,
      target: c.price * 1.02
    });
  });

  // manage trades
  state.activeTrades = state.activeTrades.filter(tr => {
    const cp = lastPrice[tr.symbol];

    // trailing SL
    if (cp > tr.entry) {
      tr.trail = Math.max(tr.trail, cp * 0.997);
    }

    let exit = false;

    if (cp >= tr.target) exit = true;
    if (cp <= tr.trail) exit = true;

    if (exit) {
      const pnl = (cp - tr.entry) * tr.qty;
      state.pnl += pnl;
      state.closedTrades.push({ ...tr, exit: cp, pnl });
      return false;
    }

    return true;
  });

  checkRisk();

}, 3000);

// ===== ROUTES =====
app.get('/', (req, res) => res.json(state));

app.get('/performance', (req, res) => {
  res.json({
    capital: state.capital,
    pnl: state.pnl,
    activeTrades: state.activeTrades.length,
    closedTrades: state.closedTrades.length,
    killSwitch: state.killSwitch,
    alert: state.alert,
    ip: state.serverIP,
    time: new Date().toISOString()
  });
});

fetchIP();

app.listen(PORT, () => console.log("PRO V3 RUNNING"));
