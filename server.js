
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

let priceHistory = {};

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
  for (let i = 1; i < hist.length; i++) {
    if (hist[i] > hist[i-1]) up++;
  }
  return hist.length ? up / hist.length : 0.5;
}

function volatility(hist) {
  let sum = 0;
  for (let i = 1; i < hist.length; i++) {
    sum += Math.abs(hist[i] - hist[i-1]);
  }
  return hist.length ? sum / hist.length : 0;
}

// ===== SIGNAL ENGINE =====
function getSignal(hist, volumeSpike) {
  if (hist.length < 10) return null;

  const m = momentum(hist);
  const v = volatility(hist);

  if (m > 0.65 && volumeSpike && v > 0) return "BUY";
  if (m < 0.35 && volumeSpike && v > 0) return "SELL";

  return null;
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

    const signal = getSignal(hist, volumeSpike);

    if (signal && state.activeTrades.length < 3) {
      const qty = Math.max(1, Math.floor((state.capital * 0.01) / price));

      state.activeTrades.push({
        symbol: sym,
        entry: price,
        side: signal,
        qty,
        sl: price * 0.995,
        target: price * 1.01
      });
    }
  }

  // manage trades
  state.activeTrades = state.activeTrades.filter(tr => {
    const cp = priceHistory[tr.symbol].slice(-1)[0];
    let exit = false;

    if (tr.side === "BUY") {
      if (cp >= tr.target || cp <= tr.sl) exit = true;
    }

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
    time: new Date().toISOString()
  });
});

app.listen(PORT, () => console.log("UPGRADED SYSTEM RUNNING"));
