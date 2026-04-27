
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const KiteConnect = require("kiteconnect").KiteConnect;

const app = express();
const PORT = process.env.PORT || 3000;

const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });

let state = {
  capital: 100000,
  serverIP: null,
  mode: "LIVE"
};

// FIX: ensure login route exists
app.get('/login', (req, res) => {
  try {
    const url = kite.getLoginURL();
    res.redirect(url);
  } catch (e) {
    res.send("Login init error: " + e.message);
  }
});

// FIX: redirect handler
app.get('/redirect', async (req, res) => {
  try {
    const session = await kite.generateSession(
      req.query.request_token,
      process.env.KITE_API_SECRET
    );

    kite.setAccessToken(session.access_token);

    const ip = await axios.get("https://api.ipify.org?format=json");
    state.serverIP = ip.data.ip;

    res.send("Login success | IP: " + state.serverIP);

  } catch (e) {
    res.send("Login failed: " + e.message);
  }
});

// health check
app.get('/', (req, res) => {
  res.send("AlgoBot V47 running");
});

// performance endpoint
app.get('/performance', (req, res) => {
  res.json(state);
});

app.listen(PORT, () => {
  console.log("V47 LOGIN FIX RUNNING");
});
