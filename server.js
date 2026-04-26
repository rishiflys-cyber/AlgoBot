require('dotenv').config();
const express = require('express');
const KiteConnect = require("kiteconnect").KiteConnect;

const app = express();
const PORT = process.env.PORT || 3000;

let kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });
let accessToken = null;

let capital = 0;

// LOGIN
app.get('/login', (req, res) => {
  const url = kite.getLoginURL();
  res.redirect(url);
});

// REDIRECT
app.get('/redirect', async (req, res) => {
  const requestToken = req.query.request_token;

  try {
    const response = await kite.generateSession(requestToken, process.env.KITE_API_SECRET);
    accessToken = response.access_token;
    kite.setAccessToken(accessToken);

    res.send("Login success");
  } catch (err) {
    res.send("Error in login");
  }
});

// DASHBOARD
app.get('/', async (req, res) => {
  if (accessToken) {
    try {
      const margins = await kite.getMargins();
      capital = margins.equity.available.cash;
    } catch (e) {}
  }

  res.json({
    capital,
    accessToken: accessToken ? "ACTIVE" : "NOT_LOGGED_IN"
  });
});

app.listen(PORT, () => console.log("Server running on " + PORT));