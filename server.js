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
let pnl = 0;
let activeTrades = [];
let closedTrades = [];
let maxTrades = 5;

// ===== LOGIN =====
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

// ===== DASHBOARD =====
app.get('/', async (req, res) => {
  if (accessToken) {
    try {
      const margins = await kite.getMargins();
      capital = margins.equity.available.cash;
    } catch {}
  }

  res.json({
    capital,
    pnl,
    activeTrades,
    closedTrades
  });
});

// ===== RISK + EXECUTION LOOP =====
setInterval(async () => {
  if (!accessToken) return;

  if (activeTrades.length >= maxTrades) return;

  const symbol = "RELIANCE";
  const price = Math.random() * 1000;

  const probability = Math.random();

  if (probability > 0.7) {
    const qty = Math.floor((capital * 0.02) / price);

    const stopLoss = price * 0.998;
    const target = price * 1.003;

    activeTrades.push({
      symbol,
      entry: price,
      qty,
      stopLoss,
      target
    });
  }

  // ===== EXIT LOGIC =====
  activeTrades = activeTrades.filter(trade => {
    const currentPrice = Math.random() * 1000;

    if (currentPrice <= trade.stopLoss || currentPrice >= trade.target) {
      const tradePnl = (currentPrice - trade.entry) * trade.qty;
      pnl += tradePnl;

      closedTrades.push({
        ...trade,
        exit: currentPrice,
        pnl: tradePnl
      });

      return false;
    }

    return true;
  });

}, 3000);

app.listen(PORT, () => console.log("Running " + PORT));