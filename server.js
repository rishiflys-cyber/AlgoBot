
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const KiteConnect = require("kiteconnect").KiteConnect;

const app = express();
const PORT = process.env.PORT || 3000;

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

// ===== GET PUBLIC IP =====
async function fetchIP() {
  try {
    const res = await axios.get("https://api.ipify.org?format=json");
    state.serverIP = res.data.ip;
  } catch {}
}

// ===== LOGIN =====
app.get('/login', (req, res) => res.redirect(kite.getLoginURL()));

app.get('/redirect', async (req, res) => {
  const session = await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
  accessToken = session.access_token;
  kite.setAccessToken(accessToken);

  await fetchIP();

  res.send(`Login success \nServer IP: ${state.serverIP}`);
});

// ===== CAPITAL =====
async function updateCapital() {
  try {
    const m = await kite.getMargins();
    state.capital = m?.equity?.available?.cash || m?.equity?.net || state.capital;
  } catch {}
}

// ===== STRATEGIES =====
function momentum(hist) {
  let up = 0;
  for (let i = 1; i < hist.length; i++) if (hist[i] > hist[i-1]) up++;
  return hist.length ? up / hist.length : 0.5;
}

function meanReversion(hist) {
  const avg = hist.reduce((a,b)=>a+b,0)/hist.length;
  const last = hist[hist.length-1];
  return last < avg * 0.995 ? "BUY" : last > avg * 1.005 ? "SELL" : null;
}

function breakout(price, prev) {
  if (!prev) return null;
  if (price > prev * 1.002) return "BUY";
  if (price < prev * 0.998) return "SELL";
  return null;
}

// ===== SIGNAL COMBINER =====
function getSignal(hist, price, prev) {
  if (hist.length < 10) return null;

  let signals = [];

  if (momentum(hist) > 0.6) signals.push("BUY");
  if (momentum(hist) < 0.4) signals.push("SELL");

  const mr = meanReversion(hist);
  if (mr) signals.push(mr);

  const br = breakout(price, prev);
  if (br) signals.push(br);

  const buy = signals.filter(s=>s==="BUY").length;
  const sell = signals.filter(s=>s==="SELL").length;

  if (buy >= 2) return "BUY";
  if (sell >= 2) return "SELL";

  return null;
}

// ===== RISK =====
function checkRisk() {
  if (state.pnl < -0.05 * state.capital) state.killSwitch = true;
  if (state.pnl < -0.03 * state.capital) state.alert = true;
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

    if (!priceHistory[sym]) priceHistory[sym] = [];
    priceHistory[sym].push(price);
    if (priceHistory[sym].length > 20) priceHistory[sym].shift();

    const hist = priceHistory[sym];
    const signal = getSignal(hist, price, lastPrice[sym]);

    lastPrice[sym] = price;

    if (signal && state.activeTrades.length < 3) {
      const qty = Math.max(1, Math.floor((state.capital * 0.02) / price));

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
    const cp = lastPrice[tr.symbol];
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
    ip: state.serverIP,
    time: new Date().toISOString()
  });
});

app.listen(PORT, () => console.log("FULL PRODUCTION SYSTEM RUNNING"));
