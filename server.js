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
let pnl = 0;
let activeTrades = [];
let closedTrades = [];

// LOGIN
app.get('/login', (req, res) => res.redirect(kite.getLoginURL()));

app.get('/redirect', async (req, res) => {
  try {
    const session = await kite.generateSession(req.query.request_token, process.env.KITE_API_SECRET);
    accessToken = session.access_token;
    kite.setAccessToken(accessToken);
    console.log("TOKEN SET");
    res.send("Login success");
  } catch (e) {
    console.error(e.message);
    res.send("Login failed");
  }
});

// DASHBOARD
app.get('/', async (req, res) => {
  if (accessToken) {
    try {
      const margins = await kite.getMargins();
      console.log("MARGINS:", margins);
      capital = margins.equity.available.cash || 0;
    } catch (e) {
      console.error("MARGIN ERROR:", e.message);
    }
  }

  res.json({
    capital,
    pnl,
    activeTrades,
    closedTrades,
    access: accessToken ? "ACTIVE" : "NO"
  });
});

// PERFORMANCE ROUTE (FIX)
app.get('/performance', (req, res) => {
  res.json({
    status: "working",
    time: new Date().toISOString(),
    capital,
    pnl,
    activeTradesCount: activeTrades.length,
    closedTradesCount: closedTrades.length
  });
});

app.listen(PORT, () => console.log("Running " + PORT));