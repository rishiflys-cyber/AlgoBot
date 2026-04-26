
require('dotenv').config();
const express = require('express');
const KiteConnect = require("kiteconnect").KiteConnect;

const app = express();
const PORT = process.env.PORT || 3000;

let kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

// ===== FIX: ensure login route exists =====
app.get('/login', (req, res) => {
  try {
    const loginUrl = kite.getLoginURL();
    return res.redirect(loginUrl);
  } catch (e) {
    return res.send("Login route error: " + e.message);
  }
});

// ===== redirect handler =====
app.get('/redirect', async (req, res) => {
  try {
    const request_token = req.query.request_token;
    if (!request_token) return res.send("Missing request_token");

    const session = await kite.generateSession(request_token, process.env.KITE_API_SECRET);
    kite.setAccessToken(session.access_token);

    res.send("Login success");
  } catch (e) {
    res.send("Login failed: " + e.message);
  }
});

// ===== health =====
app.get('/', (req, res) => {
  res.json({ status: "ok", message: "Login route fixed" });
});

app.listen(PORT, () => console.log("LOGIN FIX RUNNING"));
