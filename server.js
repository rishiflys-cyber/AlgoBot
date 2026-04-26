require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();

const PORT = process.env.PORT || 3000;

let botActive = true;
let capital = 0;
let pnl = 0;
let activeTrades = [];
let closedTrades = [];
let scanOutput = [];

let accessToken = null;

// ===== LOGIN ROUTE =====
app.get('/login', (req, res) => {
  const url = `https://kite.zerodha.com/connect/login?api_key=${process.env.KITE_API_KEY}`;
  res.redirect(url);
});

// ===== REDIRECT =====
app.get('/redirect', async (req, res) => {
  const requestToken = req.query.request_token;

  // NOTE: token exchange placeholder (needs kite SDK normally)
  accessToken = requestToken;

  res.send("Login success. Token stored.");
});

// ===== DASHBOARD =====
app.get('/', (req, res) => {
  res.json({
    botActive,
    capital,
    pnl,
    activeTrades,
    closedTrades,
    scanOutput,
    serverIP: "AUTO"
  });
});

// ===== MOCK LOOP =====
setInterval(() => {
  scanOutput = [];

  const symbols = ["RELIANCE", "TCS", "INFY"];

  symbols.forEach(symbol => {
    const price = Math.random() * 1000;
    const probability = Math.random();
    const volumeBreakout = Math.random() * 2;
    const agreementScore = Math.floor(Math.random() * 3);

    const signal = (probability > 0.6 && agreementScore >= 2) ? "BUY" : null;

    scanOutput.push({
      symbol,
      price,
      probability,
      volume: Math.floor(Math.random()*100000),
      volumeBreakout,
      indexTrend: "UP",
      agreementScore,
      signal,
      reason: "Base logic"
    });
  });

}, 3000);

app.listen(PORT, () => console.log("Server running on port " + PORT));