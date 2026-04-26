require('dotenv').config();
const express = require('express');
const KiteConnect = require("kiteconnect").KiteConnect;

const app = express();
const PORT = process.env.PORT || 3000;

let kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

// 🔒 Persist token in memory (Railway-safe during uptime)
let accessToken = process.env.ACCESS_TOKEN || null;

if (accessToken) {
  kite.setAccessToken(accessToken);
}

// ===== LOGIN =====
app.get('/login', (req, res) => {
  res.redirect(kite.getLoginURL());
});

// ===== REDIRECT =====
app.get('/redirect', async (req, res) => {
  try {
    const session = await kite.generateSession(
      req.query.request_token,
      process.env.KITE_API_SECRET
    );

    accessToken = session.access_token;
    kite.setAccessToken(accessToken);

    console.log("✅ Access Token Set:", accessToken);

    res.send("Login success. Token stored.");
  } catch (err) {
    console.error("❌ Login Error:", err.message);
    res.send("Login failed");
  }
});

// ===== DASHBOARD =====
app.get('/', async (req, res) => {
  let capital = 0;

  if (accessToken) {
    try {
      const margins = await kite.getMargins();
      console.log("💰 Margins Response:", margins);

      capital = margins.equity.available.cash || 0;

    } catch (err) {
      console.error("❌ Margin Fetch Error:", err.message);
    }
  }

  res.json({
    capital,
    accessToken: accessToken ? "ACTIVE" : "NOT_LOGGED_IN"
  });
});

app.listen(PORT, () => console.log("Server running on " + PORT));